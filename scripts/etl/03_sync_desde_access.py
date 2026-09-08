"""
Sincroniza Supabase con un export nuevo del Access, sin destruir lo que solo
vive en la app.

Por que no alcanza con 02_load_to_supabase.py
---------------------------------------------
Ese script es de carga inicial: con --force trunca pedidos, clientes, productos
y empresas antes de recargar. Eso hoy borraria configuracion que no existe en
el Access:

  - los precios acordados por empresa (tabla empresa_productos)
  - la unidad de cobro de los productos (m2 / metro lineal)

Este script en cambio solo hace UPSERT sobre lo que viene del Access y no toca
nada mas. Las lineas de pedido si se reemplazan, porque no tienen clave natural
para hacer upsert.

Nombres de producto
-------------------
El Access guarda Nombre_Producto como texto libre en cada linea, y con los anos
se lleno de variantes del mismo producto ("Juego de Sabanas", "Juego de
Sábanas", "Juego de Sabanas + 2 fundas"). El ID_Producto en cambio es
confiable. Asi que el nombre que se guarda es el del catalogo segun el ID, y el
texto libre se usa solo como respaldo cuando el ID no existe.

Uso
---
  1. pwsh ./scripts/etl/01_export_access.ps1 -DbPath "C:\\ruta\\export.accdb"
  2. python scripts/etl/03_sync_desde_access.py            # simulacion
  3. python scripts/etl/03_sync_desde_access.py --apply    # escribe

Sin --apply no escribe nada: solo informa que haria.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

AQUI = Path(__file__).resolve().parent
ROOT = AQUI.parents[1]

# El modulo 02 empieza con un digito, asi que no se puede importar por nombre.
_spec = importlib.util.spec_from_file_location("loader02", AQUI / "02_load_to_supabase.py")
L = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(L)

BATCH = 500

# Pedidos que se crearon probando la app y que chocan con pedidos reales del
# Access. Se borran antes de importar para que el ID quede libre.
PEDIDOS_DE_PRUEBA = [11868, 11869]

# Productos "cajon de sastre": el catalogo los llama con un nombre generico y
# quien atiende escribe la prenda real en el texto libre. AA001 se llama
# "AA-Otro" y tiene 97 nombres distintos en 483 lineas ("polera", "alfombra
# color blanco", "bajado de cama"...). Estandarizarlos contra el catalogo
# borraria justamente el dato util, asi que se los deja como estan.
PRODUCTOS_CAJON_DE_SASTRE = {"AA001"}


# Lineas de empresa que quedaron sin codigo en el Access, pero cuyo texto es un
# producto que YA existe en el catalogo: cambia el plural, una tilde, un
# espacio o hay un dedazo. La clave va normalizada (minusculas, sin tildes, un
# solo espacio entre palabras).
#
# Deliberadamente NO esta "toalla bano": el parecido con "Toalla Mano" es del
# 91% porque difieren en una letra, pero son cosas distintas y el catalogo no
# tiene toalla de bano. Esas lineas quedan sin codigo para revisarlas a mano.
#
# Lo que NO entra aca son los productos que directamente no existen —
# "mantel blanco circular", "piecera", "toallones"—: esos hay que crearlos en
# el catalogo y no se pueden resolver con un alias.
ALIAS_PRODUCTO_EMPRESA = {
    "arpilleras":            "044",  # 64 -> Aspilleras
    "fundas cojin larga":    "030",  # 44 -> Funda cojin larga
    "fundas cojin pequena":  "029",  # 21 -> Funda cojin pequena
    "fundas cojin largas":   "030",  # 19 -> Funda cojin larga
    "toalla piso":           "006",  #  7 -> Toalla Piso
    "sabanas super king":    "049",  #  6 -> Sabana Superking
    "carpetas":              "002",  #  6 -> Carpeta
    "fundas cojin pequenas": "029",  #  6 -> Funda cojin pequena
    "toallas piso":          "006",  #  3
    "toalla piuso":          "006",  #  3  (dedazo)
    "toallas mano":          "005",  #  3
    "toala piso":            "006",  #  3  (dedazo)
    "funda de cojin larga":  "030",  #  2
    "toallas cuerpo":        "004",  #  2
    "toallas repaso":        "039",  #  2
    "cortina visillo":       "059",  #  2
    "toaalla cuerpo":        "004",  #  2  (dedazo)
    "funnda almohada":       "011",  #  2  (dedazo)
    "toallam piso":          "006",  #  2  (dedazo)
    "toalla puiso":          "006",  #  2  (dedazo)

    # --- Confirmados por el usuario contra los Excel de facturacion ---
    # El Excel de cada empresa usa su propio vocabulario para el mismo
    # producto del catalogo.
    "mantel blanco circular": "019",  # -> Mantel Ovalado      (Alma)
    "mantel blanco gigante":  "042",  # -> Tablero Blanco 2,5x6 (Alma)
    "repasadores":            "038",  # -> Mantel Repaso       (Alma)
    "arpillera":              "044",  # -> Aspilleras          (Alma)
    "faldon cama":            "047",  # -> Faldon              (Acacias)
    "bata toalla":            "055",  # -> Bata / "Batas"      (Acacias)
    "cortina bano":           "048",  # -> Cortina bano blanca pequena (Acacias)
    "cubre plumon":           "015",  # -> Cubre Plumon King   (Gran Parador y Bianco)
}


def normalizar_nombre(texto: str) -> str:
    """Minusculas, sin tildes, un solo espacio. Igual que en 04_guia."""
    t = unicodedata.normalize("NFD", texto or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def aplicar_alias(items: list[dict], catalogo: dict[str, str]) -> Counter:
    """Le pone el codigo del catalogo a las lineas que quedaron sin uno y cuyo
    texto figura en ALIAS_PRODUCTO_EMPRESA."""
    aplicados: Counter = Counter()
    for it in items:
        if it.get("producto_empresa_id"):
            continue
        codigo = ALIAS_PRODUCTO_EMPRESA.get(normalizar_nombre(it["producto_empresa_nombre"]))
        if not codigo or codigo not in catalogo:
            continue
        aplicados[(it["producto_empresa_nombre"], codigo)] += 1
        it["producto_empresa_id"] = codigo
        it["producto_empresa_nombre"] = catalogo[codigo]
    return aplicados


# ---------------------------------------------------------------------------
# Cliente HTTP: se apoya en el del modulo 02 y agrega upsert
# ---------------------------------------------------------------------------
class Supa(L.Supa):
    def upsert(self, tabla: str, filas: list[dict], on_conflict: str) -> None:
        """Inserta o actualiza. Solo pisa las columnas que van en el payload,
        asi que lo que no viene del Access queda intacto."""
        for i in range(0, len(filas), BATCH):
            self._req(
                "POST",
                f"/rest/v1/{tabla}?on_conflict={on_conflict}",
                body=filas[i : i + BATCH],
                prefer="resolution=merge-duplicates,return=minimal",
            )

    def borrar_donde(self, tabla: str, filtro: str) -> None:
        self._req("DELETE", f"/rest/v1/{tabla}?{filtro}")

    def traer(self, tabla: str, select: str, filtro: str = "") -> list[dict]:
        """GET paginado: PostgREST corta en 1000 filas por defecto."""
        filas: list[dict] = []
        desde = 0
        while True:
            url = f"{self.base}/rest/v1/{tabla}?select={select}{filtro}&offset={desde}&limit=1000"
            req = urllib.request.Request(url, method="GET", headers=self.headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                lote = json.loads(resp.read().decode("utf-8"))
            filas.extend(lote)
            if len(lote) < 1000:
                return filas
            desde += 1000


# ---------------------------------------------------------------------------
# Estandarizacion de nombres
# ---------------------------------------------------------------------------
def mapa_nombres(filas_catalogo: list[dict], clave_id: str = "id") -> dict[str, str]:
    return {f[clave_id]: f["nombre"] for f in filas_catalogo if f.get(clave_id)}


def estandarizar(
    items: list[dict],
    campo_id: str,
    campo_nombre: str,
    catalogo: dict[str, str],
) -> Counter:
    """Pisa el texto libre con el nombre del catalogo. Devuelve el recuento de
    lo que cambio, para el informe."""
    cambios: Counter = Counter()
    for it in items:
        pid = it.get(campo_id)
        if pid in PRODUCTOS_CAJON_DE_SASTRE:
            continue
        canonico = catalogo.get(pid) if pid else None
        if canonico and it[campo_nombre] != canonico:
            cambios[(pid, it[campo_nombre], canonico)] += 1
            it[campo_nombre] = canonico
    return cambios


# ---------------------------------------------------------------------------
# Informe
# ---------------------------------------------------------------------------
def informe_mes(
    pedidos: list[dict],
    items: list[dict],
    campo_pedido: str,
    campo_id: str,
    campo_nombre_original: dict[int, str],
    desde_iso: str,
    catalogo: dict[str, str],
) -> list[tuple]:
    """Pares (id_producto, nombre escrito) de los pedidos desde `desde_iso`,
    para revisar a mano cuales son productos que faltan en el catalogo."""
    recientes = {
        p["id"] for p in pedidos if (p.get("fecha_recepcion") or p.get("fecha") or "") >= desde_iso
    }
    vistos: dict[tuple, int] = defaultdict(int)
    for idx, it in enumerate(items):
        if it[campo_pedido] not in recientes:
            continue
        original = campo_nombre_original.get(idx)
        if original is None:
            continue
        vistos[(it.get(campo_id) or "(sin id)", original, catalogo.get(it.get(campo_id) or "", ""))] += 1
    return sorted(vistos.items(), key=lambda kv: -kv[1])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="escribe en Supabase (sin esto, solo simula)")
    ap.add_argument("--desde", default="2026-08-01", help="fecha del informe de nombres (YYYY-MM-DD)")
    args = ap.parse_args()

    env = L.load_env(ROOT / ".env.local")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
    supa = Supa(url, key)

    L.CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    L.QUAR_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 72)
    print("SYNC DESDE ACCESS" + ("  [APLICANDO]" if args.apply else "  [SIMULACION]"))
    print("=" * 72)

    # --- 1. Limpieza (se reusa la del loader) ------------------------------
    clientes = L.clean_clientes()
    ruts = {c["rut"] for c in clientes}
    empresas = L.clean_clientes_empresa()
    ruts_emp = {e["rut"] for e in empresas}
    productos, _ = L.clean_productos()
    productos_emp, _ = L.clean_productos_empresa()
    pedidos, ids_pedidos = L.clean_pedidos(ruts)
    items = L.clean_detalle_pedidos(ids_pedidos)
    pedidos_emp, ids_pe = L.clean_pedidos_empresa(ruts_emp)
    items_emp = L.clean_detalle_pedidos_empresa(ids_pe)

    # --- 2. Estandarizar nombres contra el catalogo ------------------------
    originales = {i: it["producto_nombre"] for i, it in enumerate(items)}
    originales_emp = {i: it["producto_empresa_nombre"] for i, it in enumerate(items_emp)}

    cat = mapa_nombres(productos)
    cat_emp = mapa_nombres(productos_emp)

    # Primero se recuperan las lineas sin codigo que tienen alias conocido;
    # despues la estandarizacion normal les pone el nombre del catalogo.
    alias = aplicar_alias(items_emp, cat_emp)
    cambios = estandarizar(items, "producto_id", "producto_nombre", cat)
    cambios_emp = estandarizar(items_emp, "producto_empresa_id", "producto_empresa_nombre", cat_emp)

    print(f"\nLimpieza")
    print(f"  clientes            {len(clientes):>6}")
    print(f"  empresas            {len(empresas):>6}")
    print(f"  productos           {len(productos):>6}")
    print(f"  productos empresa   {len(productos_emp):>6}")
    print(f"  pedidos             {len(pedidos):>6}")
    print(f"  lineas              {len(items):>6}")
    print(f"  pedidos empresa     {len(pedidos_emp):>6}")
    print(f"  lineas empresa      {len(items_emp):>6}")

    print(f"\nEstandarizacion de nombres")
    print(f"  lineas mostrador corregidas   {sum(cambios.values()):>6}  ({len(cambios)} variantes distintas)")
    print(f"  lineas empresa corregidas     {sum(cambios_emp.values()):>6}  ({len(cambios_emp)} variantes distintas)")
    print(f"  lineas empresa con codigo recuperado {sum(alias.values()):>4}  ({len(alias)} textos distintos)")

    # --- 3. Que hay hoy en Supabase ----------------------------------------
    ya = {p["id"] for p in supa.traer("pedidos", "id")}
    ya_emp = {p["id"] for p in supa.traer("pedidos_empresa", "id")}
    nuevos = sorted(ids_pedidos - ya)
    nuevos_emp = sorted(ids_pe - ya_emp)

    print(f"\nComparacion con Supabase")
    print(f"  pedidos ya cargados           {len(ya):>6}")
    print(f"  pedidos nuevos del Access     {len(nuevos):>6}"
          + (f"   (#{nuevos[0]} .. #{nuevos[-1]})" if nuevos else ""))
    print(f"  pedidos empresa nuevos        {len(nuevos_emp):>6}"
          + (f"   (#{nuevos_emp[0]} .. #{nuevos_emp[-1]})" if nuevos_emp else ""))
    print(f"  pedidos de prueba a borrar    {PEDIDOS_DE_PRUEBA}")

    # --- 4. Informe de nombres del periodo ---------------------------------
    pares = informe_mes(pedidos, items, "pedido_id", "producto_id", originales, args.desde, cat)
    pares_emp = informe_mes(pedidos_emp, items_emp, "pedido_empresa_id", "producto_empresa_id",
                            originales_emp, args.desde, cat_emp)

    ruta_informe = AQUI / "_out" / f"informe_nombres_desde_{args.desde}.txt"
    with ruta_informe.open("w", encoding="utf-8") as fh:
        for titulo, datos in (("MOSTRADOR", pares), ("EMPRESAS", pares_emp)):
            fh.write(f"\n{'=' * 72}\n{titulo} — nombres escritos desde {args.desde}\n{'=' * 72}\n")
            fh.write(f"{'veces':>6}  {'id':<8} {'como se escribio':<44} {'catalogo'}\n")
            fh.write("-" * 110 + "\n")
            for (pid, escrito, canonico), n in datos:
                marca = "  " if canonico else "??"  # ?? = el id no esta en el catalogo
                fh.write(f"{n:>6}  {marca}{pid:<6} {escrito[:44]:<44} {canonico}\n")
    print(f"\nInforme de nombres desde {args.desde}: {ruta_informe}")
    print(f"  mostrador  {len(pares):>4} pares distintos")
    print(f"  empresas   {len(pares_emp):>4} pares distintos")

    if not args.apply:
        print("\n" + "=" * 72)
        print("SIMULACION: no se escribio nada. Volve a correr con --apply.")
        print("=" * 72)
        return 0

    # --- 5. Escritura -------------------------------------------------------
    print("\nEscribiendo...")

    ids_prueba = ",".join(str(i) for i in PEDIDOS_DE_PRUEBA)
    supa.borrar_donde("pedidos_items", f"pedido_id=in.({ids_prueba})")
    supa.borrar_donde("pedidos", f"id=in.({ids_prueba})")
    print(f"  pedidos de prueba borrados")

    # Padres primero. No se manda unidad_cobro, asi que la configuracion de
    # m2 / metro lineal hecha en la app sobrevive.
    supa.upsert("clientes", clientes, "rut");                 print(f"  clientes            {len(clientes):>6}")
    supa.upsert("clientes_empresa", empresas, "rut");         print(f"  empresas            {len(empresas):>6}")
    supa.upsert("productos", productos, "id");                print(f"  productos           {len(productos):>6}")
    supa.upsert("productos_empresa", productos_emp, "id");    print(f"  productos empresa   {len(productos_emp):>6}")
    supa.upsert("pedidos", pedidos, "id");                    print(f"  pedidos             {len(pedidos):>6}")
    supa.upsert("pedidos_empresa", pedidos_emp, "id");        print(f"  pedidos empresa     {len(pedidos_emp):>6}")

    # Las lineas no tienen clave natural: se reemplazan enteras.
    supa.borrar_donde("pedidos_items", "id=not.is.null")
    supa.insert("pedidos_items", items);                      print(f"  lineas              {len(items):>6}")
    supa.borrar_donde("pedidos_empresa_items", "id=not.is.null")
    supa.insert("pedidos_empresa_items", items_emp);          print(f"  lineas empresa      {len(items_emp):>6}")

    print("\nListo. En el SQL Editor de Supabase, resincronizar las secuencias:")
    print("  select setval('pedidos_id_seq', (select max(id) from pedidos) + 1, false);")
    print("  select setval('pedidos_empresa_id_seq', (select max(id) from pedidos_empresa) + 1, false);")
    return 0


if __name__ == "__main__":
    sys.exit(main())
