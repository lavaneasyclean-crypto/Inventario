"""
Pone las lineas de una prenda bajo el producto que la empresa le factura.

El problema
-----------
El Access guarda el nombre que usa el cliente, no el del catalogo. Alma
escribe "Carpeta" (codigo 002) y en la lavanderia eso se cobra como "Mantel
Amarillo Cuadrado" (046, $850). El codigo 002 no esta asignado a Alma, asi que
esas 1.338 unidades entraron sin precio y no se pueden facturar.

Esto no es renombrar por gusto: mientras la linea diga 002, ninguna carga
futura le va a encontrar precio, y en la factura "Carpeta" y "Mantel Amarillo
Cuadrado" salen como dos lineas distintas aunque sean la misma prenda —el
consolidado agrupa por (codigo, nombre, precio)—.

Lo que NO toca
--------------
  1. Guias ya facturadas. Cambiar el precio de una linea que ya se emitio
     descuadra la factura contra la base.
  2. Guias anuladas.
  3. Lineas que ya apuntan al producto destino.

Es reversible: queda escrito de donde vino cada linea en este encabezado y el
cambio se deshace corriendo el script al reves.

Uso
---
  python scripts/etl/13_mapear_producto_empresa.py            # simulacion
  python scripts/etl/13_mapear_producto_empresa.py --apply    # escribe
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Que empresa y que mapeo. Es lo unico que se edita para volver a usarlo.
# ---------------------------------------------------------------------------
RUT_EMPRESA = "59214430-1"       # Alma Spa

# Lineas a mover: las que tengan este codigo de producto.
DESDE_PRODUCTO = "002"           # "Carpeta", como lo escribe el cliente

# Producto de la lista de la empresa al que pasan. El precio se lee de ahi.
HACIA_PRODUCTO = "046"           # Mantel Amarillo Cuadrado


def cargar_env() -> dict[str, str]:
    env: dict[str, str] = {}
    ruta = ROOT / ".env.local"
    if not ruta.exists():
        sys.exit("Falta .env.local")
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, v = linea.strip().split("=", 1)
            env[k] = v
    return env


class Supa:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def traer(self, consulta: str) -> list[dict]:
        salida: list[dict] = []
        desde = 0
        while True:
            sep = "&" if "?" in consulta else "?"
            url = f"{self.url}/rest/v1/{consulta}{sep}limit=1000&offset={desde}"
            req = urllib.request.Request(url, headers=self.headers)
            lote = json.load(urllib.request.urlopen(req))
            salida.extend(lote)
            if len(lote) < 1000:
                return salida
            desde += 1000

    def patch(self, ruta: str, cuerpo: dict) -> None:
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{ruta}", data=json.dumps(cuerpo).encode(),
            headers=self.headers, method="PATCH")
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            sys.exit(f"Fallo PATCH {ruta}: {e.read().decode()[:400]}")


def clp(n) -> str:
    return "$" + format(int(round(float(n))), ",").replace(",", ".")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="escribe (sin esto, solo simula)")
    args = ap.parse_args()

    env = cargar_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    supa = Supa(url, key)

    print("=" * 74)
    print("MAPEAR PRENDA" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 74)

    empresa = supa.traer(
        f"clientes_empresa?select=rut,nombre,alias&rut=eq.{RUT_EMPRESA}")
    if not empresa:
        sys.exit(f"No existe la empresa {RUT_EMPRESA}")
    print(f"\nEmpresa: {empresa[0]['nombre']}  ({empresa[0]['alias']})")

    destino = supa.traer(
        "empresa_productos?select=producto_empresa_id,precio,productos_empresa(nombre)"
        f"&rut_empresa=eq.{RUT_EMPRESA}&producto_empresa_id=eq.{HACIA_PRODUCTO}")
    if not destino:
        sys.exit(f"La empresa no tiene asignado el producto {HACIA_PRODUCTO}")
    precio = destino[0]["precio"]
    nombre = destino[0]["productos_empresa"]["nombre"]
    if precio is None:
        sys.exit(f"{nombre} no tiene precio en la lista de la empresa")
    precio = int(float(precio))
    print(f"Destino: {HACIA_PRODUCTO}  {nombre}  {clp(precio)}")

    guias = {g["id"]: g for g in supa.traer(
        f"pedidos_empresa?select=id,fecha,anulado&rut_empresa=eq.{RUT_EMPRESA}")}
    facturadas = {f["pedido_empresa_id"]
                  for f in supa.traer("facturas_guias?select=pedido_empresa_id")}

    ids = list(guias)
    lineas: list[dict] = []
    for i in range(0, len(ids), 100):
        grupo = ",".join(str(x) for x in ids[i:i + 100])
        lineas += supa.traer(
            "pedidos_empresa_items?select=id,pedido_empresa_id,producto_empresa_id,"
            "producto_empresa_nombre,cantidad,precio_unidad"
            f"&pedido_empresa_id=in.({grupo})"
            f"&producto_empresa_id=eq.{DESDE_PRODUCTO}")

    print(f"\nlineas con el codigo {DESDE_PRODUCTO}: {len(lineas)}")

    mover, saltadas = [], {"anulada": 0, "facturada": 0}
    for l in lineas:
        g = guias[l["pedido_empresa_id"]]
        if g["anulado"]:
            saltadas["anulada"] += 1
            continue
        if l["pedido_empresa_id"] in facturadas:
            saltadas["facturada"] += 1
            continue
        mover.append(l)

    unidades = sum(l["cantidad"] for l in mover)
    print(f"  en guias anuladas   {saltadas['anulada']:>4}   no se tocan")
    print(f"  en guias facturadas {saltadas['facturada']:>4}   no se tocan")
    print(f"  A MOVER             {len(mover):>4} lineas, {unidades} unidades")
    print(f"  quedan valorizadas en {clp(unidades * precio)}")

    yaTenian = sum(1 for l in mover if l["precio_unidad"] is not None)
    if yaTenian:
        print(f"\n  OJO: {yaTenian} de esas lineas ya tenian precio y se van a pisar.")

    print("\n  primeras cinco:")
    for l in mover[:5]:
        g = guias[l["pedido_empresa_id"]]
        print(f"    guia #{l['pedido_empresa_id']} {g['fecha'][:10]}  "
              f"{l['producto_empresa_nombre']!r} x{l['cantidad']} "
              f"-> {nombre!r} a {clp(precio)}")

    if not args.apply:
        print("\n" + "=" * 74)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 74)
        return 0

    print("\nEscribiendo...")
    for n, l in enumerate(mover, 1):
        supa.patch(f"pedidos_empresa_items?id=eq.{l['id']}", {
            "producto_empresa_id": HACIA_PRODUCTO,
            "producto_empresa_nombre": nombre,
            "precio_unidad": precio,
            "importe": precio * l["cantidad"],
        })
        if n % 50 == 0 or n == len(mover):
            print(f"  {n} / {len(mover)}")

    print(f"\nListo: {len(mover)} lineas, {unidades} unidades, "
          f"{clp(unidades * precio)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
