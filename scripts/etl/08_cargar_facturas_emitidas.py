"""
Carga en Finanzas las facturas que ya se emitieron en Haulmer.

Los PDF del SII no traen capa de texto —son una imagen— asi que los montos no
se extraen: se transcriben a mano a FACTURAS, abajo, y el script los escribe.
La transcripcion se verifica sola: si el neto mas el IVA no da el total, no
carga esa fila.

Las facturas entran como PENDIENTES. Marcarlas cobradas se hace desde la app,
que pide la fecha del pago; ponerlas pagadas aca con una fecha inventada seria
peor que no tenerlas.

Idempotente: un folio que ya esta registrado se saltea.

Uso
---
  python scripts/etl/08_cargar_facturas_emitidas.py
  python scripts/etl/08_cargar_facturas_emitidas.py --apply

Sin --apply no escribe nada.
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Empresas que las facturas mencionan y el sistema todavia no tiene. El giro no
# se guarda: `clientes_empresa` no tiene esa columna.
EMPRESAS_NUEVAS = [
    {"rut": "77916643-0", "nombre": "JF Limpieza SpA", "alias": "JF Limpieza",
     "calle": "El Corralero 11945 Lt 73, Dominios del Alba II",
     "comuna": "Las Condes", "correo": "profreshlimpiezaindustrial@gmail.com"},
    {"rut": "76268886-7", "nombre": "Atreyu SpA", "alias": "Atreyu",
     "calle": "Los Herreros 8770", "comuna": "La Reina", "correo": None},
    {"rut": "77594429-3", "nombre": "Inversiones El Cubo SpA", "alias": "El Cubo",
     "calle": "Av. La Dehesa 1570, local 18 SB-118", "comuna": "Lo Barnechea",
     "correo": "administracion@gents.cl"},
]

# folio, rut, fecha de emision, neto, iva, total, tipo
#
# `tipo` es 'express' en los dos documentos de Acacias que cobran solo el
# recargo por servicio express —se reconocen porque sus precios son el 60% de
# los de la factura normal del mismo dia— y 'normal' en el resto.
FACTURAS = [
    (1672, "10521674-2", "2026-08-03",  248050,  47130,  295180, "normal"),
    (1673, "10521674-2", "2026-08-03",  255250,  48498,  303748, "normal"),
    (1674, "76116233-0", "2026-08-03",  118300,  22477,  140777, "normal"),
    (1675, "77060518-0", "2026-08-03", 2531514, 480988, 3012502, "normal"),
    (1676, "76421561-3", "2026-08-03", 1277829, 242788, 1520617, "normal"),
    (1677, "86667200-8", "2026-08-12", 1025250, 194798, 1220048, "normal"),
    (1678, "96868910-K", "2026-08-12",  522850,  99342,  622192, "normal"),
    (1679, "77916643-0", "2026-08-12",  750000, 142500,  892500, "normal"),
    (1680, "77060518-0", "2026-08-19", 1892310, 359539, 2251849, "normal"),
    (1681, "76421561-3", "2026-08-19",  588621, 111838,  700459, "normal"),
    (1682, "77594429-3", "2026-08-31",   47059,   8941,   56000, "normal"),
    (1683, "77916643-0", "2026-08-31",  605256, 114999,  720255, "normal"),
    (1684, "77060518-0", "2026-08-31", 2037290, 387085, 2424375, "normal"),
    (1685, "96620830-9", "2026-09-08", 2246850, 426902, 2673752, "normal"),
    (1686, "96620830-9", "2026-09-08",  129618,  24627,  154245, "express"),
    (1687, "76421561-3", "2026-09-09",  415315,  78910,  494225, "normal"),
    (1688, "86667200-8", "2026-09-14",  796600, 151354,  947954, "normal"),
    (1689, "96868910-K", "2026-09-14",  497050,  94440,  591490, "normal"),
    (1690, "10521674-2", "2026-09-22",  131100,  24909,  156009, "normal"),
    (1691, "10521674-2", "2026-09-22",  178500,  33915,  212415, "normal"),
    (1692, "10521674-2", "2026-09-28",   94200,  17898,  112098, "normal"),
    (1693, "76268886-7", "2026-09-29",  147361,  27999,  175360, "normal"),
    (1694, "76268886-7", "2026-10-01",  252857,  48043,  300900, "normal"),
    (1695, "10521674-2", "2026-09-30",   68400,  12996,   81396, "normal"),
    (1696, "96620830-9", "2026-10-05", 2536720, 481977, 3018697, "normal"),
    (1697, "96620830-9", "2026-10-05",  155502,  29545,  185047, "express"),
    (1698, "86667200-8", "2026-10-05",  712350, 135347,  847697, "normal"),
    (1699, "96868910-K", "2026-10-05",  401200,  76228,  477428, "normal"),
]

# Facturas cuyas guias estan cargadas y se sabe cuales son. Amarrarlas es lo
# que hace que la app avise "la guia #1624 ya esta en la factura #N" si alguien
# vuelve a facturar ese periodo.
GUIAS_DE = {
    1698: ("86667200-8", "2026-09-01", "2026-09-30"),
    1699: ("96868910-K", "2026-09-01", "2026-09-30"),
}

DIAS_VENCIMIENTO = 30


def cargar_env() -> dict[str, str]:
    env = {}
    for l in io.open(ROOT / ".env.local", encoding="utf-8"):
        if "=" in l and not l.startswith("#"):
            k, v = l.split("=", 1)
            env[k.strip()] = v.strip()
    return env


class Supa:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/")
        self.h = {"apikey": key, "Authorization": f"Bearer {key}",
                  "Content-Type": "application/json"}

    def pedir(self, metodo: str, ruta: str, cuerpo=None, prefer: str | None = None):
        h = dict(self.h)
        if prefer:
            h["Prefer"] = prefer
        req = urllib.request.Request(
            f"{self.base}/rest/v1/{ruta}", method=metodo, headers=h,
            data=None if cuerpo is None else json.dumps(cuerpo).encode())
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                crudo = r.read()
                return json.loads(crudo) if crudo else None
        except urllib.error.HTTPError as e:
            detalle = e.read().decode("utf-8", "replace")
            raise SystemExit(f"\nSupabase respondio {e.code} en {metodo} {ruta}:\n  {detalle}")


def mas_dias(fecha: str, dias: int) -> str:
    y, m, d = (int(x) for x in fecha.split("-"))
    return (datetime.date(y, m, d) + datetime.timedelta(days=dias)).isoformat()


def clp(n: int) -> str:
    return f"${n:,}".replace(",", ".")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    # La transcripcion se verifica sola antes de tocar nada.
    malas = [f for f in FACTURAS if f[3] + f[4] != f[5]]
    if malas:
        print("Estas filas no cuadran (neto + IVA != total):")
        for f in malas:
            print(f"   folio {f[0]}: {f[3]} + {f[4]} = {f[3] + f[4]}, dice {f[5]}")
        sys.exit("\nCorregi la transcripcion antes de cargar.")
    print(f"{len(FACTURAS)} facturas, transcripcion cuadrada.")

    env = cargar_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL / la key en .env.local")
    supa = Supa(url, key)

    # ---- Empresas ----
    existentes = {e["rut"] for e in (supa.pedir("GET", "clientes_empresa?select=rut") or [])}
    faltan = [e for e in EMPRESAS_NUEVAS if e["rut"] not in existentes]
    print(f"\nEmpresas: {len(EMPRESAS_NUEVAS) - len(faltan)} de {len(EMPRESAS_NUEVAS)} ya estan")
    for e in faltan:
        print(f"  crear  {e['rut']:14} {e['nombre']}")
        if args.apply:
            supa.pedir("POST", "clientes_empresa", {
                **e, "activo": True, "recargo_express": 0, "usa_bolsas": False,
            }, prefer="return=minimal")
            existentes.add(e["rut"])

    sin_empresa = {f[1] for f in FACTURAS} - existentes
    if sin_empresa and not args.apply:
        # En simulacion las nuevas todavia no existen; solo molesta si falta otra.
        sin_empresa -= {e["rut"] for e in EMPRESAS_NUEVAS}
    if sin_empresa:
        sys.exit(f"\nFaltan empresas para: {', '.join(sorted(sin_empresa))}")

    # ---- Facturas ----
    ya = {str(f["folio"]) for f in
          (supa.pedir("GET", "facturas?select=folio&folio=not.is.null") or [])}

    print(f"\nFacturas ({len(ya)} folios ya registrados):")
    nuevas = 0
    for folio, rut, fecha, neto, iva, total, tipo in FACTURAS:
        if str(folio) in ya:
            print(f"  {folio}  ya registrada, se saltea")
            continue
        marca = "  [express]" if tipo == "express" else ""
        print(f"  {folio}  {rut:14} {fecha}  {clp(total):>12}{marca}")
        nuevas += 1
        if not args.apply:
            continue

        periodo = GUIAS_DE.get(folio)
        fila = supa.pedir("POST", "facturas", {
            "rut_empresa": rut, "tipo": tipo, "folio": str(folio),
            "fecha": fecha, "fecha_vence": mas_dias(fecha, DIAS_VENCIMIENTO),
            "periodo_desde": periodo[1] if periodo else None,
            "periodo_hasta": periodo[2] if periodo else None,
            "neto": neto, "iva": iva, "total": total,
            "estado": "pendiente", "notas": "Emitida en Haulmer",
        }, prefer="return=representation")
        factura_id = fila[0]["id"]

        # Amarrar las guias del periodo, si se sabe cuales son.
        if periodo:
            # Sin filtrar por `anulado`: esa columna la agrega la migracion
            # 0005, que en esta base no estaba aplicada cuando se escribio
            # esto. Para el periodo que se amarra no hay guias anuladas, y
            # filtrar por una columna que puede no existir hace fallar la
            # carga entera a mitad de camino.
            guias = supa.pedir(
                "GET", f"pedidos_empresa?rut_empresa=eq.{periodo[0]}"
                       f"&fecha=gte.{periodo[1]}T00:00:00&fecha=lt.{periodo[2]}T23:59:59"
                       "&select=id") or []
            if guias:
                supa.pedir("POST", "facturas_guias",
                           [{"factura_id": factura_id, "pedido_empresa_id": g["id"]}
                            for g in guias], prefer="return=minimal")
                print(f"        amarradas {len(guias)} guias del periodo")

    total_nuevas = sum(f[5] for f in FACTURAS if str(f[0]) not in ya)
    print(f"\n{nuevas} facturas a registrar, {clp(total_nuevas)} en total.")
    if not args.apply:
        print("\nSIMULACION. Volve a correr con --apply.")
    else:
        print("Entran como PENDIENTES. Marcalas cobradas desde la app, que pide "
              "la fecha del pago.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
