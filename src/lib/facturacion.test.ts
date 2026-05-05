import { describe, it, expect } from "vitest";
import { consolidarPedidos, IVA_RATE } from "./facturacion";
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

const BASE_PEDIDO: PedidoEmpresa = {
  id: 1,
  rut_empresa: "76116233-0",
  alias: "Test",
  fecha: "2026-04-01T12:00:00-03:00",
  detalle: null,
  anulado: false,
  created_at: "",
  updated_at: "",
};

function makeItem(
  pid: number,
  partial: Partial<PedidoEmpresaItem> = {},
): PedidoEmpresaItem {
  return {
    id: Math.floor(Math.random() * 100000),
    pedido_empresa_id: pid,
    producto_empresa_id: "001",
    producto_empresa_nombre: "Sabanas 1,5",
    precio_unidad: 1800,
    importe: 1800,
    cantidad: 1,
    detalle_prenda: null,
    created_at: "",
    ...partial,
  };
}

describe("consolidarPedidos", () => {
  it("devuelve consolidado vacio si no hay seleccionados", () => {
    const r = consolidarPedidos([], new Set());
    expect(r.lineas).toHaveLength(0);
    expect(r.neto).toBe(0);
    expect(r.iva).toBe(0);
    expect(r.total).toBe(0);
  });

  it("ignora pedidos no seleccionados", () => {
    const pedidos = [
      { pedido: { ...BASE_PEDIDO, id: 1 }, items: [makeItem(1)] },
      { pedido: { ...BASE_PEDIDO, id: 2 }, items: [makeItem(2)] },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(1);
  });

  it("agrupa items con mismo producto_id+nombre y suma cantidades", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [
          makeItem(1, { cantidad: 30 }),
          makeItem(1, { cantidad: 20, producto_empresa_id: "002", producto_empresa_nombre: "Toallas", precio_unidad: 950, importe: 19000 }),
        ],
      },
      {
        pedido: { ...BASE_PEDIDO, id: 2 },
        items: [
          makeItem(2, { cantidad: 70 }), // mismo Sabanas 1,5
        ],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1, 2]));
    expect(r.lineas).toHaveLength(2);
    const sabanas = r.lineas.find((l) => l.nombre === "Sabanas 1,5");
    expect(sabanas?.cantidad).toBe(100);
    expect(sabanas?.importe).toBe(180000);
    const toallas = r.lineas.find((l) => l.nombre === "Toallas");
    expect(toallas?.cantidad).toBe(20);
    expect(toallas?.importe).toBe(19000);
  });

  it("calcula IVA 19% redondeado", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [makeItem(1, { cantidad: 100, precio_unidad: 1800 })],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.neto).toBe(180000);
    expect(r.iva).toBe(Math.round(180000 * IVA_RATE));
    expect(r.total).toBe(r.neto + r.iva);
  });

  it("items sin precio no suman al importe pero la cantidad si", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [
          makeItem(1, { cantidad: 50, precio_unidad: null, importe: null }),
        ],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(50);
    expect(r.lineas[0].importe).toBe(0);
    expect(r.lineas[0].sinPrecio).toBe(true);
    expect(r.neto).toBe(0);
  });

  it("si hay items con y sin precio del mismo producto, marca sinPrecio y suma solo los que tienen", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [
          makeItem(1, { cantidad: 10 }), // 1800 c/u
          makeItem(1, { cantidad: 5, precio_unidad: null, importe: null }),
        ],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(15);
    expect(r.lineas[0].importe).toBe(18000); // solo 10 * 1800
    expect(r.lineas[0].sinPrecio).toBe(true);
  });

  it("ordena las lineas alfabeticamente en es", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [
          makeItem(1, { producto_empresa_id: "z", producto_empresa_nombre: "Zapatos" }),
          makeItem(1, { producto_empresa_id: "a", producto_empresa_nombre: "Almohadas" }),
          makeItem(1, { producto_empresa_id: "n", producto_empresa_nombre: "Nuhcas" }),
        ],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.lineas.map((l) => l.nombre)).toEqual([
      "Almohadas",
      "Nuhcas",
      "Zapatos",
    ]);
  });
});
