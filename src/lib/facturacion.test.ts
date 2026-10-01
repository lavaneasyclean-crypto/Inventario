import { describe, it, expect } from "vitest";
import {
  consolidarExpress,
  consolidarFacturacion,
  consolidarPedidos,
  debeRecordarRegistro,
  IVA_RATE,
  precioExpress,
} from "./facturacion";
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

const BASE_PEDIDO: PedidoEmpresa = {
  id: 1,
  rut_empresa: "76116233-0",
  alias: "Test",
  fecha: "2026-04-01T12:00:00-03:00",
  detalle: null,
  anulado: false,
  express: false,
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

describe("precioExpress", () => {
  it("cobra solo el porcentaje adicional, no el precio con recargo", () => {
    // Sabana 1,5plz de Hotel Acacias: base 500, recargo 60% -> la factura
    // express dice 300, que es el extra, no 800.
    expect(precioExpress(500, 60)).toBe(300);
  });

  it("reproduce la factura N 1686 de Acacias linea por linea", () => {
    const casos: Array<[number, number]> = [
      [500, 300],    // Sabana 1,5plz
      [700, 420],    // Sabana SuperKing
      [1950, 1170],  // Cubre Plumon 1,5plz
      [2100, 1260],  // Cubre plumon SuperKing
      [140, 84],     // Funda Almohada
      [550, 330],    // Toalla Cuerpo
      [400, 240],    // Toalla Mano
      [750, 450],    // Mantel Repaso
      [7000, 4200],  // Cobertores
      [4000, 2400],  // Pieceras
      [1200, 720],   // Pantalon
      [850, 510],    // Mantel azul cuadrado
      [1500, 900],   // Mantel azul rectangular 1,5x4
      [800, 480],    // Funda cojin larga
      [1100, 660],   // Faldon
      [2500, 1500],  // Cubre colchon
    ];
    for (const [base, esperado] of casos) {
      expect(precioExpress(base, 60)).toBe(esperado);
    }
  });

  it("redondea al peso", () => {
    // 175 * 0,6 = 105 exacto; 174 * 0,6 = 104,4 -> 104
    expect(precioExpress(175, 60)).toBe(105);
    expect(precioExpress(174, 60)).toBe(104);
    expect(precioExpress(125, 60)).toBe(75);
  });

  it("sin recargo no cobra nada", () => {
    expect(precioExpress(1000, 0)).toBe(0);
  });
});

describe("consolidarExpress", () => {
  it("deja fuera las guias que no son express", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: false },
        items: [makeItem(1, { cantidad: 10, precio_unidad: 500 })],
      },
      {
        pedido: { ...BASE_PEDIDO, id: 2, express: true },
        items: [makeItem(2, { cantidad: 4, precio_unidad: 500 })],
      },
    ];
    const r = consolidarExpress(pedidos, new Set([1, 2]), 60);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(4);
    expect(r.lineas[0].precio_unidad).toBe(300);
    expect(r.neto).toBe(1200);
  });

  it("respeta la seleccion: una express desmarcada no entra", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 2, express: true },
        items: [makeItem(2, { cantidad: 4 })],
      },
    ];
    expect(consolidarExpress(pedidos, new Set(), 60).lineas).toHaveLength(0);
  });

  it("suma cantidades de varias guias express del mismo producto", () => {
    // g1458 (26) + g1475 (10) = 36 sabanas, como en la planilla de julio.
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1458, express: true },
        items: [makeItem(1458, { cantidad: 26, precio_unidad: 500 })],
      },
      {
        pedido: { ...BASE_PEDIDO, id: 1475, express: true },
        items: [makeItem(1475, { cantidad: 10, precio_unidad: 500 })],
      },
    ];
    const r = consolidarExpress(pedidos, new Set([1458, 1475]), 60);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(36);
    expect(r.lineas[0].importe).toBe(10_800);
  });

  it("un item sin precio no puede generar recargo", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: true },
        items: [makeItem(1, { precio_unidad: null, importe: null })],
      },
    ];
    const r = consolidarExpress(pedidos, new Set([1]), 60);
    expect(r.lineas[0].sinPrecio).toBe(true);
    expect(r.neto).toBe(0);
  });

  it("dos precios base que caen en el mismo recargo son una sola linea", () => {
    // 100 y 101 al 60% dan 60 y 61: distintos. 100 y 100 dan la misma.
    // Con 10% : 104 -> 10 y 105 -> 11 (Math.round(10.4)=10, round(10.5)=11).
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: true },
        items: [
          makeItem(1, { cantidad: 1, precio_unidad: 101 }),
          makeItem(1, { cantidad: 1, precio_unidad: 102 }),
        ],
      },
    ];
    // 101*0,1 = 10,1 -> 10 ; 102*0,1 = 10,2 -> 10. Misma linea.
    const r = consolidarExpress(pedidos, new Set([1]), 10);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].cantidad).toBe(2);
    expect(r.lineas[0].precio_unidad).toBe(10);
  });
});

