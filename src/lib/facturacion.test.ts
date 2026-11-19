import { describe, it, expect } from "vitest";
import {
  consolidarExpress,
  consolidarFacturacion,
  consolidarPedidos,
  debeRecordarRegistro,
  IVA_RATE,
  desglosar,
  precioExpress,
} from "./facturacion";
import { desgloseIva } from "./finanzas";
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

const BASE_PEDIDO: PedidoEmpresa = {
  id: 1,
  rut_empresa: "76116233-0",
  alias: "Test",
  fecha: "2026-04-01T12:00:00-03:00",
  detalle: null,
  anulado: false,
  express: false,
  fecha_entrega: null,
  fecha_pago: null,
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
    bolsa_id: null,
    bolsa_codigo: null,
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
  it("cobra el precio completo: base mas recargo", () => {
    // Sabana 1,5plz de Hotel Acacias: base 500, recargo 60%. La guia express
    // se factura entera, asi que la linea dice 800 y no 300. El cliente pidio
    // ver la guia completa en su factura, no solo el adicional.
    expect(precioExpress(500, 60)).toBe(800);
  });

  it("es el base mas el recargo redondeado, no el producto redondeado", () => {
    // Importa para que el total facturado no se mueva ni un peso respecto
    // del reparto viejo, que sumaba base + round(base * pct) en dos papeles.
    const base = 333;
    expect(precioExpress(base, 60)).toBe(base + Math.round(base * 0.6));
  });

  it("reproduce la factura N 1686 de Acacias linea por linea", () => {
    const casos: Array<[number, number]> = [
      [500, 800],     // Sabana 1,5plz
      [700, 1120],    // Sabana SuperKing
      [1950, 3120],   // Cubre Plumon 1,5plz
      [2100, 3360],   // Cubre plumon SuperKing
      [140, 224],     // Funda Almohada
      [550, 880],     // Toalla Cuerpo
      [400, 640],     // Toalla Mano
      [750, 1200],    // Mantel Repaso
      [7000, 11200],  // Cobertores
      [4000, 6400],   // Pieceras
      [1200, 1920],   // Pantalon
      [850, 1360],    // Mantel azul cuadrado
      [1500, 2400],   // Mantel azul rectangular 1,5x4
      [800, 1280],    // Funda cojin larga
      [1100, 1760],   // Faldon
      [2500, 4000],   // Cubre colchon
    ];
    for (const [base, esperado] of casos) {
      expect(precioExpress(base, 60)).toBe(esperado);
    }
  });

  it("redondea el recargo al peso antes de sumarlo", () => {
    // 175 * 0,6 = 105 exacto; 174 * 0,6 = 104,4 -> 104
    expect(precioExpress(175, 60)).toBe(280);
    expect(precioExpress(174, 60)).toBe(278);
    expect(precioExpress(125, 60)).toBe(200);
  });

  it("sin recargo cobra el precio base", () => {
    expect(precioExpress(1000, 0)).toBe(1000);
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
    expect(r.lineas[0].precio_unidad).toBe(800); // 500 + 60%
    expect(r.neto).toBe(3200);
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
    expect(r.lineas[0].importe).toBe(28_800); // 36 x 800
  });

  it("un item sin precio sigue sin precio", () => {
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

  it("dos precios base distintos son dos lineas aunque coincida el recargo", () => {
    // 101 y 102 al 10% dan el mismo recargo redondeado —10 los dos— y antes
    // se fusionaban, porque la factura mostraba solo el adicional. Ahora
    // muestra el precio final, que es distinto, y son dos lineas.
    const pedidos = [
      {
        pedido: { ...BASE_PEDIDO, id: 1, express: true },
        items: [
          makeItem(1, { cantidad: 1, precio_unidad: 101 }),
          makeItem(1, { cantidad: 1, precio_unidad: 102 }),
        ],
      },
    ];
    const r = consolidarExpress(pedidos, new Set([1]), 10);
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas.map((l) => l.precio_unidad).sort((a, b) => a! - b!)).toEqual(
      [111, 112],
    );
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

  it("la principal deja fuera las express", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.principal.lineas).toHaveLength(1);
    expect(r.principal.lineas[0].cantidad).toBe(10); // solo la guia normal
    expect(r.principal.neto).toBe(5000);
  });

  it("la express lleva la guia entera, con el recargo aplicado", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.express?.neto).toBe(3200); // 4 x 800, no 4 x 300
    expect(r.idsExpress).toEqual([2]);
  });

  it("cada guia va a un documento y a uno solo", () => {
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.idsNormales).toEqual([1]);
    expect(r.idsExpress).toEqual([2]);
    // Ninguna en los dos: es la regla que pidio el cliente.
    expect(r.idsNormales.filter((id) => r.idsExpress.includes(id))).toEqual([]);
  });

  it("lo facturado del periodo no cambia, solo en que papel cae", () => {
    // El reparto viejo daba 7000 (todas a base) + 1200 (solo el recargo).
    // El nuevo da 5000 (la normal) + 3200 (la express entera). Mismo total:
    // partir distinto no puede cambiar lo que paga el cliente.
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 60);
    expect(r.principal.neto + (r.express?.neto ?? 0)).toBe(8200);
  });

  it("sin recargo configurado la express se queda en la normal", () => {
    // No hay segundo documento, asi que sacarla de la principal seria no
    // cobrarla nunca.
    const r = consolidarFacturacion(pedidos, new Set([1, 2]), 0);
    expect(r.express).toBeNull();
    expect(r.principal.neto).toBe(7000);
    expect(r.idsNormales).toEqual([1, 2]);
  });

  it("sin guias express no hay segundo documento", () => {
    const r = consolidarFacturacion(pedidos, new Set([1]), 60);
    expect(r.express).toBeNull();
    expect(r.idsExpress).toEqual([]);
  });

  it("una express sin precios no genera documento en blanco, y no se pierde", () => {
    const sinPrecio = [
      {
        pedido: { ...BASE_PEDIDO, id: 2, express: true },
        items: [makeItem(2, { precio_unidad: null, importe: null })],
      },
    ];
    const r = consolidarFacturacion(sinPrecio, new Set([2]), 60);
    expect(r.express).toBeNull();
    // Sin documento express al que mandarla, vuelve a la normal: una guia
    // que no esta en ninguno de los dos es una guia que no se factura.
    expect(r.idsNormales).toEqual([2]);
    expect(r.principal.lineas).toHaveLength(1);
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
    expect(r.idsNormales).toEqual([1]);
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

describe("desglosar — precios netos vs con IVA incluido", () => {
  it("modo neto: suma el 19% encima, como siempre", () => {
    expect(desglosar(10000, "neto")).toEqual({
      neto: 10000,
      iva: 1900,
      total: 11900,
    });
  });

  it("modo con_iva: el total es intocable y el neto sale de dividir", () => {
    // Es lo que se le cobra al cliente: no se puede mover por un redondeo.
    expect(desglosar(12000, "con_iva")).toEqual({
      neto: 10084,
      iva: 1916,
      total: 12000,
    });
  });

  it("neto + IVA siempre da el total, en los dos modos", () => {
    // El IVA sale por diferencia justamente para esto: si se redondeara por
    // su cuenta, la factura fallaria por un peso y no cuadraria con la base.
    for (const monto of [1, 7, 999, 1261, 10935, 13500, 999999]) {
      for (const modo of ["neto", "con_iva"] as const) {
        const d = desglosar(monto, modo);
        expect(d.neto + d.iva).toBe(d.total);
      }
    }
  });

  it("el caso de El Cubo: $2.000 el kilo con IVA da exacto", () => {
    // 6 kilos a $2.000 + delivery $1.500 = $13.500, el numero acordado.
    // Guardando los precios netos en entero daba $13.503: tres pesos de mas
    // por los centavos que la columna no puede guardar.
    const d = desglosar(2000 * 6 + 1500, "con_iva");
    expect(d.total).toBe(13500);
    expect(d.neto).toBe(11345);
    expect(d.iva).toBe(2155);
  });

  it("x0,81 NO es sacar el IVA, y por eso estaba el error", () => {
    // 1/1,19 = 0,8403, no 0,81. Multiplicar por 0,81 deja el neto corto y al
    // sumarle el 19% no se vuelve al precio original.
    const malNeto = Math.round(2000 * 0.81);        // 1620, lo que estaba cargado
    expect(desglosar(malNeto, "neto").total).toBe(1928);   // faltan $72
    expect(desglosar(2000, "con_iva").total).toBe(2000);   // asi da
  });

  it("por omision, neto: es lo que hace casi todo el padron", () => {
    expect(desglosar(1000, "neto")).toEqual(desgloseIva(1000));
  });
});
