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

/**
 * Digito verificador segun el modulo 11 que usa el SII.
 *
 * Se recorre el numero de derecha a izquierda multiplicando por 2,3,4,5,6,7 y
 * volviendo a empezar. El resto de 11 menos la suma da el digito; 11 es 0 y
 * 10 es K.
 */
export function digitoVerificador(numero: string): string {
  let suma = 0;
  let multiplicador = 2;

  for (let i = numero.length - 1; i >= 0; i--) {
    suma += Number(numero[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * True si el RUT existe de verdad: formato correcto **y** digito verificador
 * que cuadra.
 *
 * `isValidRutFormat` solo mira la forma, asi que "12345678-9" le pasaba aunque
 * el digito este mal. Eso dejaba entrar RUTs inventados, que despues no se
 * pueden corregir sin tocar todos los pedidos que cuelgan de ellos: el RUT es
 * la clave primaria del cliente.
 */
export function rutValido(raw: unknown): boolean {
  const normalizado = normalizeRut(raw);
  if (!normalizado) return false;

  const [numero, dv] = normalizado.split("-");
  // Menos de 7 digitos no es un RUT de persona: son rangos que el SII no
  // asigna, y casi siempre es alguien tipeando cualquier cosa.
  if (numero.length < 7) return false;

  return digitoVerificador(numero) === dv;
}
