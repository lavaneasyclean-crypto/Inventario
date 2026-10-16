/**
 * Stub de `server-only` para los tests.
 *
 * Ese modulo no existe como paquete: lo resuelve el bundler de Next, que lo
 * usa para cortar el build si alguien importa codigo de servidor desde un
 * componente de cliente. Fuera de Next no resuelve, y eso dejaba sin poder
 * testear cualquier modulo de `lib/data`.
 *
 * Vacio a proposito: en un test no hay frontera servidor/cliente que cuidar.
 */
export {};
