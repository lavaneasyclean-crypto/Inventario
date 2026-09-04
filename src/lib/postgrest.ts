/**
 * Construcción de filtros `or=(...)` de PostgREST a partir de texto tipeado
 * por el usuario.
 *
 * El valor de cada filtro se interpola dentro de una lista separada por comas
 * y delimitada por paréntesis. Comprobado contra PostgREST: una coma en el
 * término parte la lista y la consulta se cae con PGRST100 ("failed to parse
 * logic tree"), así que buscar "Pérez, Juan" devolvía un error. Los paréntesis
 * en cambio pasan sin romper nada.
 *
 * Los comodines de LIKE son el caso silencioso: un `%` tipeado no da error,
 * simplemente ensancha la búsqueda y devuelve cualquier cosa.
 *
 * PostgREST acepta el valor entre comillas dobles; ahí adentro solo hay que
 * escapar la comilla y la barra invertida. `%` y `_` se escapan aparte para
 * que se busquen como caracteres literales.
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
