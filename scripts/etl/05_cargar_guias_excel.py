"""
Carga las guias de una empresa desde su planilla mensual de facturacion.

Desde septiembre 2026 la planilla es la fuente de verdad para los pedidos de
empresa; el Access sigue siendo la fuente para los pedidos de mostrador.

La planilla es una grilla: cada fila una prenda, cada columna un dia del mes.
Debajo de la grilla hay una fila "Guias" con el numero de guia de cada dia
(g1562, g1563...), que es el mismo ID que usa el pedido. Se respeta ese numero
en vez de generar uno nuevo, asi la numeracion sigue siendo la que la empresa
ya conoce.

La hoja trae la grilla partida en bloques (dias 1-15, 16-31) y un bloque final
con los precios; solo se leen los bloques que tienen fila "Guias".

Reemplazo, no acumulacion: las guias que aparecen en la planilla se borran y se
vuelven a crear con lo que dice la planilla. Una guia que este en la base y no
en el Excel no se toca.

Uso
---
  python scripts/etl/05_cargar_guias_excel.py <planilla.xlsx> --periodo 2026-09
  python scripts/etl/05_cargar_guias_excel.py <planilla.xlsx> --periodo 2026-09 --apply

Sin --apply no escribe nada.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]

# Vocabulario propio de las planillas. Se comparte con 03_sync.
EQUIVALENCIAS = {
    "cobertores": "018", "batas": "055", "cortina de bano pequena": "048",
    "sabana lisa 1plz": "024", "sabana lisa 1 5plz": "025",
    "sabana lisa 2plz": "026", "sabana lisa king": "027",
    "fundas almohadas": "011", "frazada": "017",
    "funda cojin pequeno": "029", "funda cojin largo": "030",
    "pieceras": "067", "toalla grande": "004", "toalla pequena": "005",
}

# Debajo de la grilla, la planilla repite las prendas con su precio acordado:
#   Prendas | Cantidad | Precio | Total
# De ahi salen los precios, asi cada carga mensual es autocontenida y no
# dependemos de listas sueltas que se desactualizan.
CAB_PRECIOS = ("prendas", "cantidad", "precio")

FIN_DE_GRILLA = ("total", "guia", "guía", "neto", "iva", "observ", "prendas")


def norm(t: object) -> str:
    t = unicodedata.normalize("NFD", str(t or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
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
        with urllib.request.urlopen(req, timeout=60) as r:
            crudo = r.read()
            return json.loads(crudo) if crudo else None


# ---------------------------------------------------------------------------
# Lectura de la planilla
# ---------------------------------------------------------------------------
def leer_planilla(ruta: Path) -> tuple[str, dict[str, dict[str, int]], dict[str, int]]:
    """Devuelve (rut, {guia: {prenda: cantidad}}, {guia: dia})."""
    ws = openpyxl.load_workbook(ruta, data_only=True)[
        openpyxl.load_workbook(ruta).sheetnames[0]]

    rut = ""
    for fila in ws.iter_rows(min_row=1, max_row=6, values_only=True):
        celdas = [str(c).strip() for c in fila if c is not None]
        for i, c in enumerate(celdas):
            if c.lower() == "rut" and i + 1 < len(celdas):
                rut = re.sub(r"[^\dkK\-]", "", celdas[i + 1]).upper()

    guias: dict[str, dict[str, int]] = defaultdict(dict)
    dia_de: dict[str, int] = {}

    filas = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))
    for i, fila in enumerate(filas):
        # Un bloque arranca en la fila que dice "Prendas" en la primera celda y
        # trae los numeros de dia al lado. Sin esa marca no alcanza: una fila
        # de cantidades como "Sabana 1,5plz | 2 | 8 | 14 | 4 | 1" tambien son
        # cinco numeros entre 1 y 31 y se confunde con un encabezado.
        if norm(fila[0]) != "prendas":
            continue
        dias = {j: int(v) for j, v in enumerate(fila)
                if str(v).strip().isdigit() and 1 <= int(v) <= 31}
        if not dias:
            continue

        # Las prendas van hasta que aparece la fila "Guias"; ahi estan los ids.
        prendas: list[tuple[int, str]] = []
        col_guia: dict[int, str] = {}
        for k in range(i + 1, len(filas)):
            a = filas[k][0]
            if a is None or not str(a).strip():
                continue
            t = str(a).strip()
            if norm(t).startswith("guia"):
                for j in dias:
                    v = filas[k][j] if j < len(filas[k]) else None
                    if v is not None and str(v).strip():
                        col_guia[j] = re.sub(r"[^\d]", "", str(v))
                break
            if norm(t).startswith(FIN_DE_GRILLA):
                break
            prendas.append((k, t))

        if not col_guia:
            continue  # bloque de precios, no de cantidades

        for j, guia in col_guia.items():
            dia_de[guia] = dias[j]
            for k, prenda in prendas:
                v = filas[k][j] if j < len(filas[k]) else None
                if isinstance(v, (int, float)) and v:
                    guias[guia][prenda] = guias[guia].get(prenda, 0) + int(v)

    return rut, guias, dia_de


def leer_precios(ws) -> dict[str, int]:
    """Prendas y precio unitario del bloque de precios."""
    filas = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))
    for i, fila in enumerate(filas):
        cab = [norm(c) for c in fila[:4]]
        if cab[:3] != list(CAB_PRECIOS):
            continue
        col = cab.index("precio")
        precios: dict[str, int] = {}
        for f in filas[i + 1:]:
            a = f[0]
            if a is None or not str(a).strip():
                continue
            t = str(a).strip()
            if norm(t).startswith(FIN_DE_GRILLA):
                break
            v = f[col] if col < len(f) else None
            if isinstance(v, (int, float)):
                precios[t] = round(v)
        return precios
    return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("planilla")
    ap.add_argument("--periodo", required=True, help="mes de la planilla, YYYY-MM")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not re.fullmatch(r"\d{4}-\d{2}", args.periodo):
        sys.exit("--periodo va como YYYY-MM")

    rut, guias, dia_de = leer_planilla(Path(args.planilla))
    if not guias:
        sys.exit("La planilla no tiene fila 'Guias': no se puede saber a que pedido va cada dia.")

    env = cargar_env()
    supa = Supa(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    emp = supa.pedir("GET", f"clientes_empresa?select=rut,nombre&rut=eq.{rut}")
    if not emp:
        sys.exit(f"No hay empresa con RUT {rut} en la base.")
    nombre_emp = emp[0]["nombre"]

    cat = {p["id"]: p["nombre"] for p in supa.pedir(
        "GET", "productos_empresa?select=id,nombre&limit=2000")}
    por_nombre = {norm(v): k for k, v in cat.items()}
    precios = {p["producto_empresa_id"]: p["precio"] for p in supa.pedir(
        "GET", f"empresa_productos?select=producto_empresa_id,precio&rut_empresa=eq.{rut}&limit=500")}

    # --- Catalogo y precios, sacados de la misma planilla -------------------
    ws_precios = openpyxl.load_workbook(Path(args.planilla), data_only=True)
    precios_planilla = leer_precios(ws_precios[ws_precios.sheetnames[0]])

    a_crear: list[tuple[str, int]] = []
    a_fijar: list[tuple[str, str, int]] = []
    for prenda, precio in precios_planilla.items():
        cod = por_nombre.get(norm(prenda)) or EQUIVALENCIAS.get(norm(prenda))
        if cod is None:
            a_crear.append((prenda, precio))
        elif precios.get(cod) != precio:
            a_fijar.append((cod, prenda, precio))

    if precios_planilla:
        print(f"  catalogo de la planilla : {len(precios_planilla)} prendas")
        if a_crear:
            print(f"    crear en el catalogo  : {len(a_crear)}")
            for n, pr in a_crear:
                print(f"       + {n[:30]:<32} ${pr:,}".replace(",", "."))
        if a_fijar:
            print(f"    precios a fijar       : {len(a_fijar)}")
            for cod, n, pr in a_fijar[:8]:
                antes = precios.get(cod)
                print(f"       {cod} {cat.get(cod, n)[:26]:<28} "
                      + (f"{antes} -> {pr}" if antes is not None else f"(sin precio) -> {pr}"))

    if args.apply and (a_crear or a_fijar):
        for nombre_p, precio in a_crear:
            nuevo = supa.pedir("POST", "rpc/crear_producto_empresa",
                               {"p_rut_empresa": rut, "p_nombre": nombre_p, "p_precio": precio})
            cat[nuevo] = nombre_p
            por_nombre[norm(nombre_p)] = nuevo
            precios[nuevo] = precio
            print(f"  creado  {nuevo}  {nombre_p}")
        if a_fijar:
            supa.pedir("POST", "empresa_productos?on_conflict=rut_empresa,producto_empresa_id",
                       [{"rut_empresa": rut, "producto_empresa_id": c, "precio": pr}
                        for c, _, pr in a_fijar],
                       prefer="resolution=merge-duplicates,return=minimal")
            for c, _, pr in a_fijar:
                precios[c] = pr
            print(f"  precios fijados: {len(a_fijar)}")

    # Resolver cada prenda de la planilla a un codigo del catalogo.
    sin_codigo, sin_precio = set(), set()
    for items in guias.values():
        for prenda in items:
            cod = por_nombre.get(norm(prenda)) or EQUIVALENCIAS.get(norm(prenda))
            if not cod:
                sin_codigo.add(prenda)
            elif precios.get(cod) is None:
                sin_precio.add(f"{cod} {cat.get(cod, prenda)}")

    print(f"{nombre_emp} ({rut})  —  periodo {args.periodo}")
    print(f"  guias en la planilla : {len(guias)}")
    print(f"  unidades             : {sum(sum(i.values()) for i in guias.values())}")
    for guia in sorted(guias, key=int):
        print(f"     g{guia}  dia {dia_de[guia]:>2}   {len(guias[guia]):>2} prendas"
              f"   {sum(guias[guia].values()):>4} u")

    if sin_codigo:
        print(f"\n  PRENDAS SIN CODIGO ({len(sin_codigo)}):")
        for p in sorted(sin_codigo):
            print(f"     {p}")
    if sin_precio:
        print(f"\n  SIN PRECIO PARA ESTA EMPRESA ({len(sin_precio)}):")
        for p in sorted(sin_precio):
            print(f"     {p}")
    if sin_codigo or sin_precio:
        sys.exit("\nNo se carga nada hasta resolver eso: una guia a medias es peor que ninguna.")

    if not args.apply:
        print("\nSIMULACION. Volve a correr con --apply.")
        return 0

    print("\nAplicando...")
    ids = ",".join(sorted(guias, key=int))
    supa.pedir("DELETE", f"pedidos_empresa_items?pedido_empresa_id=in.({ids})")
    supa.pedir("DELETE", f"pedidos_empresa?id=in.({ids})")

    cabeceras, lineas = [], []
    for guia, items in guias.items():
        fecha = f"{args.periodo}-{dia_de[guia]:02d}"
        cabeceras.append({
            "id": int(guia), "rut_empresa": rut, "alias": nombre_emp,
            # Mediodia de Chile: asi el dia no se corre al mostrarlo.
            "fecha": f"{fecha}T12:00:00-03:00", "detalle": None,
        })
        for prenda, cant in items.items():
            cod = por_nombre.get(norm(prenda)) or EQUIVALENCIAS[norm(prenda)]
            precio = precios[cod]
            lineas.append({
                "pedido_empresa_id": int(guia), "producto_empresa_id": cod,
                "producto_empresa_nombre": cat[cod], "precio_unidad": precio,
                "cantidad": cant, "importe": precio * cant, "detalle_prenda": None,
            })

    supa.pedir("POST", "pedidos_empresa", cabeceras, prefer="return=minimal")
    supa.pedir("POST", "pedidos_empresa_items", lineas, prefer="return=minimal")
    print(f"  {len(cabeceras)} guias, {len(lineas)} lineas")

    total = sum(l["importe"] for l in lineas)
    print(f"\nNeto del periodo: ${total:,}".replace(",", ".")
          + f"   IVA ${round(total*0.19):,}".replace(",", ".")
          + f"   Total ${round(total*1.19):,}".replace(",", "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
