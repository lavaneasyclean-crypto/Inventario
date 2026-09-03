/**
 * Construcción de filtros `or=(...)` de PostgREST a partir de texto tipeado
 * por el usuario.
 *
 * El valor de cada filtro se interpola dentro de una lista separada por comas
 * y delimitada por paréntesis, así que un término con coma o paréntesis
 * —"Pérez, Juan", "Lavaseco (centro)"— rompe la gramática: la consulta falla o,
 * peor, termina filtrando por algo distinto de lo que se escribió.
 *
 * PostgREST acepta el valor entre comillas dobles; ahí adentro solo hay que
 * escapar la comilla y la barra invertida. Aparte, `%` y `_` son comodines de
 * LIKE, así que se escapan para que se busquen como caracteres literales.
 */

/** Escapa los comodines de LIKE para que se busquen literalmente. */
function escaparComodines(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Escapa lo que rompería el string entre comillas de PostgREST. */
function escaparComillas(s: string): string {
  return s.replace(/[\\"]/g, (c) => `\\${c}`);
}

/**
 * Devuelve el término listo para usarse como valor de un `ilike`,
 * entrecomillado y con comodines a ambos lados: `"%texto%"`.
 */
export function patronContiene(termino: string): string {
  return `"%${escaparComillas(escaparComodines(termino))}%"`;
}

/**
 * Arma el cuerpo de un `.or()` que busca el mismo término en varios campos.
 *
 *   filtroContiene(["nombre", "rut"], "Pérez, Juan")
 *   // 'nombre.ilike."%Pérez, Juan%",rut.ilike."%Pérez, Juan%"'
 */
export function filtroContiene(
  campos: readonly string[],
  termino: string,
): string {
  const patron = patronContiene(termino);
  return campos.map((campo) => `${campo}.ilike.${patron}`).join(",");
}

/**
 * Igual que `filtroContiene` pero con un término distinto por campo, para
 * cuando alguno necesita normalización previa (por ejemplo el RUT sin puntos).
 */
export function filtroContienePorCampo(
  pares: readonly (readonly [campo: string, termino: string])[],
): string {
  return pares
    .map(([campo, termino]) => `${campo}.ilike.${patronContiene(termino)}`)
    .join(",");
}
