/**
 * Traducir un cambio de la base a algo que se pueda leer.
 *
 * El trigger de `migrations/0021` guarda solo las claves que cambiaron, en
 * crudo y con los nombres de las columnas:
 *
 *   antes   {"estado": "recibido", "total_venta": 12000}
 *   despues {"estado": "entregado", "total_venta": 14500}
 *
 * Eso es exacto y es ilegible. Lo que alguien quiere ver es:
 *
 *   estado           recibido → entregado
 *   total            $12.000 → $14.500
 *
 * Este archivo es solo esa traducción. Está separado de la pantalla a
 * propósito: es la parte con reglas (qué campo se muestra, cómo se formatea
 * cada tipo, qué se esconde) y es la que conviene tener testeada.
 */

import { formatCLP } from "./format";

/** Nombres de columna → cómo se llaman para una persona. */
const ETIQUETAS: Record<string, string> = {
  // pedidos
  estado: "estado",
  pagado: "pagado",
  forma_pago: "forma de pago",
  monto_abonado: "abonado",
  total_venta: "total",
  nombre_cliente: "cliente",
  rut_cliente: "RUT",
  fecha_recepcion: "fecha de recepción",
  fecha_entrega: "fecha de entrega",
  fecha_retiro: "fecha de retiro",
  fecha_pago: "fecha de pago",
  aviso_enviado: "aviso enviado",
  notas: "notas",
  direccion: "dirección",
  contacto: "contacto",
  // guías de empresa
  rut_empresa: "empresa",
  alias: "alias",
  detalle: "detalle",
  express: "express",
  anulado: "anulado",
  fecha: "fecha",
  // catálogo y precios
  nombre: "nombre",
  precio: "precio",
  activo: "activo",
  tipo_servicio: "servicio",
  unidad_cobro: "unidad de cobro",
  orden: "orden",
  en_grilla: "en la grilla",
  recargo_express: "recargo express",
  usa_bolsas: "trabaja por bolsas",
  producto_empresa_id: "prenda",
  codigo: "código",
  // clientes
  telefono: "teléfono",
  correo: "correo",
  comuna: "comuna",
  calle: "calle",
  dpto: "depto",
  contacto_1: "contacto 1",
  contacto_2: "contacto 2",
};

/** Tablas → cómo se llaman, y a dónde se puede ir a verlas. */
const ENTIDADES: Record<string, { label: string; ruta?: (id: string) => string }> = {
  pedidos: { label: "Pedido", ruta: (id) => `/pedidos/${id}` },
  pedidos_empresa: {
    label: "Guía",
    ruta: (id) => `/empresas/pedidos/${id}`,
  },
  clientes: { label: "Cliente" },
  clientes_empresa: {
    label: "Empresa",
    ruta: (id) => `/empresas/${encodeURIComponent(id)}`,
  },
  productos: { label: "Prenda", ruta: () => "/catalogo" },
  productos_empresa: { label: "Prenda de empresa" },
  empresa_bolsas: { label: "Bolsa" },
  empresa_productos: { label: "Precio de empresa" },
  // Las que escriben los server actions a mano.
  producto: { label: "Prenda", ruta: () => "/catalogo" },
  factura: { label: "Factura", ruta: (id) => `/finanzas/facturas/${id}` },
  gasto: { label: "Gasto", ruta: () => "/finanzas/gastos" },
};

/** Campos que cambian solos y no aportan nada al leer. */
const OCULTOS = new Set(["created_at", "updated_at", "id"]);

/** Los que son plata y se muestran como tal. */
const MONEDA = new Set([
  "precio",
  "total_venta",
  "monto_abonado",
  "recargo_express",
  "monto",
  "total",
]);

export type Accion = "alta" | "edicion" | "baja" | string;

export interface RegistroAuditoria {
  id: number;
  ts: string;
  user_email: string | null;
  entidad: string;
  entidad_id: string;
  accion: Accion;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

export interface CambioLegible {
  campo: string;
  antes: string;
  despues: string;
}

/** Cómo se llama esta tabla para una persona. */
export function etiquetaEntidad(entidad: string): string {
  return ENTIDADES[entidad]?.label ?? entidad;
}

/** A dónde ir a ver la cosa que cambió, si hay dónde. */
export function rutaEntidad(entidad: string, id: string): string | null {
  const e = ENTIDADES[entidad];
  if (!e?.ruta) return null;
  // Las claves compuestas se guardan unidas con "|" y no apuntan a ningún
  // lado: no hay pantalla para "el precio de la polera en Termomin".
  if (id.includes("|")) return null;
  return e.ruta(id);
}

/**
 * Un valor crudo, escrito como se lee.
 *
 * Las fechas se muestran en día, no en hora: el `ts` del registro ya dice
 * cuándo pasó, y lo que interesa del campo es a qué día quedó apuntando.
 */
export function formatearValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (MONEDA.has(campo) && typeof valor === "number") return formatCLP(valor);
  if (MONEDA.has(campo) && typeof valor === "string" && valor !== "") {
    const n = Number(valor);
    if (!Number.isNaN(n)) return formatCLP(n);
  }
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  const s = String(valor);
  return s === "" ? "—" : s;
}

