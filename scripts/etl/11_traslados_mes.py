"""
Crea la guia de traslados del mes para las empresas que cobran el envio
aparte.

El problema
-----------
Termomin y Termochemical pagan $20.000 por cada viaje, uno por guia. Ese
cobro no viene en la planilla de papel ni entra en la grilla de bolsas: el
producto esta marcado "no va en la grilla" justamente porque no es una prenda.

La forma en que se venia resolviendo —y la que este script repite— es una
guia aparte al cierre del mes, con una sola linea: Traslado x N, donde N es
la cantidad de guias reales de ese mes. Asi quedo septiembre:

    #1632  30-09  Termomin        Traslado x4  $20.000   "Traslado - 2026-09"
    #1633  30-09  Termochemical   Traslado x4  $20.000   "Traslado - 2026-09"

En octubre nadie la creo y la facturacion salio sin los envios: $100.000 de
menos en cada empresa.

Lo que NO hace
--------------
  1. No crea la guia dos veces. Si ya hay una guia de traslado para esa
     empresa y ese mes, la saltea. Se puede correr de nuevo sin miedo.
  2. No cuenta las guias anuladas ni las de traslado: N son los viajes de
     verdad.
  3. No toca nada si el mes ya esta facturado. Agregar una guia a un periodo
     ya emitido descuadra la factura contra la base.

Uso
---
  python scripts/etl/11_traslados_mes.py            # simulacion
  python scripts/etl/11_traslados_mes.py --apply    # escribe

Sin --apply no escribe nada.
"""

from __future__ import annotations

import argparse
import calendar
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Que mes y que empresas. Es lo unico que se edita para volver a usarlo.
# ---------------------------------------------------------------------------
MES = "2026-10"

EMPRESAS = [
    "86667200-8",   # Importadora Termomin
    "96868910-K",   # Termochemical Latinoamerica
]

# El producto del envio. El precio NO se escribe aca: se lee de la lista de
# cada empresa, que es la que manda si alguna vez cambia.
PRODUCTO_TRASLADO = "093"


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

    def rpc(self, funcion: str, args: dict):
        datos = json.dumps(args).encode()
        req = urllib.request.Request(
            f"{self.url}/rest/v1/rpc/{funcion}",
            data=datos, headers=self.headers, method="POST",
        )
        try:
            return json.load(urllib.request.urlopen(req))
        except urllib.error.HTTPError as e:
            sys.exit(f"Fallo rpc {funcion}: {e.read().decode()[:400]}")


def clp(n) -> str:
    return "$" + format(int(round(float(n))), ",").replace(",", ".")


def fin_de_mes(mes: str) -> str:
    """Ultimo dia del mes, al mediodia de Chile, en UTC.

    Al mediodia ningun cambio de horario alcanza a correr el dia, que es la
    misma razon por la que la app guarda las fechas asi. Chile esta en UTC-3
    de septiembre a abril y en UTC-4 el resto.
    """
    anio, num = int(mes[:4]), int(mes[5:7])
    dia = calendar.monthrange(anio, num)[1]
    offset = 4 if 5 <= num <= 8 else 3
    return f"{anio:04d}-{num:02d}-{dia:02d}T{12 + offset:02d}:00:00+00:00"


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

    desde = f"{MES}-01"
    hasta = f"{int(MES[:4]) + (MES[5:7] == '12'):04d}-" \
            f"{1 if MES[5:7] == '12' else int(MES[5:7]) + 1:02d}-01"
    fecha_guia = fin_de_mes(MES)

    print("=" * 74)
    print(f"TRASLADOS DE {MES}" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 74)

    facturadas = {f["pedido_empresa_id"]
                  for f in supa.traer("facturas_guias?select=pedido_empresa_id")}

    plan = []
    for rut in EMPRESAS:
        emp = supa.traer(f"clientes_empresa?select=rut,nombre,alias&rut=eq.{rut}")
        if not emp:
            sys.exit(f"No existe la empresa {rut}")
        nombre = emp[0]["alias"] or emp[0]["nombre"]

        precios = supa.traer(
            "empresa_productos?select=precio,productos_empresa(nombre)"
            f"&rut_empresa=eq.{rut}"
            f"&producto_empresa_id=eq.{PRODUCTO_TRASLADO}")
        if not precios or precios[0]["precio"] is None:
            print(f"\n{nombre}: no tiene precio de traslado cargado. Se saltea.")
            continue
        precio = int(float(precios[0]["precio"]))
        nombre_prod = precios[0]["productos_empresa"]["nombre"]

        guias = supa.traer(
            "pedidos_empresa?select=id,fecha,detalle,anulado"
            f"&rut_empresa=eq.{rut}&fecha=gte.{desde}&fecha=lt.{hasta}")

        # Una guia de traslado ya creada tiene el detalle puesto por este
        # mismo script. Si esta, no hay nada que hacer.
        ya = [g for g in guias
              if (g["detalle"] or "").startswith("Traslado") and not g["anulado"]]
        viajes = [g for g in guias
                  if not g["anulado"] and not (g["detalle"] or "").startswith("Traslado")]

        print(f"\n{nombre}  ({rut})")
        print(f"  guias del mes     {len(viajes)}   {[g['id'] for g in viajes]}")

        if ya:
            print(f"  YA EXISTE la guia de traslado #{ya[0]['id']}. No se toca.")
            continue
        if not viajes:
            print("  sin guias en el mes: no hay traslados que cobrar.")
            continue
        emitidas = [g["id"] for g in viajes if g["id"] in facturadas]
        if emitidas:
            print(f"  YA FACTURADAS {emitidas}: agregar un cobro ahora")
            print("  descuadraria la factura contra la base. Se saltea.")
            continue

        total = precio * len(viajes)
        print(f"  se crea           {nombre_prod} x{len(viajes)} a {clp(precio)}"
              f"  =  {clp(total)}")
        print(f"  fecha             {fecha_guia[:10]}")
        print(f"  detalle           Traslado - {MES}")
        plan.append((rut, nombre, nombre_prod, precio, len(viajes), total))

    print()
    if not plan:
        print("=" * 74)
        print("No hay nada que crear.")
        print("=" * 74)
        return 0

    print("-" * 74)
    print(f"A CREAR: {len(plan)} guia(s), {clp(sum(p[5] for p in plan))} en total")
    print("-" * 74)

    if not args.apply:
        print("\nSIMULACION: no se escribio nada. Volve a correr con --apply.")
        return 0

    print("\nEscribiendo...")
    for rut, nombre, nombre_prod, precio, cantidad, total in plan:
        nuevo = supa.rpc("crear_pedido_empresa", {
            "p_pedido": {
                "rut_empresa": rut,
                "alias": None,
                "fecha": fecha_guia,
                "detalle": f"Traslado - {MES}",
                "express": False,
            },
            "p_items": [{
                "producto_empresa_id": PRODUCTO_TRASLADO,
                "producto_empresa_nombre": nombre_prod,
                "precio_unidad": precio,
                "cantidad": cantidad,
                "detalle_prenda": None,
                "bolsa_id": None,
            }],
        })
        print(f"  {nombre}: guia #{nuevo}  {nombre_prod} x{cantidad}  {clp(total)}")

    print("\nListo. Revisa la facturacion del mes antes de emitir.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
