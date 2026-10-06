import type { ReactNode } from "react";

/**
 * Piezas de una guía impresa.
 *
 * Sale en una térmica de 5 pulgadas con rollo continuo, así que el diseño se
 * rige por dos cosas: el ancho es fijo y angosto —todo va en una columna— y el
 * alto lo define el contenido.
 *
 * El formato replica la guía que venía imprimiendo el Access, a propósito: es
 * el papel que los clientes ya reconocen y que el mostrador ya sabe leer.
 * Cambiarlo porque sí obligaría a reaprender algo que funciona.
 *
 * Nada de grises ni colores: la térmica solo quema negro y un fondo gris sale
 * como mancha. La jerarquía se hace con tamaño y con líneas.
 */

const ANCHO = "max-w-[119mm]";

export function Ticket({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${ANCHO} mx-auto bg-white text-[12px] leading-tight text-black print:mx-0 print:max-w-none`}
    >
      {children}
    </div>
  );
}

/**
 * Encabezado del local.
 *
 * La dirección y los teléfonos son los del mostrador, que no son los mismos
 * que salen en las facturas: ahí va la casa matriz. El cliente que recibe esta
 * guía tiene que poder llamar al local donde dejó la ropa.
 */
export function TicketEncabezado({
  impresoEl,
}: {
  /** Fecha y hora de impresión, ya formateadas. */
  impresoEl: { fecha: string; hora: string };
}) {
  return (
    <header className="evitar-corte border-b border-black pb-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold tracking-wide">EASY CLEAN</p>
          <p>Pastor Fernández #15280, local 6</p>
        </div>
        <div className="shrink-0 text-right">
          <p>{impresoEl.fecha}</p>
          <p>{impresoEl.hora}</p>
        </div>
      </div>
      <p className="mt-1">
        Contacto: <strong>9 4092 5498</strong> · <strong>2 2321 4480</strong>
      </p>
    </header>
  );
}

/**
 * Un dato con su etiqueta. `destacado` es para lo que se busca con la vista al
 * recibir el papel: el número de pedido y la fecha de entrega.
 */
export function TicketDato({
  etiqueta,
  valor,
  destacado = false,
  siempre = false,
}: {
  etiqueta: string;
  valor: ReactNode;
  destacado?: boolean;
  /** Muestra la fila aunque el valor esté vacío, como hace la guía del Access. */
  siempre?: boolean;
}) {
  const vacio = valor === null || valor === undefined || valor === "";
  if (vacio && !siempre) return null;
  return (
    <div className="flex gap-2">
      <span className="w-[22mm] shrink-0 text-[11px]">{etiqueta}</span>
      <span className={destacado ? "text-[14px] font-bold" : ""}>
        {vacio ? "" : valor}
      </span>
    </div>
  );
}

export function TicketSeccion({
  titulo,
  children,
  sinLinea = false,
}: {
  titulo?: string;
  children: ReactNode;
  sinLinea?: boolean;
}) {
  return (
    <section
      className={`evitar-corte py-2 ${sinLinea ? "" : "border-b border-dashed border-black"}`}
    >
      {titulo && (
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wider">
          {titulo}
        </h2>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

/** Encabezado de la tabla de prendas, igual que en la guía del Access. */
export function TicketTablaCabecera() {
  return (
    <div className="flex gap-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase">
      <span className="flex-1">Producto</span>
      <span className="w-[16mm] text-right">Precio</span>
      <span className="w-[9mm] text-right">Cant</span>
      <span className="w-[18mm] text-right">Total</span>
    </div>
  );
}

/**
 * Una prenda: el nombre arriba y abajo el servicio con sus números.
 *
 * Se parte en dos líneas y no en una porque los nombres de prenda son largos
 * —"Mantel azul rectangular 1,5x4"— y en 119 mm no entra todo junto sin
 * cortarlo.
 */
export function TicketPrenda({
  nombre,
  categoria,
  precio,
  cantidad,
  total,
  detalle,
}: {
  nombre: string;
  categoria?: string;
  precio?: string;
  cantidad: number;
  total?: string;
  detalle?: string | null;
}) {
  return (
    <div className="border-b border-dotted border-black/40 py-0.5">
      <p className="font-bold">{nombre}</p>
      <div className="flex gap-1">
        <span className="flex-1">{categoria ?? ""}</span>
        <span className="w-[16mm] text-right tabular-nums">{precio ?? ""}</span>
        <span className="w-[9mm] text-right tabular-nums">{cantidad}</span>
        <span className="w-[18mm] text-right tabular-nums">{total ?? ""}</span>
      </div>
      {detalle && <p className="text-[11px] italic">{detalle}</p>}
    </div>
  );
}

export function TicketTotal({
  etiqueta,
  valor,
  grande = false,
}: {
  etiqueta: string;
  valor: string;
  grande?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={grande ? "text-[11px] uppercase" : ""}>{etiqueta}</span>
      <span
        className={
          grande
            ? "border border-black px-2 py-0.5 text-[16px] font-bold tabular-nums"
            : "tabular-nums"
        }
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Recuadro con renglones para escribir a mano. La guía del Access lo tiene
 * bajo "Detalle" y en el mostrador se usa para anotar lo que no estaba
 * previsto: un botón que falta, una mancha que el cliente quiere señalar.
 */
export function TicketRenglones({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="mt-1 border border-black p-1.5">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="h-[7mm] border-b border-black/30" />
      ))}
    </div>
  );
}

/**
 * Las condiciones del servicio.
 *
 * Van en la guía porque es el único papel que el cliente se lleva: si no están
 * acá, no están en ningún lado. Se copian textuales de la guía que venía
 * imprimiendo el Access.
 */
export function TicketCondiciones() {
  return (
    <div className="evitar-corte mt-2 border border-black p-1.5 text-[11px] font-bold">
      <p>- Manchas sin garantía</p>
      <p>- No nos hacemos responsables por prendas superiores a 60 días</p>
    </div>
  );
}

/** Línea para firmar al recibir. En las guías de empresa respalda la entrega. */
export function TicketFirma({ texto = "Recibí conforme" }: { texto?: string }) {
  return (
    <div className="evitar-corte pt-8 text-center">
      <div className="mx-auto w-4/5 border-t border-black pt-1 text-[11px]">
        {texto}
      </div>
    </div>
  );
}

export function TicketPie({ children }: { children: ReactNode }) {
  return (
    <footer className="evitar-corte pt-2 text-center text-[11px]">
      {children}
    </footer>
  );
}
