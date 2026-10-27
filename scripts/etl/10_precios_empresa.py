"""
Corrige la lista de precios de una empresa, y las guias que todavia no se
facturaron.

El problema
-----------
Cambiar el precio en la ficha de la empresa rige para las guias **nuevas**.
Las que ya existen guardan su propio `precio_unidad`, a proposito: si a mitad
de mes cambia un precio, las guias viejas conservan el suyo y la factura
cuadra contra lo que se acordo ese dia.

Eso esta bien casi siempre. No sirve cuando el precio con el que se venian
cargando las guias estaba mal: ahi la factura sale con el error adentro, y
cambiar la lista no lo arregla.

Este script hace las dos cosas: la lista y las guias sin facturar.

Lo que NO toca, nunca
---------------------
  1. Guias ya facturadas. Si una guia esta en `facturas_guias`, su precio ya
     se emitio en un documento tributario: cambiarlo descuadra la factura
     contra la base.
  2. Lineas sin precio (`precio_unidad` nulo). Son las que vinieron del
     Access sin valorizar. Ponerles precio ahora no es corregir un error, es
     inventar un cobro que nunca existio.
  3. Guias anuladas.
  4. Cualquier prenda que no este en el mapa PRECIOS de abajo.

Uso
---
  python scripts/etl/10_precios_empresa.py            # simulacion
  python scripts/etl/10_precios_empresa.py --apply    # escribe

Sin --apply no escribe nada.
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
# Que empresa y que precios. Es lo unico que se edita para volver a usarlo.
# ---------------------------------------------------------------------------
RUT_EMPRESA = "76095839-5"   # Inversiones Contesse y Donoso (Casa Vieja Vitacura)

# Desde que guia se corrige. La #1646 del 29-08-2026 es la primera que se
# cargo en la app; todo lo anterior vino del Access sin precio. El corte va
# explicito y no se deduce de "tiene precio", para que el alcance quede
# escrito y se pueda auditar despues.
DESDE_GUIA = 1646

PRECIOS = {
    "002": ("Carpeta", 550),
    "001": ("Mantel", 850),
    "045": ("Mantel Blanco cuadrado", 850),
    "019": ("Mantel Ovalado", 1800),
    "038": ("Mantel Repaso", 500),
    "003": ("Servilleta", 200),
}


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

    def _escribir(self, metodo: str, ruta: str, cuerpo, extra=None) -> None:
        datos = json.dumps(cuerpo).encode()
        cab = dict(self.headers)
        if extra:
            cab.update(extra)
        req = urllib.request.Request(f"{self.url}/rest/v1/{ruta}",
                                     data=datos, headers=cab, method=metodo)
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            sys.exit(f"Fallo {metodo} {ruta}: {e.read().decode()[:400]}")

    def upsert_precio(self, rut: str, producto_id: str, precio: int) -> None:
        self._escribir(
            "POST", "empresa_productos",
            {"rut_empresa": rut, "producto_empresa_id": producto_id, "precio": precio},
            {"Prefer": "resolution=merge-duplicates"},
        )

    def actualizar_linea(self, linea_id: int, precio: int, importe: int) -> None:
        self._escribir("PATCH", f"pedidos_empresa_items?id=eq.{linea_id}",
                       {"precio_unidad": precio, "importe": importe})


def clp(n) -> str:
    if n is None:
        return "sin precio"
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
    print("PRECIOS DE EMPRESA" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 74)

    empresa = supa.traer(
        f"clientes_empresa?select=rut,nombre,alias&rut=eq.{RUT_EMPRESA}")
    if not empresa:
        sys.exit(f"No existe la empresa {RUT_EMPRESA}")
    e = empresa[0]
    alias = e["alias"] or "sin alias"
    print(f"\nEmpresa: {e['nombre']}  ({alias})  {e['rut']}")

    # ---------------- 1. la lista de precios ----------------
    actuales = {
        r["producto_empresa_id"]: r["precio"]
        for r in supa.traer("empresa_productos?select=producto_empresa_id,precio"
                            f"&rut_empresa=eq.{RUT_EMPRESA}")
    }

    print("\n" + "-" * 74)
    print("1. LISTA DE PRECIOS   (rige para las guias NUEVAS)")
    print("-" * 74)
    print(f"  {'prenda':<26} {'hoy':>12} {'queda':>12}   que pasa")
    cambios_lista = []
    for pid, (nombre, nuevo) in PRECIOS.items():
        hoy = actuales.get(pid)
        if pid not in actuales:
            que = "SE AGREGA (no estaba asignada)"
            cambios_lista.append((pid, nombre, nuevo))
        elif hoy is None:
            que = "la tenia sin precio"
            cambios_lista.append((pid, nombre, nuevo))
        elif int(float(hoy)) == nuevo:
            que = "ya estaba bien"
        else:
            que = f"baja {clp(hoy)} -> {clp(nuevo)}"
            cambios_lista.append((pid, nombre, nuevo))
        print(f"  {nombre[:26]:<26} {clp(hoy):>12} {clp(nuevo):>12}   {que}")

    # ---------------- 2. las guias sin facturar ----------------
    guias = supa.traer(
        f"pedidos_empresa?select=id,fecha,anulado&rut_empresa=eq.{RUT_EMPRESA}")
    facturadas = {f["pedido_empresa_id"]
                  for f in supa.traer("facturas_guias?select=pedido_empresa_id")}

    tocables = {g["id"]: g for g in guias
                if not g["anulado"]
                and g["id"] not in facturadas
                and g["id"] >= DESDE_GUIA}
    ids = ",".join(str(i) for i in tocables) or "0"
    lineas = supa.traer(
        "pedidos_empresa_items?select=id,pedido_empresa_id,producto_empresa_id,"
        "producto_empresa_nombre,cantidad,precio_unidad,importe"
        f"&pedido_empresa_id=in.({ids})")

    sin_precio = sum(1 for l in lineas if l["precio_unidad"] is None)
    pendientes = []
    for l in lineas:
        pid = l["producto_empresa_id"]
        if pid not in PRECIOS:
            continue
        if l["precio_unidad"] is None:
            continue    # nunca tuvo precio: no es un error, es otra decision
        nuevo = PRECIOS[pid][1]
        if int(float(l["precio_unidad"])) == nuevo:
            continue
        pendientes.append((l, nuevo, nuevo * l["cantidad"]))

    print("\n" + "-" * 74)
    print("2. GUIAS SIN FACTURAR   (esto es lo que cambia la factura)")
    print("-" * 74)
    anteriores = sum(1 for g in guias if g["id"] < DESDE_GUIA)
    print(f"  guias de la empresa            {len(guias):>5}")
    print(f"  anteriores a la #{DESDE_GUIA}         {anteriores:>5}   no se tocan")
    print(f"  ya facturadas o anuladas       "
          f"{len(guias) - anteriores - len(tocables):>5}   no se tocan")
    print(f"  lineas sin precio (del Access) {sin_precio:>5}   no se tocan")
    print(f"  LINEAS A CORREGIR              {len(pendientes):>5}")

    if pendientes:
        por_mes = {}
        for l, nuevo, imp in pendientes:
            mes = tocables[l["pedido_empresa_id"]]["fecha"][:7]
            por_mes.setdefault(mes, []).append((l, nuevo, imp))

        print(f"\n  {'mes':<9} {'lineas':>7} {'se facturaria':>15} "
              f"{'queda en':>13} {'diferencia':>13}")
        th = td = 0.0
        for mes in sorted(por_mes):
            h = sum(float(l["importe"] or 0) for l, _, _ in por_mes[mes])
            d = float(sum(imp for _, _, imp in por_mes[mes]))
            th += h
            td += d
            print(f"  {mes:<9} {len(por_mes[mes]):>7} {clp(h):>15} "
                  f"{clp(d):>13} {clp(d - h):>13}")
        print("  " + "-" * 62)
        print(f"  {'TOTAL':<9} {len(pendientes):>7} {clp(th):>15} "
              f"{clp(td):>13} {clp(td - th):>13}")
        print(f"\n  Con IVA 19%:  {clp(th * 1.19)}  ->  {clp(td * 1.19)}")

        print("\n  primeras diez lineas:")
        for l, nuevo, imp in pendientes[:10]:
            g = tocables[l["pedido_empresa_id"]]
            print(f"    guia #{l['pedido_empresa_id']:<6} {g['fecha'][:10]}  "
                  f"{l['producto_empresa_nombre'][:24]:<24} x{l['cantidad']:<4} "
                  f"{clp(l['precio_unidad']):>8} -> {clp(nuevo):>8}")

    if not args.apply:
        print("\n" + "=" * 74)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 74)
        return 0

    print("\nEscribiendo...")
    for pid, nombre, precio in cambios_lista:
        supa.upsert_precio(RUT_EMPRESA, pid, precio)
        print(f"  lista: {nombre} -> {clp(precio)}")
    for i, (l, nuevo, imp) in enumerate(pendientes, 1):
        supa.actualizar_linea(l["id"], nuevo, imp)
        if i % 10 == 0 or i == len(pendientes):
            print(f"  lineas: {i} / {len(pendientes)}")

    print(f"\nListo: {len(cambios_lista)} precios de lista, "
          f"{len(pendientes)} lineas de guia.")
    print("Las guias ya facturadas y las lineas sin precio quedaron intactas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
