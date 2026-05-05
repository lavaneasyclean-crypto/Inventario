/**
 * Utilidades para RUTs chilenos.
 *
 * Formato canónico: dígitos sin puntos + guión + DV (mayúsculas si es K).
 * Ej: "12345678-9", "10521674-2", "76116233-K"
 */

// Para normalizar aceptamos k minuscula (la pasamos a K).
const RUT_NORMALIZE_RE = /^(\d{1,8})-([\dkK])$/;
// Para validar el formato canonico solo aceptamos K mayuscula.
const RUT_CANONICAL_RE = /^(\d{1,8})-([\dK])$/;

/**
 * Normaliza un RUT:
 *  - quita puntos y espacios
 *  - mayúsculas (K)
 *  - inserta guión si vino sin él (último char es DV)
 *
 * Devuelve null si no parece RUT (no es número-DV o no matchea regex).
 */
export function normalizeRut(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let t = String(raw).trim();
  if (!t) return null;
  t = t.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  // Si vino sin guión: insertar entre el penúltimo y el último char
  if (!t.includes("-") && t.length >= 2 && /^[\dK]+$/.test(t)) {
    t = `${t.slice(0, -1)}-${t.slice(-1)}`;
  }
  const m = RUT_NORMALIZE_RE.exec(t);
  if (!m) return null;
  return `${m[1]}-${m[2].toUpperCase()}`;
}

/** True si el string ya esta en formato canonico (K en mayuscula). */
export function isValidRutFormat(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return RUT_CANONICAL_RE.test(s);
}
