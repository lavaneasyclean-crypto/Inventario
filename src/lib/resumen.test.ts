import { describe, it, expect } from "vitest";
import { agruparResumen, contarPrendas, VENTANA_DIAS } from "./resumen";
import type { Pedido, PedidoItem, TipoServicio } from "@/lib/types";

const HOY = "2026-10-17";

/** Marca de tiempo del mediodía en Chile, para no pelear con el huso. */
function enChile(dia: string): string {
  return `${dia}T15:00:00+00:00`;
}

function pedido(p: Partial<Pedido> & { id: number }): Pedido {
  return {
    rut_cliente: "1-9",
    nombre_cliente: "Cliente",
    contacto: null,
    direccion: null,
    estado: "recibido",
    pagado: false,
    forma_pago: "no_pago",
    monto_abonado: 0,
    total_venta: 0,
    aviso_enviado: false,
    fecha_recepcion: enChile(HOY),
    fecha_pago: null,
    fecha_entrega: null,
    fecha_retiro: null,
    notas: null,
    created_at: enChile(HOY),
    updated_at: enChile(HOY),
    ...p,
  } as Pedido;
}

function item(
  pedido_id: number,
  servicio: TipoServicio,
  cantidad = 1,
): PedidoItem {
  return {
    id: Math.random(),
    pedido_id,
    producto_id: "X1",
    producto_nombre: "Prenda",
    producto_tipo_servicio: servicio,
    precio_unidad: 1000,
    cantidad,
    importe: 1000 * cantidad,
    detalle_prenda: null,
    unidad_cobro: "unidad",
    ancho: null,
    largo: null,
    created_at: enChile(HOY),
  } as unknown as PedidoItem;
}

function mapa(items: PedidoItem[]): Map<number, PedidoItem[]> {
  const m = new Map<number, PedidoItem[]>();
  for (const i of items) {
    m.set(i.pedido_id, [...(m.get(i.pedido_id) ?? []), i]);
  }
  return m;
}

