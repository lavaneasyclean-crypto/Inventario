"""
Anula los pedidos de mostrador que nunca fueron un pedido.

El problema
-----------
La auditoria de octubre 2026 encontro 439 pedidos en estado "recibido", de los
cuales 384 son de hace mas de un mes. Ninguno esta en el taller: hay de 2024 y
2025. Ensucian el resumen del dia, las cuentas y cualquier informe.

De esos, un grupo es distinto a los demas: **no tienen ni una sola prenda
cargada**. No son ropa que quedo sin retirar, son registros que alguien
empezo a crear y nunca termino. No hay nada que entregar ni que cobrar.

Que hace
--------
Pone en "anulado" los pedidos que cumplen las cuatro condiciones:

  1. estado = recibido
  2. pagado = false
  3. sin ninguna linea en pedidos_items
  4. recibidos hace mas de DIAS_MINIMO dias

Las cuatro juntas. Un pedido de ayer sin prendas puede ser uno que se esta
cargando en este momento; por eso la antiguedad.

Lo que NO toca
--------------
Los pagados y los que tienen prendas quedan como estan, por decision expresa:
un pedido con ropa cargada es ropa que existio, y decidir si se entrego o no
no es algo que deba resolver un script.

Anular no borra: el pedido queda con su historia y se puede revertir desde la
app, uno por uno.

Uso
---
  python scripts/etl/09_anular_pedidos_vacios.py            # simulacion
  python scripts/etl/09_anular_pedidos_vacios.py --apply    # escribe

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

DIAS_MINIMO = 30
TANDA = 100


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

    def anular(self, ids: list[int]) -> None:
        cuerpo = json.dumps({"estado": "anulado"}).encode()
        lista = ",".join(str(i) for i in ids)
        url = f"{self.url}/rest/v1/pedidos?id=in.({lista})"
        req = urllib.request.Request(url, data=cuerpo, headers=self.headers, method="PATCH")
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            sys.exit(f"Fallo al anular: {e.read().decode()[:300]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="escribe (sin esto, solo simula)")
    ap.add_argument("--dias", type=int, default=DIAS_MINIMO,
                    help=f"antiguedad minima en dias (default {DIAS_MINIMO})")
    args = ap.parse_args()

    env = cargar_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    supa = Supa(url, key)

    print("=" * 72)
    print("ANULAR PEDIDOS VACIOS" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 72)

    import datetime
    corte = (datetime.date.today() - datetime.timedelta(days=args.dias)).isoformat()

    pedidos = supa.traer(
        "pedidos?select=id,estado,pagado,total_venta,fecha_recepcion,nombre_cliente"
        "&estado=eq.recibido&pagado=eq.false&order=id"
    )
    con_lineas = {
        i["pedido_id"] for i in supa.traer("pedidos_items?select=pedido_id")
    }

    candidatos = [
        p for p in pedidos
        if p["id"] not in con_lineas
        and (p["fecha_recepcion"] or "")[:10] < corte
    ]

    # Las que se descartan, para que se vea por que no entran.
    con_prendas = [p for p in pedidos if p["id"] in con_lineas]
    recientes = [
        p for p in pedidos
        if p["id"] not in con_lineas and (p["fecha_recepcion"] or "")[:10] >= corte
    ]

    print(f"\nEn proceso e impagos          {len(pedidos):>6}")
    print(f"  con prendas (no se tocan)   {len(con_prendas):>6}")
    print(f"  sin prendas pero recientes  {len(recientes):>6}   (desde {corte})")
    print(f"  A ANULAR                    {len(candidatos):>6}")

    if not candidatos:
        print("\nNada que hacer.")
        return 0

    por_anio: dict[str, int] = {}
    for p in candidatos:
        anio = (p["fecha_recepcion"] or "????")[:4]
        por_anio[anio] = por_anio.get(anio, 0) + 1
    print("\n  por anio de recepcion")
    for anio in sorted(por_anio):
        print(f"    {anio}  {por_anio[anio]:>5}")

    print("\n  primeros diez:")
    for p in candidatos[:10]:
        print(f"    #{p['id']:<7} {(p['fecha_recepcion'] or '')[:10]}  "
              f"{(p['nombre_cliente'] or '(sin nombre)')[:38]}")

    # Una red mas: ningun candidato puede tener plata encima.
    con_plata = [p for p in candidatos if float(p["total_venta"]) != 0]
    if con_plata:
        sys.exit(f"\nDETENIDO: {len(con_plata)} candidatos tienen total distinto de cero. "
                 f"No deberia pasar sin lineas: {[p['id'] for p in con_plata[:5]]}")

    if not args.apply:
        print("\n" + "=" * 72)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 72)
        return 0

    print("\nAnulando...")
    ids = [p["id"] for p in candidatos]
    for i in range(0, len(ids), TANDA):
        tanda = ids[i:i + TANDA]
        supa.anular(tanda)
        print(f"  {min(i + TANDA, len(ids)):>5} / {len(ids)}")

    print(f"\nListo: {len(ids)} pedidos anulados.")
    print("Se revierten uno por uno desde la app si hiciera falta.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
