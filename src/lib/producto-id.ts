/**
 * Generación de IDs de productos retail por prefijo según tipo de servicio.
 * Mantiene el patrón histórico del Access (SC027, LES019, PL005, AA005).
 */
import type { TipoServicio } from "./types";

export const PREFIX_BY_TIPO: Record<TipoServicio, string> = {
  lavado:          "SC",
  secado:          "SC",
  seco:            "LES",
  planchado:       "PL",
  manchas:         "AA",
  aplicaciones:    "AA",
  ganchos:         "AA",
  delivery:        "AA",
  pedido_especial: "AA",
  descuento:       "AA",
};

/**
 * Dado un tipo de servicio y la lista actual de IDs existentes, devuelve
 * el siguiente ID con padding a 3 dígitos. Si supera los 999 cae a un
 * fallback con timestamp para no colisionar.
 */
export function nextProductoId(
  tipo: TipoServicio,
  existingIds: readonly string[],
): string {
  const prefix = PREFIX_BY_TIPO[tipo];
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const numPart = id.slice(prefix.length);
    if (/^\d+$/.test(numPart)) {
      const n = parseInt(numPart, 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  if (next < 1000) return `${prefix}${String(next).padStart(3, "0")}`;
  return `${prefix}${Date.now()}`;
}

/**
 * Genera el siguiente ID secuencial global para productos_empresa
 * (sin prefijo, padding a 3 dígitos).
 */
export function nextProductoEmpresaId(existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    if (/^\d+$/.test(id)) {
      const n = parseInt(id, 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  if (next < 1000) return String(next).padStart(3, "0");
  return `EMP${Date.now()}`;
}