describe("agruparResumen", () => {
  it("reparte por fecha de entrega: atrasado, hoy y mañana", () => {
    const pedidos = [
      pedido({ id: 1, fecha_entrega: enChile("2026-10-15") }),
      pedido({ id: 2, fecha_entrega: enChile(HOY) }),
      pedido({ id: 3, fecha_entrega: enChile("2026-10-18") }),
    ];
    const r = agruparResumen(pedidos, mapa([]), HOY);

    expect(r.atrasados.map((f) => f.pedido.id)).toEqual([1]);
    expect(r.hoy.map((f) => f.pedido.id)).toEqual([2]);
    expect(r.manana.map((f) => f.pedido.id)).toEqual([3]);
  });

  it("lo que entrega pasado mañana todavía no es trabajo de hoy", () => {
    const pedidos = [pedido({ id: 1, fecha_entrega: enChile("2026-10-20") })];
    const r = agruparResumen(pedidos, mapa([]), HOY);

    expect(r.atrasados).toHaveLength(0);
    expect(r.hoy).toHaveLength(0);
    expect(r.manana).toHaveLength(0);
    expect(r.viejos).toBe(0);
  });

  it("los que no tienen fecha de entrega van a su propio grupo", () => {
    // 160 pedidos reales estan asi: sin este grupo no aparecerian nunca.
    const pedidos = [pedido({ id: 1, fecha_entrega: null })];
    const r = agruparResumen(pedidos, mapa([]), HOY);

    expect(r.sinFecha.map((f) => f.pedido.id)).toEqual([1]);
  });

  it("lo mas viejo que la ventana se cuenta, no se lista", () => {
    // El caso real: 359 pedidos de hace mas de tres meses que nunca se
    // cerraron. Listarlos tapa el trabajo del dia.
    const viejo = pedido({
      id: 1,
      fecha_recepcion: enChile("2026-01-10"),
      fecha_entrega: enChile("2026-01-12"),
    });
    const sinFechaViejo = pedido({
      id: 2,
      fecha_recepcion: enChile("2026-01-10"),
      fecha_entrega: null,
    });
    const r = agruparResumen([viejo, sinFechaViejo], mapa([]), HOY);

    expect(r.viejos).toBe(2);
    expect(r.atrasados).toHaveLength(0);
    expect(r.sinFecha).toHaveLength(0);
  });

  it("lo atrasado dentro de la ventana si se lista", () => {
    const r = agruparResumen(
      [
        pedido({
          id: 1,
          fecha_recepcion: enChile("2026-10-05"),
          fecha_entrega: enChile("2026-10-10"),
        }),
      ],
      mapa([]),
      HOY,
    );

    expect(r.atrasados.map((f) => f.pedido.id)).toEqual([1]);
    expect(r.viejos).toBe(0);
  });

  it("lo mas vencido va primero", () => {
    const pedidos = [
      pedido({ id: 1, fecha_entrega: enChile("2026-10-14") }),
      pedido({ id: 2, fecha_entrega: enChile("2026-10-10") }),
      pedido({ id: 3, fecha_entrega: enChile("2026-10-16") }),
    ];
    const r = agruparResumen(pedidos, mapa([]), HOY);

    expect(r.atrasados.map((f) => f.pedido.id)).toEqual([2, 1, 3]);
  });

  it("ignora lo que no esta en proceso", () => {
    const pedidos = [
      pedido({ id: 1, estado: "listo", fecha_entrega: enChile(HOY) }),
      pedido({ id: 2, estado: "entregado", fecha_entrega: enChile(HOY) }),
      pedido({ id: 3, estado: "anulado", fecha_entrega: enChile(HOY) }),
    ];
    const r = agruparResumen(pedidos, mapa([]), HOY);

    expect(r.hoy).toHaveLength(0);
  });

  it("usa la ventana que declara el modulo", () => {
    expect(VENTANA_DIAS).toBe(30);
  });
});

describe("agruparResumen — solo planchado", () => {
  it("deja solo las prendas que se planchan", () => {
    const pedidos = [pedido({ id: 1, fecha_entrega: enChile(HOY) })];
    const items = mapa([
      item(1, "lavado", 5),
      item(1, "planchado", 2),
      item(1, "seco", 3),
    ]);
    const r = agruparResumen(pedidos, items, HOY, { soloPlanchado: true });

    const servicios = r.hoy[0].items.map((i) => i.producto_tipo_servicio);
    expect(servicios.sort()).toEqual(["planchado", "seco"]);
  });

  it("un pedido sin nada que planchar no aparece", () => {
    // Quien plancha no tiene por que leer pedidos que no lo tocan.
    const pedidos = [pedido({ id: 1, fecha_entrega: enChile(HOY) })];
    const items = mapa([item(1, "lavado", 5)]);
    const r = agruparResumen(pedidos, items, HOY, { soloPlanchado: true });

    expect(r.hoy).toHaveLength(0);
  });

  it("sin el filtro, ese mismo pedido si aparece", () => {
    const pedidos = [pedido({ id: 1, fecha_entrega: enChile(HOY) })];
    const items = mapa([item(1, "lavado", 5)]);
    const r = agruparResumen(pedidos, items, HOY);

    expect(r.hoy).toHaveLength(1);
  });
});

describe("contarPrendas", () => {
  it("suma las cantidades, no las lineas", () => {
    const filas = [
      { pedido: pedido({ id: 1 }), items: [item(1, "lavado", 3)] },
      {
        pedido: pedido({ id: 2 }),
        items: [item(2, "planchado", 2), item(2, "seco", 4)],
      },
    ];
    expect(contarPrendas(filas)).toBe(9);
  });

  it("sin filas es cero", () => {
    expect(contarPrendas([])).toBe(0);
  });
});
