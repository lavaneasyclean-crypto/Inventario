"""
Carga las guias de una planilla por bolsas (Termomin / Termochemical).

La planilla trae el mes partido en semanas. Cada semana tiene un bloque por
empresa, y cada bloque es la grilla: una fila por bolsa, una columna por
prenda.

    Semana 1                      2026-09-04
    Termomin
    Numero bolsa | Nombres | Polera | Pantalon | ... | Gorro
    1            |         |        |          |     |
    3            |         | 6      | 1        |     |
    ...
                 | Total   | 52     | 35       |     | 1

De ahi sale una guia por (semana, empresa), con la fecha de la semana.

Verificacion antes de escribir
------------------------------
Al final la planilla trae el resumen del mes: cantidad por prenda y neto por
empresa. El script reconstruye esos numeros desde las grillas y se niega a
cargar si no coinciden. Una guia a medias es peor que ninguna: el error no se
nota —el total de la guia da igual— y recien aparece cuando el cliente reclama.

NO carga el "Traslado" del resumen. Es un cargo del mes, no una prenda, y no
sale de ninguna grilla: va aparte al facturar.

Idempotente: si ya hay una guia de esa empresa con esa fecha, se saltea. Se
puede correr de nuevo despues de agregar una semana.

Uso
---
  python scripts/etl/07_cargar_planilla_bolsas.py <planilla.xlsx> --periodo 2026-09
  python scripts/etl/07_cargar_planilla_bolsas.py <planilla.xlsx> --periodo 2026-09 --apply

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
import urllib.request
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]

# Como se llama cada empresa en los encabezados de la planilla. La hoja escribe
# "Termomin", "Termomín" y "Termochémical" segun el bloque, asi que el cotejo
# va normalizado.
EMPRESAS_POR_NOMBRE = {
    "termomin": "86667200-8",
    "termochemical": "96868910-K",
}


def norm(t: object) -> str:
    """Minusculas, sin tildes y sin puntuacion. Para cotejar nombres."""
    t = unicodedata.normalize("NFD", str(t or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def texto(v: object) -> str:
    """Celda a texto, sin el .0 que openpyxl le pone a los enteros."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def codigo_bolsa(v: object) -> str:
    """Normaliza el codigo igual que la app: los numeros pierden ceros a la izquierda."""
    s = texto(v)
    s = re.sub(r"\s+", " ", s).strip()
    if re.fullmatch(r"\d+", s):
        return str(int(s))
    return s


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
# Lectura de la planilla
# ---------------------------------------------------------------------------
class Bloque:
    def __init__(self, semana: str, rut: str, fecha: str | None):
        self.semana = semana
        self.rut = rut
        self.fecha = fecha
        # {codigo_bolsa: {prenda: cantidad}}
        self.filas: dict[str, dict[str, int]] = {}

    @property
    def unidades(self) -> int:
        return sum(sum(p.values()) for p in self.filas.values())


def leer_planilla(ruta: Path) -> tuple[list[Bloque], dict[str, dict[str, int]]]:
    """Devuelve (bloques con cantidades, resumen del mes por empresa)."""
    ws = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    filas = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))

    def celda(fila, j):
        return fila[j] if j < len(fila) else None

    bloques: list[Bloque] = []
    semana_actual = ""
    fecha_actual: str | None = None

    i = 0
    while i < len(filas):
        f = filas[i]
        b = texto(celda(f, 1))

        # "Semana N" en la columna B, con la fecha en la D.
        if norm(b).startswith("semana"):
            semana_actual = b
            crudo = celda(f, 3)
            fecha_actual = (
                crudo.date().isoformat() if hasattr(crudo, "date")
                else (texto(crudo)[:10] or None)
            )
            i += 1
            continue

        # Un bloque de empresa arranca con su nombre y sigue con el encabezado
        # "Numero bolsa". Sin ese encabezado no es una grilla: mas abajo hay
        # bloques de resumen que tambien llevan el nombre de la empresa.
        rut = EMPRESAS_POR_NOMBRE.get(norm(b))
        if rut and semana_actual:
            cab = filas[i + 1] if i + 1 < len(filas) else ()
            if norm(texto(celda(cab, 1))) != "numero bolsa":
                i += 1
                continue

            # Las prendas son las columnas del encabezado, de la D en adelante
            # y hasta la primera vacia. El corte importa: a la derecha de la
            # grilla, separado por una columna en blanco, hay otro bloque
            # ("Item | Valor") con el neto y el IVA de la semana. Sin el corte
            # esos dos entran como prendas y sus montos como cantidades, que
            # fue justo lo que paso: 391.383 "prendas" en una semana.
            prendas: dict[int, str] = {}
            for j in range(3, len(cab)):
                nombre = texto(celda(cab, j))
                if not nombre:
                    break
                prendas[j] = nombre

            bloque = Bloque(semana_actual, rut, fecha_actual)
            k = i + 2
            while k < len(filas):
                fk = filas[k]
                # El bloque termina en la fila de totales.
                if norm(texto(celda(fk, 2))) == "total":
                    break
                cod = codigo_bolsa(celda(fk, 1))
                if cod and cod != "0":
                    items = {}
                    for j, nombre in prendas.items():
                        v = celda(fk, j)
                        if isinstance(v, (int, float)) and v:
                            items[nombre] = int(v)
                    if items:
                        # La misma bolsa dos veces en un bloque se suma.
                        prev = bloque.filas.setdefault(cod, {})
                        for n, c in items.items():
                            prev[n] = prev.get(n, 0) + c
                k += 1

            if bloque.filas:
                bloques.append(bloque)
            i = k + 1
            continue

        i += 1

    return bloques, leer_resumen(filas)