describe("consolidarFacturacion", () => {
  const pedidos = [
    {
      pedido: { ...BASE_PEDIDO, id: 1, express: false },
      items: [makeItem(1, { cantidad: 10, precio_unidad: 500, importe: 5000 })],
    },
    {
      pedido: { ...BASE_PEDIDO, id: 2, express: true },
      items: [makeItem(2, { cantidad: 4, precio_unidad: 500, importe: 2000 })],
    },
  ];

  it("la principal incluye las express a precio base", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.principal.lineas).toHaveLength(1);
    expect(r.principal.lineas[0].cantidad).toBe(14);
    expect(r.principal.neto).toBe(7000);
  });

  it("la express cobra solo el recargo de las express", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.express?.neto).toBe(1200); // 4 x 300
    expect(r.idsExpress).toEqual([2]);
  });

  it("lo facturado del periodo es la suma de los dos netos", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.principal.neto + (r.express?.neto ?? 0)).toBe(8200);
  });

  it("sin recargo configurado no hay segundo documento", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 0);
    expect(r.express).toBeNull();
    expect(r.principal.neto).toBe(7000);
  });

  it("sin guias express no hay segundo documento", () => {
    const r = consolidarFacturacion(pedidos, new Set([1]), 60);
    expect(r.express).toBeNull();
    expect(r.idsExpress).toEqual([]);
  });

  it("un recargo que da cero no genera documento en blanco", () => {
    const sinPrecio = [
      {
        pedido: { ...BASE_PEDIDO, id: 2, express: true },
        items: [makeItem(2, { precio_unidad: null, importe: null })],
      },
    ];
    expect(consolidarFacturacion(sinPrecio, new Set([2]), 60).express).toBeNull();
  });
});

describe("consolidarFacturacion sin la migracion aplicada", () => {
  it("no ofrece documento express si el recargo llega indefinido", () => {
    // Escenario real: codigo desplegado antes de aplicar 0010. La columna no
    // existe, el recargo llega undefined y antes esto daba NaN en pantalla.
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: true },
        items: [makeItem(1, { cantidad: 2, precio_unidad: 500 })],
      },
    ];
    const r = consolidarFacturacion(
      pedidos,
      new Set([1]),
      undefined as unknown as number,
    );
    expect(r.express).toBeNull();
    expect(r.principal.neto).toBe(1000);
    expect(Number.isNaN(r.principal.neto)).toBe(false);
  });

  it("tampoco con NaN", () => {
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: true },
        items: [makeItem(1, { cantidad: 2, precio_unidad: 500 })],
      },
    ];
    expect(consolidarFacturacion(pedidos, new Set([1]), NaN).express).toBeNull();
  });
});

describe("debeRecordarRegistro", () => {
  const base = {
    exportado: true,
    ocultado: false,
    guiaIds: [1, 2],
    idsYaFacturadas: [] as number[],
  };

  it("recuerda despues de bajar la planilla", () => {
    expect(debeRecordarRegistro(base)).toBe(true);
  });

  it("no dice nada antes de bajarla", () => {
    expect(debeRecordarRegistro({ ...base, exportado: false })).toBe(false);
  });

  it("se calla si la persona cerro el aviso", () => {
    expect(debeRecordarRegistro({ ...base, ocultado: true })).toBe(false);
  });

  it("no recuerda nada si ya esta todo registrado", () => {
    expect(
      debeRecordarRegistro({ ...base, idsYaFacturadas: [1, 2] }),
    ).toBe(false);
  });

  it("con solapamiento parcial se calla: manda el aviso de ya facturadas", () => {
    // Registrar esta bloqueado igual; ofrecerlo seria mandar a un dialogo que
    // el servidor va a rechazar.
    expect(debeRecordarRegistro({ ...base, idsYaFacturadas: [1] })).toBe(false);
  });

  it("sin guias no hay nada que registrar", () => {
    expect(debeRecordarRegistro({ ...base, guiaIds: [] })).toBe(false);
  });
});
