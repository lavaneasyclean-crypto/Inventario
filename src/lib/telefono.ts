/**
 * Teléfonos.
 *
 * Los 400 teléfonos que ya estaban cargados usan todos la misma forma:
 * `+56 9 2032 8180` para celulares y `+56 2 2321 5637` para fijos. Lo que se
 * escriba desde ahora tiene que quedar igual, o la búsqueda por teléfono
 * empieza a fallar contra la mitad de los datos.
 *
 * De vez en cuando aparece un cliente extranjero, así que no alcanza con
 * asumir Chile: hace falta poder guardar un número de otro país tal como la
 * persona lo dicta.
 */

/** Chile: 9 dígitos después del +56. Celulares empiezan con 9. */
const DIGITOS_CL = 9;

export function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Agrupa los 9 dígitos chilenos como `9 1234 5678`.
 *
 * Formatea de a poco mientras se escribe, sin esperar a que esté completo:
 * así se ve el error de tipeo en el momento y no al apretar guardar.
 */
export function formatearChileno(entrada: string): string {
  const d = soloDigitos(entrada).slice(0, DIGITOS_CL);
  if (d.length <= 1) return d;
  if (d.length <= 5) return `${d.slice(0, 1)} ${d.slice(1)}`;
  return `${d.slice(0, 1)} ${d.slice(1, 5)} ${d.slice(5)}`;
}

export function telefonoChilenoCompleto(entrada: string): boolean {
  return soloDigitos(entrada).length === DIGITOS_CL;
}

/**
 * Arma el valor que se guarda: `+56 9 1234 5678`.
 */
export function telefonoChileno(entrada: string): string {
  return `+56 ${formatearChileno(entrada)}`;
}

/**
 * Para los de afuera: se respeta lo que dictaron, solo se limpia el espaciado
 * y se asegura el `+` adelante. No se intenta adivinar el formato de cada
 * país; lo único que importa es poder marcarlo.
 */
export function telefonoExtranjero(entrada: string): string {
  const limpio = entrada.trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  return limpio.startsWith("+") ? limpio : `+${limpio}`;
}

export function telefonoExtranjeroCompleto(entrada: string): boolean {
  // Lo más corto que existe ronda los 7 dígitos contando el código de país.
  return soloDigitos(entrada).length >= 7;
}

/**
 * Separa un teléfono guardado para poder editarlo: dice si es chileno y
 * devuelve la parte que va en el campo.
 */
export function partirTelefono(guardado: string | null | undefined): {
  esChileno: boolean;
  numero: string;
} {
  const v = (guardado ?? "").trim();
  if (!v) return { esChileno: true, numero: "" };

  const sinPrefijo = v.replace(/^\+?56\s*/, "");
  if (v !== sinPrefijo && soloDigitos(sinPrefijo).length === DIGITOS_CL) {
    return { esChileno: true, numero: formatearChileno(sinPrefijo) };
  }
  return { esChileno: false, numero: v };
}