def leer_resumen(filas) -> dict[str, dict[str, int]]:
    """El bloque final: cantidad por prenda de cada empresa en el mes."""
    def celda(fila, j):
        return fila[j] if j < len(fila) else None

    resumen: dict[str, dict[str, int]] = {}
    for i, f in enumerate(filas):
        rut = EMPRESAS_POR_NOMBRE.get(norm(texto(celda(f, 1))))
        # El resumen se distingue de la grilla porque la fila de abajo dice
        # "Cantidad" en vez de "Numero bolsa".
        sig = filas[i + 1] if i + 1 < len(filas) else ()
        if not rut or norm(texto(celda(sig, 1))) != "cantidad":
            continue

        prendas = {}
        for j in range(2, len(f)):
            nombre = texto(celda(f, j))
            if not nombre:
                continue
            v = celda(sig, j)
            prendas[nombre] = int(v) if isinstance(v, (int, float)) else 0
        if prendas:
            resumen[rut] = prendas
    return resumen


# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("planilla")
    ap.add_argument("--periodo", required=True, help="YYYY-MM, para el detalle de la guia")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    bloques, resumen = leer_planilla(Path(args.planilla))
    if not bloques:
        sys.exit("No se encontro ninguna grilla con fila 'Numero bolsa'.")

    env = cargar_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL / la key en .env.local")
    supa = Supa(url, key)

    ruts = sorted({b.rut for b in bloques})

    # Catalogo y padron de cada empresa, para traducir nombres y codigos a ids.
    catalogo: dict[str, dict[str, tuple[str, int | None]]] = {}
    bolsas: dict[str, dict[str, int]] = {}
    for rut in ruts:
        filas = supa.pedir(
            "GET", f"empresa_productos?rut_empresa=eq.{rut}"
                   "&select=producto_empresa_id,precio,productos_empresa(nombre)") or []
        catalogo[rut] = {
            norm((f.get("productos_empresa") or {}).get("nombre")):
                (f["producto_empresa_id"], f.get("precio"))
            for f in filas
        }
        filas = supa.pedir(
            "GET", f"empresa_bolsas?rut_empresa=eq.{rut}&select=id,codigo") or []
        bolsas[rut] = {codigo_bolsa(f["codigo"]).lower(): f["id"] for f in filas}

    # ----- Validacion -----
    faltan_prenda: set[str] = set()
    faltan_bolsa: set[str] = set()
    cantidades: dict[str, dict[str, int]] = {r: {} for r in ruts}

    for b in bloques:
        for cod, items in b.filas.items():
            if cod.lower() not in bolsas[b.rut]:
                faltan_bolsa.add(f"{b.rut} -> {cod}")
            for prenda, cant in items.items():
                if norm(prenda) not in catalogo[b.rut]:
                    faltan_prenda.add(f"{b.rut} -> {prenda}")
                acc = cantidades[b.rut]
                acc[norm(prenda)] = acc.get(norm(prenda), 0) + cant

    print(f"Planilla: {Path(args.planilla).name}   periodo {args.periodo}")
    for b in bloques:
        print(f"  {b.semana:10} {b.rut:12} {b.fecha or 'SIN FECHA':10} "
              f"{len(b.filas):>3} bolsas  {b.unidades:>5} prendas")

    if faltan_prenda or faltan_bolsa:
        if faltan_prenda:
            print(f"\n  PRENDAS QUE NO ESTAN EN EL CATALOGO DE LA EMPRESA:")
            for p in sorted(faltan_prenda):
                print(f"     {p}")
        if faltan_bolsa:
            print(f"\n  BOLSAS QUE NO ESTAN EN EL PADRON:")
            for p in sorted(faltan_bolsa):
                print(f"     {p}")
        sys.exit("\nNo se carga nada hasta resolver eso. Corre 06_alta_empresa_bolsas.py.")

    sin_fecha = [b for b in bloques if not b.fecha]
    if sin_fecha:
        print(f"\n  SIN FECHA: {', '.join(b.semana for b in sin_fecha)}")
        sys.exit("\nUna guia sin fecha no se puede ubicar en el tiempo ni facturar.")

    # ----- Cotejo contra el resumen del mes -----
    print("\nCotejo contra el resumen de la planilla:")
    descuadre = False
    for rut in ruts:
        esperado = resumen.get(rut)
        if not esperado:
            print(f"  {rut}: la planilla no trae resumen, no se puede cotejar")
            continue
        neto = 0
        for prenda_norm, cant in cantidades[rut].items():
            _, precio = catalogo[rut][prenda_norm]
            neto += (precio or 0) * cant
        esperado_norm = {norm(k): v for k, v in esperado.items()}
        iguales = all(
            cantidades[rut].get(k, 0) == v for k, v in esperado_norm.items()
        ) and all(
            esperado_norm.get(k, 0) == v for k, v in cantidades[rut].items()
        )
        marca = "OK" if iguales else "NO COINCIDE"
        print(f"  {rut}  neto ${neto:,}".replace(",", ".") + f"   {marca}")
        if not iguales:
            descuadre = True
            for k in sorted(set(esperado_norm) | set(cantidades[rut])):
                a, e = cantidades[rut].get(k, 0), esperado_norm.get(k, 0)
                if a != e:
                    print(f"       {k:20} grillas {a:>5}   resumen {e:>5}")

    if descuadre:
        sys.exit("\nLas grillas no reproducen el resumen de la planilla. "
                 "Algo se leyo mal: no se carga nada.")

    if not args.apply:
        print("\nSIMULACION. Volve a correr con --apply.")
        return 0

    # ----- Escritura -----
    print("\nAplicando...")
    creadas = 0
    for b in bloques:
        ya = supa.pedir(
            "GET", f"pedidos_empresa?rut_empresa=eq.{b.rut}"
                   f"&fecha=gte.{b.fecha}T00:00:00&fecha=lt.{b.fecha}T23:59:59"
                   "&select=id") or []
        if ya:
            print(f"  {b.semana:10} {b.rut:12} ya existe (guia #{ya[0]['id']}), se saltea")
            continue

        items = []
        for cod, prendas in b.filas.items():
            bolsa_id = bolsas[b.rut][cod.lower()]
            for prenda, cant in prendas.items():
                pid, precio = catalogo[b.rut][norm(prenda)]
                items.append({
                    "producto_empresa_id": pid,
                    "producto_empresa_nombre": prenda,
                    "precio_unidad": precio,
                    "cantidad": cant,
                    "detalle_prenda": None,
                    "bolsa_id": bolsa_id,
                })

        nuevo = supa.pedir("POST", "rpc/crear_pedido_empresa", {
            "p_pedido": {
                "rut_empresa": b.rut,
                "alias": None,
                # Mediodia de Chile: asi el dia no se corre al mostrarlo.
                "fecha": f"{b.fecha}T12:00:00-03:00",
                "detalle": f"{b.semana} — {args.periodo}",
                "express": False,
            },
            "p_items": items,
        })
        creadas += 1
        print(f"  {b.semana:10} {b.rut:12} guia #{nuevo}  "
              f"{len(b.filas)} bolsas, {len(items)} lineas")

    print(f"\n{creadas} guia{'' if creadas == 1 else 's'} creada"
          f"{'' if creadas == 1 else 's'}.")
    print("El 'Traslado' del resumen no se cargo: no sale de las grillas. "
          "Va aparte al facturar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
