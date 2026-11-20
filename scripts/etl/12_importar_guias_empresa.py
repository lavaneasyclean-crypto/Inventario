"""
Trae de vuelta las guias de una empresa que estan en el Access y no en la app.

El problema
-----------
La migracion corrio el 30-04-2026 y despues el Access siguio usandose. Las
guias cargadas ahi desde entonces nunca llegaron a la app: no estan vacias,
estan ausentes. En Alma eran 132 guias de febrero a octubre, 445 lineas.

La regla contra duplicados
--------------------------
Una guia del Access se importa **solo si ese dia no tiene ninguna guia activa
en la app**. Nada de cruzar por id: los ids del Access y los que asigna la
secuencia de la app ocupan el mismo rango numerico y ya se pisan, asi que
cruzar por id da falsos positivos en las dos direcciones.

La consecuencia de esa regla es deliberada: un dia donde alguien ya cargo algo
a mano no se toca, aunque el Access tenga mas. Esos dias se listan al final
para revisarlos de a uno. Es preferible que falte una guia a que se cobre dos
veces.

Los precios
-----------
Se copian de la lista de la empresa, igual que cuando se carga una guia en la
app. La prenda que no este asignada entra sin precio, que es lo que ya pasa
con el 92% de las lineas que vinieron del Access: inventarle un precio seria
inventar un cobro.

Uso
---
  python scripts/etl/12_importar_guias_empresa.py            # simulacion
  python scripts/etl/12_importar_guias_empresa.py --apply    # escribe

Antes hay que tener el export fresco:
  powershell ./scripts/etl/01_export_access.ps1 -DbPath "...\\Datos.accdb"
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(__file__).resolve().parent / "_out" / "raw"

# ---------------------------------------------------------------------------
# Que empresa. Es lo unico que se edita para volver a usarlo.
# ---------------------------------------------------------------------------
RUT_EMPRESA = "59214430-1"   # Alma Spa


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

    def rpc(self, funcion: str, args: dict):
        req = urllib.request.Request(
            f"{self.url}/rest/v1/rpc/{funcion}",
            data=json.dumps(args).encode(), headers=self.headers, method="POST",
        )
        try:
            return json.load(urllib.request.urlopen(req))
        except urllib.error.HTTPError as e:
            sys.exit(f"Fallo rpc {funcion}: {e.read().decode()[:400]}")


def leer_access() -> tuple[dict[int, dict], dict[int, list[dict]]]:
    guias: dict[int, dict] = {}
    with (RAW / "Pedido_Empresa.csv").open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if (r.get("Rut_Empresa") or "").strip() != RUT_EMPRESA:
                continue
            pid = (r.get("ID_Pedido_Empresa") or "").strip()
            if pid.isdigit():
                guias[int(pid)] = r
    det: dict[int, list[dict]] = collections.defaultdict(list)
    with (RAW / "Detalle_Pedido_Empresa.csv").open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            pid = (r.get("ID_Pedido_Empresa") or "").strip()
            if pid.isdigit():
                det[int(pid)].append(r)
    return guias, det


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
    print("IMPORTAR GUIAS DESDE EL ACCESS"
          + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 74)

    empresa = supa.traer(
        f"clientes_empresa?select=rut,nombre,alias&rut=eq.{RUT_EMPRESA}")
    if not empresa:
        sys.exit(f"No existe la empresa {RUT_EMPRESA}")
    print(f"\nEmpresa: {empresa[0]['nombre']}  ({empresa[0]['alias']})")

    precios = {
        p["producto_empresa_id"]: p["precio"]
        for p in supa.traer("empresa_productos?select=producto_empresa_id,precio"
                            f"&rut_empresa=eq.{RUT_EMPRESA}")
    }

    # Lo que la app ya tiene, con sus lineas. El embed lo resuelve la base:
    # contar a mano trayendo todas las lineas sueltas se come el tope de mil
    # filas de PostgREST y hace parecer vacias a guias que no lo estan.
    enApp = supa.traer(
        "pedidos_empresa?select=id,fecha,anulado,pedidos_empresa_items(id)"
        f"&rut_empresa=eq.{RUT_EMPRESA}")
    diasOcupados = {g["fecha"][:10] for g in enApp if not g["anulado"]}
    # Las guias que vinieron en la migracion conservaron el id del Access,
    # asi que un id que ya existe en la app con la misma fecha es la misma
    # guia y no un choque. Sin esta distincion el informe lista como choque
    # todo lo que ya se sincronizo bien, y el que lo lee no encuentra los
    # pocos que si hay que mirar.
    yaMigradas = {g["id"]: g["fecha"][:10] for g in enApp}
    print(f"  en la app:     {len(enApp)} guias, en {len(diasOcupados)} dias")

    accGuias, accDet = leer_access()
    print(f"  en el Access:  {len(accGuias)} guias, "
          f"{sum(len(accDet[i]) for i in accGuias)} lineas")

    nuevas, chocan, vacias = [], [], []
    for pid, g in sorted(accGuias.items(), key=lambda x: x[1]["Fecha"]):
        dia = (g["Fecha"] or "")[:10]
        lineas = [d for d in accDet.get(pid, [])
                  if (d.get("Cantidad") or "").strip().isdigit()
                  and int(d["Cantidad"]) > 0]
        if yaMigradas.get(pid) == dia:
            continue    # misma guia, ya esta en la app
        if dia in diasOcupados:
            chocan.append((pid, dia, lineas))
            continue
        if not lineas:
            vacias.append((pid, dia))
            continue
        nuevas.append((pid, g, lineas))

    print("\n" + "-" * 74)
    print(f"  A IMPORTAR               {len(nuevas):>4} guias, "
          f"{sum(len(l) for _, _, l in nuevas):>4} lineas")
    print(f"  ya estaban sincronizadas  {len(accGuias) - len(nuevas) - len(chocan) - len(vacias):>4}   nada que hacer")
    print(f"  dia ya ocupado en la app {len(chocan):>4}   no se tocan, revisar")
    print(f"  sin lineas en el Access  {len(vacias):>4}   no se crean vacias")
    print("-" * 74)

    porMes: dict[str, list] = collections.defaultdict(list)
    for pid, g, lineas in nuevas:
        porMes[g["Fecha"][:7]].append((pid, lineas))
    print(f"\n  {'mes':<9} {'guias':>6} {'lineas':>7} {'con precio':>11} {'sin precio':>11}")
    for mes in sorted(porMes):
        gs = porMes[mes]
        con = sum(1 for _, ls in gs for d in ls
                  if precios.get((d.get("ID_Producto") or "").strip()) is not None)
        tot = sum(len(ls) for _, ls in gs)
        print(f"  {mes:<9} {len(gs):>6} {tot:>7} {con:>11} {tot - con:>11}")

    print("\n  primeras cinco:")
    for pid, g, lineas in nuevas[:5]:
        txt = ", ".join(f"{d['Nombre_Producto']} x{d['Cantidad']}" for d in lineas)
        print(f"    access #{pid}  {g['Fecha'][:10]}  {txt[:56]}")

    if chocan:
        print()
        print(f"  dias donde el Access tiene una guia que la app no ({len(chocan)}).")
        print("  No se crean: puede ser la misma cargada distinto, o una")
        print("  segunda guia de ese dia. Hay que mirarlas de a una.")
        for pid, dia, lineas in chocan:
            txt = ", ".join(f"{d['Nombre_Producto']} x{d['Cantidad']}" for d in lineas)
            print(f"    {dia}  access #{pid}  {txt[:52]}")

    if not args.apply:
        print("\n" + "=" * 74)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 74)
        return 0

    print("\nEscribiendo...")
    for n, (pid, g, lineas) in enumerate(nuevas, 1):
        items = []
        for d in lineas:
            prod = (d.get("ID_Producto") or "").strip() or None
            items.append({
                "producto_empresa_id": prod,
                "producto_empresa_nombre": (d.get("Nombre_Producto") or "").strip()
                                           or "(sin nombre)",
                "precio_unidad": precios.get(prod),
                "cantidad": int(d["Cantidad"]),
                "detalle_prenda": (d.get("Detalle_Prenda_Empresa") or "").strip() or None,
                "bolsa_id": None,
            })
        nuevo = supa.rpc("crear_pedido_empresa", {
            "p_pedido": {
                "rut_empresa": RUT_EMPRESA,
                "alias": (g.get("Alias") or "").strip() or None,
                "fecha": g["Fecha"],
                "detalle": (g.get("Detalle") or "").strip() or None,
                "express": False,
            },
            "p_items": items,
        })
        if n % 20 == 0 or n == len(nuevas):
            print(f"  {n} / {len(nuevas)}   (ultima: access #{pid} -> app #{nuevo})")

    print(f"\nListo: {len(nuevas)} guias creadas.")
    if chocan:
        print(f"Quedaron {len(chocan)} dias sin tocar porque ya tenian guia.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
