import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueletos de carga.
 *
 * Cada viaje a Supabase cuesta entre medio segundo y uno desde acá, y una
 * pantalla que espera todos sus datos antes de dibujar algo se siente
 * colgada, no lenta. Mostrar la forma de lo que viene no acelera nada, pero
 * convierte "no responde" en "está cargando", que es la diferencia entre
 * volver a apretar el botón y esperar.
 *
 * La forma importa: un esqueleto con la silueta equivocada —tres columnas
 * donde va a haber una lista— desorienta más que una pantalla en blanco.
 */

/** Filas de una lista: pedidos, clientes, gastos, proveedores. */
export function EsqueletoLista({ filas = 6 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lista en dos columnas, como el listado de pedidos en pantalla ancha. */
export function EsqueletoListaDoble({ filas = 8 }: { filas?: number }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2" aria-busy>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cabecera de pantalla: titulo, bajada y un boton a la derecha. */
export function EsqueletoCabecera() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-11 w-36" />
    </div>
  );
}

/** La caja de filtros, que en varias pantallas es lo primero que se ve. */
export function EsqueletoFiltros({ campos = 4 }: { campos?: number }) {
  return (
    <div className="mb-4 rounded-xl border bg-background p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-24" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: campos }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

/** Pantalla de detalle: cabecera y un par de tarjetas. */
export function EsqueletoDetalle() {
  return (
    <div className="p-4 sm:p-6" aria-busy>
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-6 rounded-xl border bg-background p-4">
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
