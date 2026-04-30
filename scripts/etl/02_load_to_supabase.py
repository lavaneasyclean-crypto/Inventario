"""
Limpia los CSVs exportados del Access y los carga a Supabase via PostgREST.

Pre-requisitos:
  1. Haber corrido `01_export_access.ps1` (genera _out/raw/*.csv)
  2. Haber aplicado migrations/0001_init.sql en Supabase
  3. .env.local en la raíz con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY

Uso:
  python scripts/etl/02_load_to_supabase.py [--force]

Por defecto aborta si la tabla `pedidos` ya tiene filas. Usar --force para truncar y recargar.

Salidas:
  _out/clean/*.csv             — filas que se cargaron (referencia)
  _out/cuarentena/*.csv        — filas descartadas, con motivo
  _out/load_report.txt         — resumen
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT       = Path(__file__).resolve().parents[2]
RAW_DIR    = Path(__file__).parent / "_out" / "raw"
CLEAN_DIR  = Path(__file__).parent / "_out" / "clean"
QUAR_DIR   = Path(__file__).parent / "_out" / "cuarentena"
REPORT     = Path(__file__).parent / "_out" / "load_report.txt"
ENV_FILE   = ROOT / ".env.local"

CHILE = ZoneInfo("America/Santiago")
BATCH_SIZE = 500

# ---------------------------------------------------------------------------
# .env loader (stdlib only)
# ---------------------------------------------------------------------------
def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        sys.exit(f"No existe {path}. Crear con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

# ---------------------------------------------------------------------------
# PostgREST client (stdlib urllib)
# ---------------------------------------------------------------------------
class Supa:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def _req(self, method: str, path: str, body: Any = None, prefer: str | None = None) -> bytes:
        url = f"{self.base}{path}"
        data = None if body is None else json.dumps(body, default=str).encode("utf-8")
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {method} {path}\n{err_body}") from None

    def count(self, table: str) -> int:
        url = f"{self.base}/rest/v1/{table}?select=count"
        req = urllib.request.Request(url, method="GET", headers={
            **self.headers,
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": "0-0",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            cr = resp.headers.get("Content-Range", "")
        # Content-Range: 0-0/123  -> 123
        m = re.search(r"/(\d+)$", cr or "")
        return int(m.group(1)) if m else 0

    def truncate(self, table: str) -> None:
        # PostgREST no expone DELETE sin filtros; se requiere ?id=neq.<imposible>
        # Para id text/bigint usamos NOT IS NULL como always-true.
        self._req("DELETE", f"/rest/v1/{table}?id=not.is.null")

    def truncate_text_pk(self, table: str, pk: str) -> None:
        self._req("DELETE", f"/rest/v1/{table}?{pk}=not.is.null")

    def insert(self, table: str, rows: list[dict]) -> None:
        if not rows:
            return
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            self._req("POST", f"/rest/v1/{table}", body=batch)

    def rpc(self, fn: str, args: dict) -> bytes:
        return self._req("POST", f"/rest/v1/rpc/{fn}", body=args)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def read_csv(name: str) -> list[dict[str, str]]:
    path = RAW_DIR / f"{name}.csv"
    if not path.exists():
        sys.exit(f"No existe {path}. Correr 01_export_access.ps1 primero.")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def s(v: Any) -> str | None:
    """Empty string / 'None' / whitespace -> None; otherwise stripped string."""
    if v is None:
        return None
    t = str(v).strip()
    if not t or t.lower() in ("none", "null"):
        return None
    return t

def to_bool(v: Any) -> bool:
    if v is None:
        return False
    return str(v).strip().lower() in ("true", "1", "verdadero", "yes", "y", "sí", "si")

def to_int(v: Any, default: int | None = None) -> int | None:
    t = s(v)
    if t is None:
        return default
    try:
        return int(float(t))
    except ValueError:
        return default

def to_decimal_str(v: Any, default: str = "0") -> str:
    """Decimales: aceptar '1500', '1500,00', '1.500,00', '1500.00'. Devuelve string para JSON."""
    t = s(v)
    if t is None:
        return default
    # Heurística: si tiene coma y punto, asume formato "1.500,00" (CL). Si solo coma, "1500,00".
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        return f"{float(t):.2f}"
    except ValueError:
        return default

def to_iso_chile(v: Any) -> str | None:
    """Convierte 'YYYY-MM-DDTHH:MM:SS' (naïve, hora local CL) a ISO con TZ."""
    t = s(v)
    if t is None:
        return None
    try:
        dt = datetime.fromisoformat(t)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CHILE)
    return dt.isoformat()

def is_year_invalid(iso: str | None) -> bool:
    if iso is None:
        return False
    try:
        return datetime.fromisoformat(iso).year > 2030
    except ValueError:
        return True

# RUT chileno: 1-8 dígitos, guión, dígito verificador (0-9 o K)
RUT_RE = re.compile(r"^(\d{1,8})-([\dkK])$")

def normalize_rut(raw: Any) -> str | None:
    t = s(raw)
    if t is None:
        return None
    t = t.replace(".", "").replace(" ", "").upper()
    # A veces viene sin guión: "123456785" -> "12345678-5"
    if "-" not in t and t and t[-1].isalnum():
        t = t[:-1] + "-" + t[-1]
    m = RUT_RE.match(t)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2).upper()}"


# ---------------------------------------------------------------------------
# Mappings
# ---------------------------------------------------------------------------
TIPO_SERVICIO_MAP = {
    "lavado": "lavado",
    "seco": "seco",
    "planchado": "planchado",
    "manchas": "manchas",
    "aplicaciones": "aplicaciones",
    "ganchos": "ganchos",
    "delivery": "delivery",
    "pedido especial": "pedido_especial",
    "descuento": "descuento",
    "secado": "secado",
}

FORMA_PAGO_MAP = {
    "efectivo": "efectivo",
    "transferencia": "transferencia",
    "redcompra": "redcompra",
    "no pago": "no_pago",
    "": "no_pago",
}

def map_tipo_servicio(v: Any) -> str | None:
    t = s(v)
    if t is None:
        return None
    return TIPO_SERVICIO_MAP.get(t.lower())

def map_forma_pago(v: Any) -> str:
    t = s(v) or ""
    return FORMA_PAGO_MAP.get(t.lower(), "no_pago")

def estado_from_flags(finalizado: bool, retirado: bool) -> str:
    if retirado:
        return "entregado"
    if finalizado:
        return "listo"
    return "recibido"


# ---------------------------------------------------------------------------
# Cuarentena
# ---------------------------------------------------------------------------
quarantine: dict[str, list[dict]] = defaultdict(list)

def quarantine_row(origen: str, motivo: str, payload: dict) -> None:
    quarantine[origen].append({"motivo": motivo, "payload": payload})


# ---------------------------------------------------------------------------
# Transformaciones por tabla
# ---------------------------------------------------------------------------
def clean_clientes() -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for row in read_csv("Clientes"):
        rut = normalize_rut(row.get("RUT"))
        if rut is None:
            quarantine_row("Clientes", "rut_invalido", row)
            continue
        if rut in seen:
            quarantine_row("Clientes", "rut_duplicado", row)
            continue
        seen.add(rut)
        out.append({
            "rut": rut,
            "nombre":   s(row.get("Nombre")),
            "comuna":   s(row.get("Comuna")),
            "calle":    s(row.get("Calle")),
            "dpto":     s(row.get("Dpto")),
            "telefono": s(row.get("Teléfono")),
            "correo":   s(row.get("Correo")),
        })
    return out


def clean_clientes_empresa() -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for row in read_csv("Clientes_Empresa"):
        rut = normalize_rut(row.get("RUT_Empresa"))
        if rut is None:
            quarantine_row("Clientes_Empresa", "rut_invalido", row)
            continue
        if rut in seen:
            quarantine_row("Clientes_Empresa", "rut_duplicado", row)
            continue
        seen.add(rut)
        out.append({
            "rut":         rut,
            "nombre":      s(row.get("Nombre")) or "(sin nombre)",
            "alias":       s(row.get("Alias")),
            "comuna":      s(row.get("Comuna")),
            "calle":       s(row.get("Calle")),
            "contacto_1":  s(row.get("Contacto 1")),
            "contacto_2":  s(row.get("Contacto 2")),
            "correo":      s(row.get("Correo")),
        })
    return out


def clean_productos() -> tuple[list[dict], set[str]]:
    out: list[dict] = []
    ids: set[str] = set()
    for row in read_csv("Productos"):
        pid = s(row.get("ID_Producto"))
        if pid is None:
            quarantine_row("Productos", "id_vacio", row)
            continue
        if pid in ids:
            quarantine_row("Productos", "id_duplicado", row)
            continue
        ts = map_tipo_servicio(row.get("Tipo_Servicio"))
        if ts is None:
            quarantine_row("Productos", f"tipo_servicio_no_mapeado:{row.get('Tipo_Servicio')!r}", row)
            continue
        ids.add(pid)
        out.append({
            "id":            pid,
            "nombre":        s(row.get("Nombre_Producto")) or pid,
            "tipo_servicio": ts,
            "precio":        to_int(row.get("Precio"), 0) or 0,
        })
    return out, ids


def clean_productos_empresa() -> tuple[list[dict], set[str]]:
    out: list[dict] = []
    ids: set[str] = set()
    for row in read_csv("Producto_Empresa"):
        pid = s(row.get("ID_Producto_Empresa"))
        if pid is None or pid in ids:
            quarantine_row("Producto_Empresa", "id_invalido_o_dup", row)
            continue
        ids.add(pid)
        out.append({
            "id":     pid,
            "nombre": s(row.get("Nombre_Producto_Empresa")) or pid,
        })
    return out, ids


def clean_pedidos(valid_ruts: set[str]) -> tuple[list[dict], set[int]]:
    out: list[dict] = []
    ids: set[int] = set()
    for row in read_csv("Pedido"):
        pid = to_int(row.get("ID_Pedido"))
        if pid is None or pid in ids:
            quarantine_row("Pedido", "id_invalido_o_dup", row)
            continue
        fecha_rec = to_iso_chile(row.get("Fecha_Recepción"))
        if fecha_rec is None or is_year_invalid(fecha_rec):
            quarantine_row("Pedido", "fecha_recepcion_invalida", row)
            continue

        rut = normalize_rut(row.get("Rut_Cliente"))
        if rut is not None and rut not in valid_ruts:
            rut = None  # FK rota -> cliente desconocido, pedido se conserva

        finalizado = to_bool(row.get("Finalizado"))
        retirado   = to_bool(row.get("Retirado"))
        pagado     = to_bool(row.get("Pagado"))

        out.append({
            "id":              pid,
            "rut_cliente":     rut,
            "nombre_cliente":  s(row.get("Nombre_Cliente")),
            "contacto":        s(row.get("Contacto")),
            "direccion":       s(row.get("Direccion")),
            "estado":          estado_from_flags(finalizado, retirado),
            "pagado":          pagado,
            "forma_pago":      map_forma_pago(row.get("Forma_Pago")),
            "monto_abonado":   to_decimal_str(row.get("Cantidad Abonado")),
            "total_venta":     to_decimal_str(row.get("TotalVenta")),
            "aviso_enviado":   to_bool(row.get("Aviso")),
            "fecha_recepcion": fecha_rec,
            "fecha_pago":      to_iso_chile(row.get("Fecha_Pago")) if pagado else None,
            "fecha_entrega":   to_iso_chile(row.get("Fecha_Entrega")),
            "fecha_retiro":    to_iso_chile(row.get("Fecha_Retiro")) if retirado else None,
        })
        ids.add(pid)
    return out, ids


def clean_detalle_pedidos(valid_pedido_ids: set[int]) -> list[dict]:
    out: list[dict] = []
    for row in read_csv("Detalle_Pedidos"):
        pedido_id = to_int(row.get("ID_Pedido"))
        if pedido_id is None or pedido_id not in valid_pedido_ids:
            quarantine_row("Detalle_Pedidos", "pedido_huerfano", row)
            continue
        ts = map_tipo_servicio(row.get("Categoría_Producto"))
        if ts is None:
            quarantine_row("Detalle_Pedidos", f"categoria_no_mapeada:{row.get('Categoría_Producto')!r}", row)
            continue
        cantidad = to_int(row.get("Cantidad"), 0) or 0
        if cantidad <= 0:
            quarantine_row("Detalle_Pedidos", "cantidad_invalida", row)
            continue
        out.append({
            "pedido_id":              pedido_id,
            "producto_id":            s(row.get("ID_Producto")),
            "producto_nombre":        s(row.get("Nombre_Producto")) or "(sin nombre)",
            "producto_tipo_servicio": ts,
            "precio_unidad":          to_decimal_str(row.get("Precio_Unidad")),
            "cantidad":               cantidad,
            "importe":                to_decimal_str(row.get("Importe")),
            "detalle_prenda":         s(row.get("Detalle_Prenda")),
        })
    return out


def clean_pedidos_empresa(valid_ruts_empresa: set[str]) -> tuple[list[dict], set[int]]:
    out: list[dict] = []
    ids: set[int] = set()
    for row in read_csv("Pedido_Empresa"):
        pid = to_int(row.get("ID_Pedido_Empresa"))
        if pid is None or pid in ids:
            quarantine_row("Pedido_Empresa", "id_invalido_o_dup", row)
            continue
        fecha = to_iso_chile(row.get("Fecha"))
        if fecha is None or is_year_invalid(fecha):
            quarantine_row("Pedido_Empresa", "fecha_invalida", row)
            continue
        rut = normalize_rut(row.get("Rut_Empresa"))
        if rut is not None and rut not in valid_ruts_empresa:
            rut = None
        out.append({
            "id":          pid,
            "rut_empresa": rut,
            "alias":       s(row.get("Alias")),
            "fecha":       fecha,
            "detalle":     s(row.get("Detalle")),
        })
        ids.add(pid)
    return out, ids


def clean_detalle_pedidos_empresa(valid_pe_ids: set[int]) -> list[dict]:
    out: list[dict] = []
    for row in read_csv("Detalle_Pedido_Empresa"):
        pe_id = to_int(row.get("ID_Pedido_Empresa"))
        if pe_id is None or pe_id not in valid_pe_ids:
            quarantine_row("Detalle_Pedido_Empresa", "pedido_huerfano", row)
            continue
        cantidad = to_int(row.get("Cantidad"), 0) or 0
        if cantidad <= 0:
            quarantine_row("Detalle_Pedido_Empresa", "cantidad_invalida", row)
            continue
        out.append({
            "pedido_empresa_id":       pe_id,
            "producto_empresa_id":     s(row.get("ID_Producto")),
            "producto_empresa_nombre": s(row.get("Nombre_Producto")) or "(sin nombre)",
            "cantidad":                cantidad,
            "detalle_prenda":          s(row.get("Detalle_Prenda_Empresa")),
        })
    return out


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    force = "--force" in sys.argv

    env = load_env(ENV_FILE)
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")

    supa = Supa(url, key)

    print("-> Verificando estado de la base...")
    existing = supa.count("pedidos")
    if existing > 0 and not force:
        sys.exit(f"La tabla 'pedidos' ya tiene {existing} filas. Ejecutar con --force para truncar y recargar.")

    if force and existing > 0:
        print("-> --force: truncando tablas...")
        # Orden importa (FKs)
        supa._req("DELETE", "/rest/v1/pedidos_items?id=not.is.null")
        supa._req("DELETE", "/rest/v1/pedidos_empresa_items?id=not.is.null")
        supa._req("DELETE", "/rest/v1/pedidos?id=not.is.null")
        supa._req("DELETE", "/rest/v1/pedidos_empresa?id=not.is.null")
        supa._req("DELETE", "/rest/v1/clientes?rut=not.is.null")
        supa._req("DELETE", "/rest/v1/clientes_empresa?rut=not.is.null")
        supa._req("DELETE", "/rest/v1/productos?id=not.is.null")
        supa._req("DELETE", "/rest/v1/productos_empresa?id=not.is.null")
        supa._req("DELETE", "/rest/v1/_import_cuarentena?id=not.is.null")

    print("-> Limpiando datos...")
    clientes              = clean_clientes()
    clientes_empresa      = clean_clientes_empresa()
    productos, _          = clean_productos()
    productos_empresa, _  = clean_productos_empresa()

    valid_ruts            = {c["rut"] for c in clientes}
    valid_ruts_empresa    = {c["rut"] for c in clientes_empresa}

    pedidos, valid_pids   = clean_pedidos(valid_ruts)
    detalle_pedidos       = clean_detalle_pedidos(valid_pids)
    pedidos_empresa, valid_peids = clean_pedidos_empresa(valid_ruts_empresa)
    detalle_pe            = clean_detalle_pedidos_empresa(valid_peids)

    # Cuarentena -> DB
    cuar_rows = [
        {"origen": origen, "motivo": q["motivo"], "payload": q["payload"]}
        for origen, items in quarantine.items()
        for q in items
    ]

    counts = {
        "clientes":              len(clientes),
        "clientes_empresa":      len(clientes_empresa),
        "productos":             len(productos),
        "productos_empresa":     len(productos_empresa),
        "pedidos":               len(pedidos),
        "pedidos_items":         len(detalle_pedidos),
        "pedidos_empresa":       len(pedidos_empresa),
        "pedidos_empresa_items": len(detalle_pe),
        "_import_cuarentena":    len(cuar_rows),
    }
    print("\n-> A cargar:")
    for k, v in counts.items():
        print(f"     {k:.<30} {v:>6}")

    # Dump clean CSVs (referencia local)
    write_csv(CLEAN_DIR / "clientes.csv",              clientes)
    write_csv(CLEAN_DIR / "clientes_empresa.csv",      clientes_empresa)
    write_csv(CLEAN_DIR / "productos.csv",             productos)
    write_csv(CLEAN_DIR / "productos_empresa.csv",     productos_empresa)
    write_csv(CLEAN_DIR / "pedidos.csv",               pedidos)
    write_csv(CLEAN_DIR / "pedidos_items.csv",         detalle_pedidos)
    write_csv(CLEAN_DIR / "pedidos_empresa.csv",       pedidos_empresa)
    write_csv(CLEAN_DIR / "pedidos_empresa_items.csv", detalle_pe)

    # Cuarentena CSV legible
    for origen, items in quarantine.items():
        rows = [{"motivo": q["motivo"], **q["payload"]} for q in items]
        write_csv(QUAR_DIR / f"{origen}.csv", rows)

    print("\n-> Insertando en Supabase...")
    supa.insert("clientes",              clientes)
    supa.insert("clientes_empresa",      clientes_empresa)
    supa.insert("productos",             productos)
    supa.insert("productos_empresa",     productos_empresa)
    supa.insert("pedidos",               pedidos)
    supa.insert("pedidos_items",         detalle_pedidos)
    supa.insert("pedidos_empresa",       pedidos_empresa)
    supa.insert("pedidos_empresa_items", detalle_pe)
    supa.insert("_import_cuarentena",    cuar_rows)

    # Verificación
    print("\n-> Verificando counts post-load:")
    final = {t: supa.count(t) for t in counts}
    for k in counts:
        ok = "OK" if final[k] == counts[k] else "MISMATCH"
        print(f"     {k:.<30} esperado {counts[k]:>6}, real {final[k]:>6}  {ok}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", encoding="utf-8") as f:
        f.write(f"Load report — {datetime.now().isoformat()}\n\n")
        for k, v in counts.items():
            f.write(f"{k}: cargadas={v}, real={final[k]}\n")
        f.write("\nCuarentena por origen:\n")
        for origen, items in quarantine.items():
            f.write(f"  {origen}: {len(items)}\n")

    print(f"\n[OK] Listo. Reporte en {REPORT}")
    print("\n[!] Después de cargar, en Supabase SQL Editor ejecutar:")
    print("    select setval('pedidos_id_seq', (select max(id) from pedidos));")
    print("    select setval('pedidos_empresa_id_seq', (select max(id) from pedidos_empresa));")
    return 0


if __name__ == "__main__":
    sys.exit(main())
