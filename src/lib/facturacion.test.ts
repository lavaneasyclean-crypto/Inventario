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

  it("separa los items con y sin precio del mismo producto", () => {
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

    // En una sola linea quedaria "15 unidades, $18.000", que no multiplica.
    expect(r.lineas).toHaveLength(2);
    const conPrecio = r.lineas.find((l) => !l.sinPrecio)!;
    const sinPrecio = r.lineas.find((l) => l.sinPrecio)!;
    expect(conPrecio.cantidad).toBe(10);
    expect(conPrecio.importe).toBe(18000);
    expect(sinPrecio.cantidad).toBe(5);
    expect(sinPrecio.importe).toBe(0);
    expect(r.neto).toBe(18000);
  });

  it("separa el mismo producto cuando cambio de precio en el periodo", () => {
    // El caso real: sube el precio a mitad de mes y las guias viejas
    // conservan el viejo.
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [makeItem(1, { cantidad: 10, precio_unidad: 500 })],
      },
      {
        pedido: { ...BASE_PEDIDO, id: 2 },
        items: [makeItem(2, { cantidad: 20, precio_unidad: 1000 })],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1, 2]));

    expect(r.lineas).toHaveLength(2);
    // Cada fila cierra sola: cantidad x precio = importe.
    for (const l of r.lineas) {
      expect(l.importe).toBe((l.precio_unidad ?? 0) * l.cantidad);
    }
    expect(r.neto).toBe(10 * 500 + 20 * 1000);
    // Y se distinguen en la planilla, que si no serian dos filas identicas.
    expect(r.lineas.map((l) => l.etiqueta)).toEqual([
      expect.stringContaining("$500"),
      expect.stringContaining("$1.000"),
    ]);
  });

  it("no ensucia la etiqueta cuando el producto tiene un solo precio", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1 },
        items: [makeItem(1, { cantidad: 10, precio_unidad: 500 })],
      },
    ];
    const r = consolidarPedidos(pedidos, new Set([1]));
    expect(r.lineas[0].etiqueta).toBe(r.lineas[0].nombre);
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
