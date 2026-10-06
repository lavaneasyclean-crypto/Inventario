/**
 * PostgREST devuelve como máximo 1.000 filas por consulta, en silencio.
 *
 * No es un error: responde 200 con las primeras mil y un `Content-Range` que
 * nadie mira. El código que sumaba esas filas quedaba corto sin enterarse, y
 * el síntoma aparecía lejos de la causa — la ficha de Acacias mostraba "0
 * items" en todos sus pedidos porque sus 8.514 líneas no entraban, y las mil
 * que sí entraban eran de los pedidos más viejos.
 *
 * Donde más caro sale es en la facturación: un rango con más de mil líneas
 * habría emitido una factura por menos de lo que corresponde, y eso no se nota
 * revisando la pantalla.
 */
/*
 * Sin `server-only`: no toca Supabase ni ninguna credencial, solo recorre
 * paginas. Dejarlo fuera permite testearlo, que es donde importa.
 */
const TAM_PAGINA = 1000;

/**
 * Tope de seguridad. Más que esto en una pantalla es un problema de diseño, no
 * de paginado, y conviene que falle a que se cuelgue pidiendo páginas.
 */
const MAXIMO = 50_000;

interface Pagina<T> {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}

/**
 * Trae todas las filas de una consulta, no las primeras mil.
 *
 * `hacerPagina` recibe el rango —ambos extremos inclusive, como `.range()`— y
 * devuelve la consulta ya armada:
 *
 *     const items = await traerTodas((desde, hasta) =>
 *       supabase.from("pedidos_empresa_items")
 *         .select("*")
 *         .in("pedido_empresa_id", ids)
 *         .range(desde, hasta),
 *     );
 *
 * Un error de la base se propaga en vez de devolver lo que alcanzó a llegar.
 * Devolver datos parciales como si estuvieran completos es justo lo que hacía
 * el código anterior, y es peor que fallar: una factura corta no se distingue
 * de una correcta.
 */
export async function traerTodas<T>(
  hacerPagina: (desde: number, hasta: number) => PromiseLike<Pagina<T>>,
): Promise<T[]> {
  const todas: T[] = [];

  for (let desde = 0; desde < MAXIMO; desde += TAM_PAGINA) {
    const { data, error } = await hacerPagina(desde, desde + TAM_PAGINA - 1);
    if (error) throw error;

    const pagina = data ?? [];
    todas.push(...pagina);

    // Una página incompleta es la última. Pedir otra devolvería vacío y
    // costaría un viaje de más.
    if (pagina.length < TAM_PAGINA) return todas;
  }

  throw new Error(
    `La consulta superó el tope de ${MAXIMO.toLocaleString("es-CL")} filas.`,
  );
}

/**
 * Parte una lista de ids en grupos para no armar un `in.(...)` de kilómetros.
 *
 * PostgREST los manda en la URL, y los servidores la cortan a unos pocos
 * miles de caracteres. Con ids de 4 dígitos, 500 por grupo deja la URL en unos
 * 3 kB, cómodo bajo cualquier límite.
 */
export function enGrupos<T>(items: readonly T[], tamano = 500): T[][] {
  if (items.length === 0) return [];
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    grupos.push(items.slice(i, i + tamano));
  }
  return grupos;
}
