"""
Pone las lineas escritas a mano bajo el producto que la empresa factura.

El problema
-----------
El Access guarda el nombre que escribio quien recibio la ropa, no el del
catalogo. Alma escribe "mantel blanco circular" y en la lavanderia eso se
cobra como "Mantel Ovalado"; escribe "Carpeta" y se cobra "Mantel Amarillo
Cuadrado". Esas lineas entraron sin codigo —o con uno que la empresa no tiene
asignado—, asi que quedaron sin precio y no se pueden facturar.

Encima la misma prenda viene escrita de varias formas: "mantel blanco
gigante", "manel blanco gigante", "mantel blnco gigante". Cada variante es una
fila distinta en la base y saldria como una linea distinta en la factura,
porque el consolidado agrupa por (codigo, nombre, precio).

Esto no es renombrar por gusto: mientras la linea diga lo que dice, ninguna
carga futura le va a encontrar precio.

Lo que NO toca
--------------
  1. Guias ya facturadas. Cambiar el precio de una linea ya emitida descuadra
     la factura contra la base.
  2. Guias anuladas.
  3. Lineas que ya tienen precio. Si el precio esta puesto, alguien lo puso:
     pisarlo seria cambiar un cobro. Las que tienen precio y un codigo que no
     es el destino se listan al final para mirarlas de a una.

Es reversible: de donde vino cada linea queda escrito en la tabla de abajo.

Uso
---
  python scripts/etl/13_mapear_producto_empresa.py            # simulacion
  python scripts/etl/13_mapear_producto_empresa.py --apply    # escribe
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Que empresa y que mapeo. Es lo unico que se edita para volver a usarlo.
#
# Cada regla dice a que producto de la lista de la empresa van las lineas y con
# que nombres se reconocen. Los nombres van normalizados: minusculas, sin
# acentos y con los espacios colapsados, asi "Mantel Blanco Gigante" y
# "mantel  blanco gigante" entran con una sola fila de esta tabla. Las faltas
# de ortografia no se pueden normalizar, asi que cada una va por su cuenta:
# son las que escribio el cliente y hay que nombrarlas una por una.
# ---------------------------------------------------------------------------
RUT_EMPRESA = "59214430-1"       # Alma Spa

REGLAS = [
    {
        "hacia": "019",          # Mantel Ovalado
        "nombres": [
            "mantel blanco circular",
            "mantel circular",
            "mantel blanco ovalado",
            "mantel blanco redondo",
            # como quedo escrito:
            "antel blanco circular",
            "mantelblanco circular",
            "mantel bvlanco circular",
            "manterl blanco circular",
            "mantel blnco circular",
        ],
    },
    {
        "hacia": "044",          # Aspilleras
        "nombres": [
            "aspilleras",
            "arpilleras",
            "arpillera",
        ],
    },
    {
        "hacia": "095",          # Tablero 2,6x6
        "nombres": [
            "mantel blanco gigante",
            # el codigo 042 es el mismo tablero con otra medida escrita, y la
            # empresa no lo tiene asignado: sin esto queda sin precio.
            "tablero blanco 2,5x6",
            "tablero blanco 6,6",
            # como quedo escrito:
            "manel blanco gigante",
            "mantel blnco gigante",
            "mantel blanco gignte",
            "mantelblanco gigante",
        ],
    },
    {
        # Misma decision que ya se tomo para el codigo 002 ("Carpeta"), ahora
        # para las que entraron sin codigo, con el nombre escrito a mano.
        "hacia": "046",          # Mantel Amarillo Cuadrado
        "nombres": [
            "carpetas",
            "carpeta amarilla",
            "carpetas amarilla",
            "carpetas amarillas",
        ],
    },
    {
        "hacia": "038",          # Mantel Repaso
        "nombres": [
            "repasadores",
            "repasos",
        ],
    },
    {
        "hacia": "045",          # Mantel Blanco cuadrado
        "nombres": [
            # "Mantel" pelado, sin color ni forma: es el cuadrado blanco.
            "mantel",
            "mantel bolanco cuadrado",
        ],
    },
    {
        "hacia": "043",          # Mantel blanco rectangular 1,5x3
        "nombres": [
            "mantel blanco rectangular",
            "mantel blanco nrectangular",
        ],
    },
]


def normalizar(texto: str | None) -> str:
    sin_tildes = unicodedata.normalize("NFD", (texto or "").lower())
    plano = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")
    return " ".join(plano.split())


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
    print("MAPEAR PRENDAS" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 78)

    empresa = supa.traer(
        f"clientes_empresa?select=rut,nombre,alias&rut=eq.{RUT_EMPRESA}")
    if not empresa:
        sys.exit(f"No existe la empresa {RUT_EMPRESA}")
    print(f"\nEmpresa: {empresa[0]['nombre']}  ({empresa[0]['alias']})")

    # La lista de la empresa es la que manda: el nombre del catalogo y el
    # precio se leen de ahi, nunca se escriben en este archivo.
    lista = {
        p["producto_empresa_id"]: (p["productos_empresa"]["nombre"], p["precio"])
        for p in supa.traer(
            "empresa_productos?select=producto_empresa_id,precio,"
            "productos_empresa(nombre)"
            f"&rut_empresa=eq.{RUT_EMPRESA}")
    }

    # Un nombre en dos reglas seria una ambiguedad silenciosa: mejor parar.
    destino_de: dict[str, str] = {}
    for regla in REGLAS:
        hacia = regla["hacia"]
        if hacia not in lista:
            sys.exit(f"La empresa no tiene asignado el producto {hacia}")
        nombre_cat, precio = lista[hacia]
        if precio is None:
            sys.exit(f"{nombre_cat} ({hacia}) no tiene precio en la lista")
        for n in regla["nombres"]:
            if destino_de.get(n, hacia) != hacia:
                sys.exit(f"El nombre {n!r} esta en dos reglas distintas")
            destino_de[n] = hacia

    print("\nDestinos:")
    for regla in REGLAS:
        nombre_cat, precio = lista[regla["hacia"]]
        print(f"  {regla['hacia']}  {nombre_cat:<34} {clp(precio):>9}"
              f"   {len(regla['nombres'])} nombre(s)")

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

    print(f"\nlineas de la empresa: {len(lineas)}  en {len(guias)} guias")

    mover: list[tuple[dict, str]] = []
    saltadas = {"anulada": 0, "facturada": 0, "ya_estaba": 0}
    con_precio: list[tuple[dict, str]] = []
    usados: collections.Counter = collections.Counter()

    for l in lineas:
        clave = normalizar(l["producto_empresa_nombre"])
        hacia = destino_de.get(clave)
        if hacia is None:
            continue
        usados[clave] += 1
        if guias[l["pedido_empresa_id"]]["anulado"]:
            saltadas["anulada"] += 1
            continue
        if l["pedido_empresa_id"] in facturadas:
            saltadas["facturada"] += 1
            continue
        if l["precio_unidad"] is not None:
            if l["producto_empresa_id"] == hacia:
                saltadas["ya_estaba"] += 1
            else:
                con_precio.append((l, hacia))
            continue
        mover.append((l, hacia))

    print(f"  en guias anuladas    {saltadas['anulada']:>4}   no se tocan")
    print(f"  en guias facturadas  {saltadas['facturada']:>4}   no se tocan")
    print(f"  ya estaban bien      {saltadas['ya_estaba']:>4}   nada que hacer")
    print(f"  con precio ya puesto {len(con_precio):>4}   no se pisan, revisar")

    print("\n" + "-" * 78)
    total_plata = 0
    for regla in REGLAS:
        hacia = regla["hacia"]
        nombre_cat, precio = lista[hacia]
        precio = int(float(precio))
        del_grupo = [l for l, h in mover if h == hacia]
        unidades = sum(l["cantidad"] for l in del_grupo)
        total_plata += unidades * precio
        print(f"\n{hacia}  {nombre_cat}  a {clp(precio)}")
        print(f"    {len(del_grupo)} lineas, {unidades} unidades, "
              f"{clp(unidades * precio)}")
        cuantas: collections.Counter = collections.Counter()
        unids: collections.Counter = collections.Counter()
        for l in del_grupo:
            cuantas[l["producto_empresa_nombre"]] += 1
            unids[l["producto_empresa_nombre"]] += l["cantidad"]
        for nom, n in cuantas.most_common():
            print(f"      {repr(nom)[:44]:<46} {n:>4} lineas {unids[nom]:>5} unid")

    print("\n" + "-" * 78)
    print(f"A MOVER: {len(mover)} lineas, "
          f"{sum(l['cantidad'] for l, _ in mover)} unidades, {clp(total_plata)}")
    print("-" * 78)

    # Un nombre de la tabla que no aparece en ninguna linea es un error de
    # tipeo en la tabla, no un dato: conviene verlo antes de escribir.
    sin_uso = [n for n in destino_de if usados[n] == 0]
    if sin_uso:
        print("\n  OJO: estos nombres de la tabla no aparecen en ninguna linea:")
        for n in sin_uso:
            print(f"    {n!r}")

    if con_precio:
        print(f"\n  Lineas con precio puesto y otro codigo ({len(con_precio)}).")
        print("  No se tocan: el precio ya lo puso alguien y cambiarles el")
        print("  codigo cambiaria como se agrupan en la factura.")
        for l, hacia in con_precio[:20]:
            g = guias[l["pedido_empresa_id"]]
            print(f"    guia #{l['pedido_empresa_id']} {g['fecha'][:10]}  "
                  f"{l['producto_empresa_nombre']!r} x{l['cantidad']} "
                  f"a {clp(l['precio_unidad'])}   (iria a {hacia})")

    if not args.apply:
        print("\n" + "=" * 78)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 78)
        return 0

    print("\nEscribiendo...")
    for n, (l, hacia) in enumerate(mover, 1):
        nombre_cat, precio = lista[hacia]
        precio = int(float(precio))
        supa.patch(f"pedidos_empresa_items?id=eq.{l['id']}", {
            "producto_empresa_id": hacia,
            "producto_empresa_nombre": nombre_cat,
            "precio_unidad": precio,
            "importe": precio * l["cantidad"],
        })
        if n % 100 == 0 or n == len(mover):
            print(f"  {n} / {len(mover)}")

    print(f"\nListo: {len(mover)} lineas, "
          f"{sum(l['cantidad'] for l, _ in mover)} unidades, {clp(total_plata)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
