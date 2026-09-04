/**
 * Mensajes de error para el mostrador.
 *
 * Los server actions devuelven el texto del error directo a la pantalla, y
 * hasta ahora salía el mensaje crudo de Postgres junto con el nombre interno
 * del paso donde se cayó:
 *
 *   Error inesperado en el paso "insert-items": duplicate key value violates
 *   unique constraint "pedidos_pkey"
 *
 * Eso no le dice nada a quien está atendiendo y de paso publica detalle del
 * esquema. El detalle completo se sigue registrando en el log del servidor,
 * que es donde sirve para diagnosticar.
 */

export const MENSAJE_GENERICO =
  "No se pudo completar la operación. Volvé a intentarlo en unos segundos.";

export const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con la base de datos. Revisá la conexión e intentá de nuevo.";

/** Códigos de Postgres y de PostgREST que tienen una explicación útil. */
const POR_CODIGO: Record<string, string> = {
  "23502": "Quedó un campo obligatorio sin completar.",
  "23503": "El registro relacionado no existe o fue eliminado.",
  "23505": "Ya existe un registro con esos datos.",
  "23514": "Alguno de los valores no es válido.",
  "22P02": "Alguno de los valores tiene un formato que no corresponde.",
  "42501": "Tu usuario no tiene permiso para hacer esto.",
  PGRST202:
    "Falta aplicar una migración en la base de datos: la función que usa esta pantalla todavía no existe.",
  PGRST301: "La sesión expiró. Volvé a iniciar sesión.",
};

function leerCodigo(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

function leerMensaje(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

/**
 * Traduce el error a algo que se pueda mostrar en pantalla. Nunca devuelve el
 * mensaje crudo del motor: si no hay una explicación conocida, cae al
 * genérico.
 */
export function mensajeUsuario(error: unknown): string {
  const codigo = leerCodigo(error);
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];

  // El cliente de Supabase envuelve los fallos de red en un TypeError sin
  // código, así que el único indicio es el texto.
  const texto = leerMensaje(error).toLowerCase();
  if (
    texto.includes("fetch failed") ||
    texto.includes("network") ||
    texto.includes("enotfound") ||
    texto.includes("econnrefused")
  ) {
    return MENSAJE_SIN_CONEXION;
  }

  return MENSAJE_GENERICO;
}

/**
 * Deja el detalle completo en el log del servidor (Netlify Functions). El
 * `paso` es la traza que antes viajaba a la UI: acá sigue siendo útil.
 */
export function registrarError(
  contexto: string,
  paso: string,
  error: unknown,
): void {
  console.error(`[${contexto}] paso=${paso}`, error);
}

/**
 * Atajo para el caso de siempre: registrar el detalle y devolverle a la UI un
 * mensaje que se pueda leer.
 */
export function fallo(
  contexto: string,
  paso: string,
  error: unknown,
): { ok: false; error: string } {
  registrarError(contexto, paso, error);
  return { ok: false, error: mensajeUsuario(error) };
}