/** Cómo se llama esta columna para una persona. */
export function etiquetaCampo(campo: string): string {
  return ETIQUETAS[campo] ?? campo.replace(/_/g, " ");
}

/** Las prendas que cambiaron, cuando la acción es "items". */
function cambiosDeItems(reg: RegistroAuditoria): CambioLegible[] {
  const antes = (reg.antes?.prendas ?? {}) as Record<string, string>;
  const despues = (reg.despues?.prendas ?? {}) as Record<string, string>;
  return [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((prenda) => ({
      campo: prenda,
      antes: antes[prenda] ?? "—",
      despues: despues[prenda] ?? "—",
    }));
}

/**
 * Los cambios de un registro, listos para poner en pantalla.
 *
 * En un alta no hay "antes", así que se listan los campos con los que nació,
 * salteando los vacíos: una prenda nueva sin notas no necesita una línea que
 * diga "notas: —".
 */
export function cambiosLegibles(reg: RegistroAuditoria): CambioLegible[] {
  // Los cambios de prendas no son campos de una tabla: vienen de comparar
  // dos listas de líneas, y se guardan bajo "prendas" (ver lib/diff-items).
  if (reg.accion === "items") return cambiosDeItems(reg);

  const antes = reg.antes ?? {};
  const despues = reg.despues ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .filter((c) => !OCULTOS.has(c))
    .sort((a, b) => etiquetaCampo(a).localeCompare(etiquetaCampo(b), "es"));

  return campos
    .map((campo) => ({
      campo: etiquetaCampo(campo),
      antes: formatearValor(campo, antes[campo]),
      despues: formatearValor(campo, despues[campo]),
    }))
    .filter((c) => {
      // En un alta o una baja, los campos vacíos no dicen nada.
      if (reg.accion === "alta") return c.despues !== "—";
      if (reg.accion === "baja") return c.antes !== "—";
      return c.antes !== c.despues;
    });
}

/** Una línea de resumen para cuando no hay espacio para el detalle. */
export function resumenCambio(reg: RegistroAuditoria): string {
  if (reg.accion === "items") {
    const r = reg.despues?.resumen;
    return typeof r === "string" ? `prendas: ${r}` : "cambió las prendas";
  }
  const cambios = cambiosLegibles(reg);
  if (reg.accion === "alta") return "se creó";
  if (reg.accion === "baja") return "se eliminó";
  if (cambios.length === 0) return "sin cambios visibles";
  if (cambios.length === 1) {
    const c = cambios[0];
    return `${c.campo}: ${c.antes} → ${c.despues}`;
  }
  return cambios.map((c) => c.campo).join(", ");
}

/** Quién lo hizo, sabiendo que a veces no hay quién. */
export function quienLoHizo(email: string | null): string {
  // Los scripts del ETL usan la service role, que no tiene usuario. Decir
  // "sistema" sería mentir un poco: fue alguien corriendo un script.
  return email ?? "script / ETL";
}

/**
 * Las opciones de los filtros.
 *
 * Viven acá y no junto a las consultas porque las lee el `<select>`, que
 * corre en el navegador: `lib/data/auditoria.ts` es `server-only` y no se
 * puede importar desde un componente de cliente.
 */
export const ENTIDADES_AUDITADAS = [
  { valor: "todas", label: "Todo" },
  { valor: "pedidos", label: "Pedidos" },
  { valor: "pedidos_empresa", label: "Guías" },
  { valor: "clientes", label: "Clientes" },
  { valor: "clientes_empresa", label: "Empresas" },
  { valor: "productos", label: "Catálogo" },
  { valor: "empresa_productos", label: "Precios de empresa" },
  { valor: "empresa_bolsas", label: "Bolsas" },
] as const;

export const ACCIONES = [
  { valor: "todas", label: "Todo" },
  { valor: "alta", label: "Altas" },
  { valor: "edicion", label: "Ediciones" },
  { valor: "items", label: "Cambios de prendas" },
  { valor: "baja", label: "Bajas" },
] as const;
