"""
Le copia a cada linea el precio que la empresa ya tiene en su lista.

El problema
-----------
La migracion desde el Access trajo las lineas con su codigo de producto pero
sin el precio. No es que el precio no exista: esta en la lista de la empresa,
donde siempre estuvo. La linea quedo en blanco.

El efecto es que la guia se ve completa pero no se puede facturar: el
consolidado suma importe y ahi no hay nada que sumar. En Alma eran 537 lineas
y 2.276 unidades, casi tres millones de pesos que no aparecian en ninguna
factura.

Esto no decide nada. El precio sale de `empresa_productos`, que es la misma
tabla que lee la app cuando alguien carga una guia a mano. Si una prenda no
esta en la lista de la empresa, o esta sin precio, la linea se deja como esta
y se informa al final: eso es una decision comercial, no un arreglo de datos.

De paso le pone a la linea el nombre del catalogo. El consolidado agrupa por
(codigo, nombre, precio), asi que "Mantel Blanco cuadrado" y "mantel blanco
cuadrado" salen como dos lineas distintas en la factura siendo la misma
prenda.

Lo que NO toca
--------------
  1. Guias ya facturadas. Cambiar el precio de una linea ya emitida descuadra
     la factura contra la base.
  2. Guias anuladas.
  3. Lineas que ya tienen precio. Si esta puesto, alguien lo puso.
  4. Lineas sin codigo de producto: sin codigo no hay precio que copiar. Esas
     las resuelve 13_mapear_producto_empresa.py, que las reconoce por nombre.

Uso
---
  python scripts/etl/14_precios_faltantes.py            # simulacion
  python scripts/etl/14_precios_faltantes.py --apply    # escribe
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Que empresa. Es lo unico que se edita para volver a usarlo.
# ---------------------------------------------------------------------------
RUT_EMPRESA = "59214430-1"       # Alma Spa


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
        """Pagina de a mil: PostgREST corta ahi y lo hace en silencio."""
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

    print("=" * 78)
    print("PRECIOS QUE FALTAN"
          + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 78)

    empresa = supa.traer(
        f"clientes_empresa?select=rut,nombre,alias&rut=eq.{RUT_EMPRESA}")
    if not empresa:
        sys.exit(f"No existe la empresa {RUT_EMPRESA}")
    print(f"\nEmpresa: {empresa[0]['nombre']}  ({empresa[0]['alias']})")

    lista = {
        p["producto_empresa_id"]: (p["productos_empresa"]["nombre"], p["precio"])
        for p in supa.traer(
            "empresa_productos?select=producto_empresa_id,precio,"
            "productos_empresa(nombre)"
            f"&rut_empresa=eq.{RUT_EMPRESA}")
    }
    print(f"  productos en su lista: {len(lista)}")

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
            f"&pedido_empresa_id=in.({grupo})")
    print(f"  lineas de la empresa:  {len(lineas)}  en {len(guias)} guias")

    arreglar: list[dict] = []
    saltadas = {"anulada": 0, "facturada": 0, "con_precio": 0, "sin_codigo": 0}
    # Prendas que la empresa no tiene en su lista, o que la tiene sin precio:
    # no hay nada que copiar y hay que decidir cuanto se le cobra.
    sin_lista: dict[str, dict] = collections.defaultdict(
        lambda: {"lineas": 0, "unidades": 0, "nombres": collections.Counter()})

    for l in lineas:
        if l["precio_unidad"] is not None:
            saltadas["con_precio"] += 1
            continue
        if guias[l["pedido_empresa_id"]]["anulado"]:
            saltadas["anulada"] += 1
            continue
        if l["pedido_empresa_id"] in facturadas:
            saltadas["facturada"] += 1
            continue
        cod = l["producto_empresa_id"]
        if not cod:
            saltadas["sin_codigo"] += 1
            continue
        if cod not in lista or lista[cod][1] is None:
            d = sin_lista[cod]
            d["lineas"] += 1
            d["unidades"] += l["cantidad"]
            d["nombres"][l["producto_empresa_nombre"]] += 1
            continue
        arreglar.append(l)

    print(f"\n  ya tenian precio     {saltadas['con_precio']:>4}   nada que hacer")
    print(f"  en guias anuladas    {saltadas['anulada']:>4}   no se tocan")
    print(f"  en guias facturadas  {saltadas['facturada']:>4}   no se tocan")
    print(f"  sin codigo           {saltadas['sin_codigo']:>4}   las ve el script 13")

    print("\n" + "-" * 78)
    por_cod: dict[str, dict] = collections.defaultdict(
        lambda: {"lineas": 0, "unidades": 0, "renombra": 0})
    for l in arreglar:
        d = por_cod[l["producto_empresa_id"]]
        d["lineas"] += 1
        d["unidades"] += l["cantidad"]
        if l["producto_empresa_nombre"] != lista[l["producto_empresa_id"]][0]:
            d["renombra"] += 1

    total = 0
    print(f"\n  {'cod':<5} {'prenda':<34} {'precio':>8} {'lineas':>7} "
          f"{'unid':>6} {'importe':>12}")
    for cod, d in sorted(por_cod.items(), key=lambda x: -x[1]["unidades"]):
        nombre, precio = lista[cod]
        precio = int(float(precio))
        plata = d["unidades"] * precio
        total += plata
        nota = f"  ({d['renombra']} se renombran)" if d["renombra"] else ""
        print(f"  {cod:<5} {nombre[:34]:<34} {clp(precio):>8} {d['lineas']:>7} "
              f"{d['unidades']:>6} {clp(plata):>12}{nota}")

    print("\n" + "-" * 78)
    print(f"A ARREGLAR: {len(arreglar)} lineas, "
          f"{sum(l['cantidad'] for l in arreglar)} unidades, {clp(total)}")
    print("-" * 78)

    if sin_lista:
        pend_l = sum(d["lineas"] for d in sin_lista.values())
        pend_u = sum(d["unidades"] for d in sin_lista.values())
        print(f"\n  Quedan sin precio {pend_l} lineas ({pend_u} unidades) de prendas")
        print("  que la empresa no tiene en su lista. No se inventa un cobro:")
        print("  hay que agregarlas a su lista con precio, o mapearlas a una")
        print("  prenda que si tenga (script 13).")
        print(f"\n  {'cod':<5} {'como figura en las lineas':<40} {'lineas':>7} {'unid':>6}")
        for cod, d in sorted(sin_lista.items(), key=lambda x: -x[1]["unidades"]):
            nom = d["nombres"].most_common(1)[0][0]
            en_lista = "  (esta en su lista SIN precio)" if cod in lista else ""
            print(f"  {cod:<5} {repr(nom)[:40]:<40} {d['lineas']:>7} "
                  f"{d['unidades']:>6}{en_lista}")

    if not args.apply:
        print("\n" + "=" * 78)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 78)
        return 0

    print("\nEscribiendo...")
    for n, l in enumerate(arreglar, 1):
        nombre, precio = lista[l["producto_empresa_id"]]
        precio = int(float(precio))
        supa.patch(f"pedidos_empresa_items?id=eq.{l['id']}", {
            "producto_empresa_nombre": nombre,
            "precio_unidad": precio,
            "importe": precio * l["cantidad"],
        })
        if n % 100 == 0 or n == len(arreglar):
            print(f"  {n} / {len(arreglar)}")

    print(f"\nListo: {len(arreglar)} lineas, "
          f"{sum(l['cantidad'] for l in arreglar)} unidades, {clp(total)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
