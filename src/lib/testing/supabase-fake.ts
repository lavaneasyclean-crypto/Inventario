/**
 * Doble de prueba del cliente de Supabase.
 *
 * Los server actions son casi todos la misma forma: validar la entrada, armar
 * la fila y mandarla. Lo que interesa testear es esa parte —qué se valida, qué
 * se termina escribiendo y qué se le muestra a la persona cuando algo falla—
 * sin depender de una base real.
 *
 * El doble registra cada llamada y devuelve respuestas preparadas, indexadas
 * por "tabla.operación" (o "rpc.nombre_de_la_funcion").
 *
 *   const supabase = crearSupabaseFake({
 *     "clientes.select": { data: null },
 *     "clientes.insert": { error: { code: "23505", message: "duplicate key" } },
 *   });
 *
 * No es este archivo un test: vive fuera del patrón *.test.ts a propósito.
 */

export type Operacion = "select" | "insert" | "update" | "upsert" | "delete";

export interface ErrorFake {
  code?: string;
  message: string;
}

export interface RespuestaFake {
  data?: unknown;
  error?: ErrorFake | null;
  count?: number | null;
}

export interface LlamadaFake {
  tabla: string;
  operacion: Operacion;
  payload?: unknown;
  opciones?: unknown;
  /** Los `.eq(...)`, `.order(...)`, etc. en el orden en que se encadenaron. */
  filtros: { metodo: string; args: unknown[] }[];
}

export interface LlamadaRpcFake {
  funcion: string;
  args: Record<string, unknown>;
}

const METODOS_ESCRITURA: Operacion[] = ["insert", "update", "upsert", "delete"];

const METODOS_FILTRO = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "or", "not", "filter", "order", "limit", "range", "contains",
] as const;

export interface SupabaseFake {
  from: (tabla: string) => unknown;
  rpc: (funcion: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Todo lo que pasó por `.from()`, en orden. */
  llamadas: LlamadaFake[];
  /** Todo lo que pasó por `.rpc()`, en orden. */
  rpcs: LlamadaRpcFake[];
  /** La última llamada a esa tabla y operación, para afirmar sobre el payload. */
  ultima: (tabla: string, operacion: Operacion) => LlamadaFake | undefined;
}

export function crearSupabaseFake(
  respuestas: Record<string, RespuestaFake> = {},
): SupabaseFake {
  const llamadas: LlamadaFake[] = [];
  const rpcs: LlamadaRpcFake[] = [];

  function respuestaDe(clave: string): {
    data: unknown;
    error: ErrorFake | null;
    count: number | null;
  } {
    const r = respuestas[clave];
    return {
      data: r?.data ?? null,
      error: r?.error ?? null,
      count: r?.count ?? null,
    };
  }

  function from(tabla: string) {
    // La operación la fija el primer método que se encadene: en
    // `.insert(x).select("id")` lo que importa es el insert.
    const llamada: LlamadaFake = { tabla, operacion: "select", filtros: [] };
    let operacionFijada = false;
    let registrada = false;

    const registrar = () => {
      if (!registrada) {
        llamadas.push(llamada);
        registrada = true;
      }
    };

    const resolver = async () => {
      registrar();
      return respuestaDe(`${tabla}.${llamada.operacion}`);
    };

    const cadena: Record<string, unknown> = {};

    for (const metodo of ["select", ...METODOS_ESCRITURA] as const) {
      cadena[metodo] = (payload?: unknown, opciones?: unknown) => {
        if (!operacionFijada) {
          llamada.operacion = metodo as Operacion;
          operacionFijada = true;
          if (metodo !== "select") {
            llamada.payload = payload;
            llamada.opciones = opciones;
          }
        }
        return cadena;
      };
    }

    for (const metodo of METODOS_FILTRO) {
      cadena[metodo] = (...args: unknown[]) => {
        llamada.filtros.push({ metodo, args });
        return cadena;
      };
    }

    cadena.single = resolver;
    cadena.maybeSingle = resolver;
    // Hace la cadena "awaitable" sin llamar a single(), igual que el cliente real.
    cadena.then = (
      alCumplir: (v: unknown) => unknown,
      alFallar?: (e: unknown) => unknown,
    ) => resolver().then(alCumplir, alFallar);

    return cadena;
  }

  async function rpc(funcion: string, args: Record<string, unknown> = {}) {
    rpcs.push({ funcion, args });
    return respuestaDe(`rpc.${funcion}`);
  }

  return {
    from,
    rpc,
    llamadas,
    rpcs,
    ultima: (tabla, operacion) =>
      [...llamadas]
        .reverse()
        .find((l) => l.tabla === tabla && l.operacion === operacion),
  };
}
