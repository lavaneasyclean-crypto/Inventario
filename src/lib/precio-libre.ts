import type { Producto } from "./types";

/**
 * Las prendas cuyo precio se escribe al cargarlas, no en el catálogo.
 *
 * Casi todo el catálogo tiene precio fijo: una camisa sale lo que dice la
 * lista. Hay dos que no funcionan así y nunca van a funcionar así:
 *
 *   AA001  AA-Otro     el comodín para lo que no está en la lista
 *   SC080  Descuento   el monto depende de por qué se descuenta
 *
 * Las dos están en el catálogo con precio 0, que es la forma honesta de decir
 * "esto no tiene precio de lista". De ahí sale la regla: **precio 0 en el
 * catálogo significa que el precio se pregunta en el pedido**.
 *
 * Se decide por el precio y no por una lista de códigos a propósito. Si
 * mañana hace falta otro comodín, alcanza con crearlo en 0 y funciona; una
 * lista de ids habría que acordarse de tocarla, y nadie se acuerda.
 *
 * El descuento se carga con precio negativo. La base lo contempla desde el
 * primer día: `precio_unidad numeric(12,2) not null, -- puede ser negativo`.
 */
export function tienePrecioLibre(
  producto: Pick<Producto, "precio"> | null | undefined,
): boolean {
  return Number(producto?.precio ?? -1) === 0;
}
