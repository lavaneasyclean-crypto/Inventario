"""
Guia de correcciones para el Access.

En el Access el nombre del producto es texto libre: se escribe cualquier cosa y
se guarda igual, sin exigir que coincida con el codigo. Con los anos eso dejo
dos problemas en el detalle de los pedidos:

  1. Lineas sin ID_Producto: solo texto ("cubre plumon", "toalla pizo").
  2. Lineas con ID pero con el nombre escrito distinto al del catalogo.

Este script no arregla nada: arma la lista de trabajo. Para cada nombre suelto
busca el producto del catalogo que mas se le parece y lo propone, para que la
correccion en el Access sea revisar y confirmar en vez de adivinar.

Sale un CSV por canal, ordenado por cuantas veces aparece cada caso: arreglando
los primeros se cubre la mayor parte de las lineas.

Uso
---
  1. pwsh ./scripts/etl/01_export_access.ps1 -DbPath "C:\\ruta\\export.accdb"
  2. python scripts/etl/04_guia_correcciones.py
  3. python scripts/etl/04_guia_correcciones.py --desde 2026-08-01   # solo lo reciente

Salida: _out/guia_mostrador.csv y _out/guia_empresas.csv
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAW = AQUI / "_out" / "raw"
OUT = AQUI / "_out"

# Debajo de esto la sugerencia es ruido y conviene no mostrarla.
PARECIDO_MINIMO = 0.55

# Por encima de esto el texto escrito y el del catalogo son practicamente el
# mismo (plural, tilde, un espacio de mas): el producto ya existe y solo falta
# ponerle el codigo. Por debajo hay que decidir si es un producto nuevo:
# "piecera" se parece 86% a "Pechera" y son cosas distintas.
PARECIDO_MISMO_PRODUCTO = 0.90

# Un caso con menos lineas que esto no justifica entrar al Access a buscarlo.
MINIMO_PARA_LISTAR = 5
EJEMPLOS_POR_CASO = 4


def leer(nombre: str) -> list[dict]:
    ruta = RAW / f"{nombre}.csv"
    if not ruta.exists():
        sys.exit(f"Falta {ruta}. Corre primero 01_export_access.ps1")
    with io.open(ruta, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def normalizar(texto: str) -> str:
    """Para comparar: sin tildes, sin mayusculas, sin puntuacion ni espacios
    de mas. 'ToALLA PIZO' y 'toalla pizo' tienen que dar lo mismo."""
    t = unicodedata.normalize("NFD", texto or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return t.strip()


def parecido(a: str, b: str) -> float:
    return SequenceMatcher(None, normalizar(a), normalizar(b)).ratio()


def mejor_match(escrito: str, catalogo: dict[str, str]) -> tuple[str, str, float]:
    """El producto del catalogo mas parecido al texto escrito."""
    mejor_id, mejor_nombre, mejor_score = "", "", 0.0
    for pid, nombre in catalogo.items():
        s = parecido(escrito, nombre)
        if s > mejor_score:
            mejor_id, mejor_nombre, mejor_score = pid, nombre, s
    return mejor_id, mejor_nombre, mejor_score


def construir_guia(
    detalles: list[dict],
    catalogo: dict[str, str],
    campo_pedido: str,
    fechas: dict[str, str],
    desde: str | None,
) -> list[dict]:
    # Se agrupa por (id escrito, nombre escrito) y se juntan pedidos de ejemplo.
    grupos: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in detalles:
        pedido = (r.get(campo_pedido) or "").strip()
        if desde and fechas.get(pedido, "") < desde:
            continue
        pid = (r.get("ID_Producto") or "").strip()
        nombre = (r.get("Nombre_Producto") or "").strip()
        if not nombre and not pid:
            continue
        grupos[(pid, nombre)].append(pedido)

    filas: list[dict] = []
    for (pid, escrito), pedidos in grupos.items():
        canonico = catalogo.get(pid, "")

        if pid and canonico and normalizar(escrito) == normalizar(canonico):
            continue  # ya calza, no hay nada que corregir

        if not pid:
            problema = "sin codigo"
        elif not canonico:
            problema = "codigo no existe en el catalogo"
        else:
            problema = "nombre distinto al del codigo"

        sug_id, sug_nombre, score = mejor_match(escrito, catalogo)
        if score < PARECIDO_MINIMO:
            sug_id, sug_nombre = "", ""

        if not pid and score >= PARECIDO_MISMO_PRODUCTO:
            accion = "asignar codigo existente"
        elif not pid:
            accion = "crear producto en el catalogo"
        else:
            accion = "revisar: el codigo no coincide con lo escrito"

        filas.append({
            "veces": len(pedidos),
            "accion": accion,
            "problema": problema,
            "codigo_actual": pid,
            "nombre_escrito": escrito,
            "nombre_del_codigo": canonico,
            "codigo_sugerido": sug_id,
            "nombre_sugerido": sug_nombre,
            "parecido": f"{score:.0%}" if sug_id else "",
            "pedidos_ejemplo": " ".join(sorted(set(pedidos))[:EJEMPLOS_POR_CASO]),
        })

    filas.sort(key=lambda f: (-f["veces"], f["nombre_escrito"]))
    return filas


def escribir(filas: list[dict], ruta: Path) -> None:
    columnas = ["veces", "accion", "problema", "codigo_actual", "nombre_escrito",
                "nombre_del_codigo", "codigo_sugerido", "nombre_sugerido",
                "parecido", "pedidos_ejemplo"]
    with io.open(ruta, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=columnas)
        w.writeheader()
        w.writerows(filas)


def resumen(titulo: str, filas: list[dict]) -> None:
    total_lineas = sum(f["veces"] for f in filas)
    por_problema: dict[str, int] = defaultdict(int)
    for f in filas:
        por_problema[f["problema"]] += f["veces"]

    print(f"\n{titulo}")
    print(f"  casos a revisar   {len(filas):>5}   ({total_lineas} lineas afectadas)")
    for p, n in sorted(por_problema.items(), key=lambda kv: -kv[1]):
        print(f"    {p:<32} {n:>5} lineas")

    for accion in ("asignar codigo existente", "crear producto en el catalogo",
                   "revisar: el codigo no coincide con lo escrito"):
        grupo = [f for f in filas
                 if f["accion"] == accion and f["veces"] >= MINIMO_PARA_LISTAR]
        if not grupo:
            continue
        print("")
        print(f"  {accion.upper()}   ({sum(f['veces'] for f in grupo)} lineas)")
        for f in grupo[:10]:
            sug = (f"-> {f['codigo_sugerido']} {f['nombre_sugerido']} ({f['parecido']})"
                   if f["codigo_sugerido"] else "")
            print(f"    {f['veces']:>5}  {f['nombre_escrito'][:30]:<30} {sug[:46]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default=None,
                    help="solo pedidos desde esta fecha (YYYY-MM-DD). Sin esto, todo el historico.")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    cat_most = {r["ID_Producto"]: r["Nombre_Producto"] for r in leer("Productos")}
    pe = leer("Producto_Empresa")
    col_id = "ID_Producto" if "ID_Producto" in pe[0] else list(pe[0])[0]
    col_nom = next((c for c in pe[0] if "ombre" in c), list(pe[0])[1])
    cat_emp = {r[col_id]: r[col_nom] for r in pe}

    fechas_most = {r["ID_Pedido"]: (r.get("Fecha_Recepción") or "")[:10] for r in leer("Pedido")}
    fechas_emp = {r["ID_Pedido_Empresa"]: (r.get("Fecha") or "")[:10] for r in leer("Pedido_Empresa")}

    print("=" * 72)
    print("GUIA DE CORRECCIONES PARA EL ACCESS")
    if args.desde:
        print(f"(solo pedidos desde {args.desde})")
    print("=" * 72)

    guia_most = construir_guia(leer("Detalle_Pedidos"), cat_most, "ID_Pedido", fechas_most, args.desde)
    guia_emp = construir_guia(leer("Detalle_Pedido_Empresa"), cat_emp, "ID_Pedido_Empresa", fechas_emp, args.desde)

    resumen("MOSTRADOR", guia_most)
    resumen("EMPRESAS", guia_emp)

    sufijo = f"_desde_{args.desde}" if args.desde else ""
    r1, r2 = OUT / f"guia_mostrador{sufijo}.csv", OUT / f"guia_empresas{sufijo}.csv"
    escribir(guia_most, r1)
    escribir(guia_emp, r2)
    print(f"\nCSV para abrir en Excel:\n  {r1}\n  {r2}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
