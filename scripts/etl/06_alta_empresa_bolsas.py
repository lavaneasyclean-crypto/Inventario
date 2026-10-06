"""
Da de alta una empresa que trabaja por bolsas, con todo lo que necesita.

Termomin y Termochemical no mandan un bulto de ropa: mandan la bolsa de cada
trabajador, numerada, y hay que devolverla tal cual. Para que la grilla de
carga sirva, la empresa necesita tres cosas antes de la primera guia:

  1. existir, con `usa_bolsas` prendido;
  2. su catalogo de prendas con el precio acordado;
  3. el padron de bolsas, que son las filas de la grilla.

Armar eso a mano son tres pantallas y siete precios que se pueden tipear mal.
Este script lo deja listo de una vez.

Es idempotente: lo que ya existe no se toca ni se duplica. Se puede volver a
correr para agregar bolsas nuevas o corregir precios.

Uso
---
  python scripts/etl/06_alta_empresa_bolsas.py --empresa termomin
  python scripts/etl/06_alta_empresa_bolsas.py --empresa termomin --apply
  python scripts/etl/06_alta_empresa_bolsas.py --empresa todas --apply

Sin --apply no escribe nada.

Las guias semanales NO las carga este script: se cargan desde la app, en la
grilla, que para eso se hizo. Los datos de abajo salen de la planilla
"Planilla Termomin-Termochemical Septiembre 2026.xlsx".
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Lo que dice la planilla
#
# Los precios estan en el bloque de arriba a la derecha ("Items / Precios
# Netos2"). Los nombres de las columnas de la grilla no coinciden del todo con
# esa lista —la lista dice "Overol" y "Gorros", la grilla dice "Overol
# termico" y "Gorro"— asi que acá se usa el nombre de la grilla, que es el que
# describe la prenda real, con el precio que le corresponde.
#
# Verificado contra la planilla: semana 1 de Termomin da $164.400 sumando
# 52 poleras a 1.200, 35 pantalones y 20 polerones a 1.750, 3 cotonas a 1.750
# y 1 gorro a 500. Coincide con el "Neto" que trae la hoja.
#
# EL ORDEN DE ESTA LISTA IMPORTA: es el de las columnas de la planilla, y se
# guarda como el orden de las columnas de la grilla. Cargar la grilla es
# copiar del papel, asi que si las columnas no siguen el mismo orden cada fila
# de siete celdas es una oportunidad de anotar la cantidad en la prenda de al
# lado.
# ---------------------------------------------------------------------------
PRENDAS = [
    ("Polera",           1200),
    ("Pantalón",         1750),
    ("Pantalón térmico", 2500),
    ("Cotona",           1750),
    ("Polerón",          1750),
    ("Overol térmico",   4500),
    ("Gorro",             500),
]

# Lo que se factura pero NO es una prenda de bolsa: no se reparte entre los
# trabajadores ni se devuelve. Va al catalogo para que entre en la factura,
# pero marcado `en_grilla = false` para que no ocupe una columna que nadie
# llena. El monto sale del "Traslado" del resumen de la planilla.
SERVICIOS = [
    ("Traslado", 80000),
]

# Nombres que van al catalogo pero no a la grilla.
SOLO_FACTURA = {n for n, _ in SERVICIOS}

EMPRESAS = {
    "termomin": {
        "rut": "86667200-8",
        "nombre": "Importadora Termomin Limitada",
        "alias": "Termomín",
        "calle": "Avda. Pdte. Eduardo Frei M. 9231",
        "comuna": "Quilicura",
        "contacto_1": "224135100",
        # En la planilla las bolsas 1 a 20 son de Termomin.
        "bolsas_desde": 1,
        "bolsas_hasta": 20,
        "bolsas_por_nombre": [],
    },
    "termochemical": {
        "rut": "96868910-K",
        "nombre": "Termochemical Latinoamerica S.A.",
        "alias": "Termochemical",
        "calle": "Avda. Pdte. Eduardo Frei M. 9231",
        "comuna": "Quilicura",
        "contacto_1": "224135120",
        # 21 a 32, mas la gente que no tiene bolsa numerada y aparece por
        # nombre en la columna "Numero bolsa".
        "bolsas_desde": 21,
        "bolsas_hasta": 32,
        "bolsas_por_nombre": ["Nicolás", "DV", "Maxis"],
    },
}


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
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                crudo = r.read()
                return json.loads(crudo) if crudo else None
        except urllib.error.HTTPError as e:
            detalle = e.read().decode("utf-8", "replace")
            raise SystemExit(f"\nSupabase respondio {e.code} en {metodo} {ruta}:\n  {detalle}")


# ---------------------------------------------------------------------------
def procesar(supa: Supa, clave: str, cfg: dict, aplicar: bool) -> None:
    rut = cfg["rut"]
    print(f"\n=== {cfg['alias']} ({rut}) ===")

    # 1. La empresa
    existente = supa.pedir("GET", f"clientes_empresa?rut=eq.{rut}&select=rut,usa_bolsas")
    if existente:
        prendido = existente[0].get("usa_bolsas")
        print(f"  empresa      ya existe{'' if prendido else '  (falta prender usa_bolsas)'}")
        if not prendido and aplicar:
            supa.pedir("PATCH", f"clientes_empresa?rut=eq.{rut}",
                       {"usa_bolsas": True}, prefer="return=minimal")
            print("               usa_bolsas prendido")
    else:
        print(f"  empresa      crear: {cfg['nombre']}")
        if aplicar:
            supa.pedir("POST", "clientes_empresa", {
                "rut": rut, "nombre": cfg["nombre"], "alias": cfg["alias"],
                "calle": cfg["calle"], "comuna": cfg["comuna"],
                "contacto_1": cfg["contacto_1"],
                "activo": True, "usa_bolsas": True, "recargo_express": 0,
            }, prefer="return=minimal")

    # 2. Catalogo y precios
    #
    # Hay dos caminos y elegir mal rompe la carga:
    #
    #   - La prenda NO esta en el catalogo global -> `crear_producto_empresa`,
    #     que la crea y la adquiere en una transaccion.
    #   - La prenda YA esta -> hay que adquirirla para esta empresa con su
    #     precio. `crear_producto_empresa` NO la reutiliza: rechaza el nombre
    #     duplicado con un 23505. Y pasa seguido, porque el catalogo global es
    #     compartido: "Polera" ya existia por otra empresa, y lo mismo entre
    #     Termomin y Termochemical, que usan las mismas siete prendas.
    #
    # El cotejo por nombre replica el de la funcion SQL: sin distinguir
    # mayusculas y sin espacios al borde, pero respetando las tildes.
    globales = supa.pedir("GET", "productos_empresa?select=id,nombre") or []
    id_global = {
        (g.get("nombre") or "").strip().lower(): g["id"] for g in globales
    }

    adquiridos = supa.pedir(
        "GET", f"empresa_productos?rut_empresa=eq.{rut}"
               "&select=producto_empresa_id,precio,productos_empresa(nombre)") or []
    ya_tiene = {
        ((a.get("productos_empresa") or {}).get("nombre") or "").strip().lower(): a
        for a in adquiridos
    }

    # id de cada prenda, para fijar despues el orden de las columnas.
    id_de: dict[str, str] = {}

    for nombre, precio in PRENDAS + SERVICIOS:
        clave = nombre.strip().lower()
        actual = ya_tiene.get(clave)
        if actual is None:
            gid = id_global.get(clave)
            if gid:
                id_de[nombre] = gid
                print(f"  prenda       adquirir: {nombre:16} ${precio:,}  (ya existia, id {gid})".replace(",", "."))
                if aplicar:
                    supa.pedir(
                        "POST", "empresa_productos",
                        {"rut_empresa": rut, "producto_empresa_id": gid,
                         "precio": precio,
                         "en_grilla": nombre not in SOLO_FACTURA},
                        prefer="resolution=merge-duplicates,return=minimal")
            else:
                print(f"  prenda       crear:  {nombre:18} ${precio:,}".replace(",", "."))
                if aplicar:
                    nuevo_id = supa.pedir("POST", "rpc/crear_producto_empresa",
                                          {"p_rut_empresa": rut, "p_nombre": nombre,
                                           "p_precio": precio})
                    if isinstance(nuevo_id, str):
                        id_de[nombre] = nuevo_id
                        if nombre in SOLO_FACTURA:
                            # La funcion SQL lo crea como prenda; hay que
                            # sacarlo de la grilla despues.
                            supa.pedir(
                                "PATCH",
                                f"empresa_productos?rut_empresa=eq.{rut}"
                                f"&producto_empresa_id=eq.{nuevo_id}",
                                {"en_grilla": False}, prefer="return=minimal")
        elif actual.get("precio") != precio:
            id_de[nombre] = actual["producto_empresa_id"]
            print(f"  prenda       precio: {nombre:18} {actual.get('precio')} -> ${precio:,}".replace(",", "."))
            if aplicar:
                supa.pedir(
                    "PATCH",
                    f"empresa_productos?rut_empresa=eq.{rut}"
                    f"&producto_empresa_id=eq.{actual['producto_empresa_id']}",
                    {"precio": precio}, prefer="return=minimal")
        else:
            id_de[nombre] = actual["producto_empresa_id"]
            print(f"  prenda       ok:     {nombre:18} ${precio:,}".replace(",", "."))

    # 2b. El orden de las columnas de la grilla, que es el de PRENDAS.
    #
    # Se reescriben todas las posiciones en vez de tocar solo las que cambian:
    # es idempotente y no depende de que las existentes esten numeradas de
    # forma consistente. Lo que no este en PRENDAS —"Polar", por ejemplo—
    # queda en NULL y la app lo manda al final, alfabetico.
    # El orden solo aplica a las columnas de la grilla: los servicios no tienen.
    orden = [(n, id_de[n]) for n, _ in PRENDAS if n in id_de]
    if len(orden) == len(PRENDAS):
        print(f"  orden        columnas: {' | '.join(n for n, _ in orden)}")
        if aplicar:
            supa.pedir(
                "POST", "empresa_productos",
                [{"rut_empresa": rut, "producto_empresa_id": pid, "orden": i}
                 for i, (_, pid) in enumerate(orden)],
                prefer="resolution=merge-duplicates,return=minimal")
    elif aplicar:
        print(f"  orden        se fija en la proxima corrida "
              f"({len(orden)} de {len(PRENDAS)} prendas con id)")

    # 3. Padron de bolsas
    codigos = [str(n) for n in range(cfg["bolsas_desde"], cfg["bolsas_hasta"] + 1)]
    codigos += cfg["bolsas_por_nombre"]

    existentes = supa.pedir(
        "GET", f"empresa_bolsas?rut_empresa=eq.{rut}&select=codigo") or []
    ya_estan = {b["codigo"] for b in existentes}
    faltan = [c for c in codigos if c not in ya_estan]

    if not faltan:
        print(f"  bolsas       ok: las {len(codigos)} ya estan en el padron")
    else:
        print(f"  bolsas       crear {len(faltan)}: {', '.join(faltan)}")
        if aplicar:
            supa.pedir("POST", "empresa_bolsas",
                       [{"rut_empresa": rut, "codigo": c, "nombre": None} for c in faltan],
                       prefer="return=minimal")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--empresa", required=True,
                    choices=[*EMPRESAS.keys(), "todas"])
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    env = cargar_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL / la key en .env.local")

    supa = Supa(url, key)
    claves = list(EMPRESAS) if args.empresa == "todas" else [args.empresa]
    for clave in claves:
        procesar(supa, clave, EMPRESAS[clave], args.apply)

    if not args.apply:
        print("\nSIMULACION. Volve a correr con --apply para escribir.")
    else:
        print("\nListo. La grilla de carga ya esta disponible en la ficha de cada empresa.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
