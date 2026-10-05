import { describe, it, expect, afterAll, vi } from "vitest";
import {
  crearSupabaseFake,
  type RespuestaFake,
  type SupabaseFake,
} from "@/lib/testing/supabase-fake";
import type { PedidoEmpresaConItems } from "@/lib/data/empresas";
import type { PedidoEmpresa, PedidoEmpresaItem } from "@/lib/types";

const estado = vi.hoisted(() => ({
  supabase: null as unknown,
  pedidos: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/empresas", () => ({
  getPedidosEmpresaPorIds: async () => estado.pedidos,
}));

import {
  crearFacturaManual,
  crearGasto,
  registrarAbono,
  registrarFactura,
} from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

const EMPRESA = {
  rut: "96620830-9",
  nombre: "Hotel Acacias de Vitacura SA",
  alias: "Hotel Acacias",
  comuna: "Vitacura",
  calle: "El Manantial 1781",
  contacto_1: null,
  contacto_2: null,
  correo: null,
  activo: true,
  recargo_express: 60,
};

function guia(
  id: number,
  express: boolean,
  items: Array<Partial<PedidoEmpresaItem>>,
): PedidoEmpresaConItems {
  const pedido: PedidoEmpresa = {
    id,
    rut_empresa: EMPRESA.rut,
    alias: EMPRESA.alias,
    fecha: `2026-07-${String(id % 28 || 1).padStart(2, "0")}T12:00:00-04:00`,
    detalle: null,
    anulado: false,
    express,
    created_at: "",
    updated_at: "",
  };
  return {
    pedido,
    items: items.map((it, i) => ({
      id: id * 100 + i,
      pedido_empresa_id: id,
      producto_empresa_id: "001",
      producto_empresa_nombre: "Sabana 1,5plz",
      precio_unidad: 500,
      importe: 500,
      cantidad: 1,
      detalle_prenda: null,
      bolsa_id: null,
      bolsa_codigo: null,
      created_at: "",
      ...it,
    })),
  };
}

function conPedidos(lista: PedidoEmpresaConItems[]) {
  estado.pedidos = lista;
}

describe("registrarFactura", () => {
  it("recalcula el consolidado en el servidor y no le cree al cliente", async () => {
    conPedidos([guia(1, false, [{ cantidad: 10, precio_unidad: 500 }])]);
    const fake = montar({
      "clientes_empresa.select": { data: EMPRESA },
      "rpc.registrar_factura": { data: 77 },
    });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [1],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });

    expect(res).toEqual({ ok: true, id: 77 });
    const rpc = fake.rpcs.at(-1)!;
    expect(rpc.funcion).toBe("registrar_factura");
    const factura = rpc.args.p_factura as Record<string, unknown>;
    expect(factura.neto).toBe(5000);
    expect(factura.iva).toBe(950);
    expect(factura.total).toBe(5950);
    expect(factura.tipo).toBe("normal");
  });

  it("pone vencimiento a 30 dias si no le dan uno", async () => {
    conPedidos([guia(1, false, [{ cantidad: 1 }])]);
    const fake = montar({
      "clientes_empresa.select": { data: EMPRESA },
      "rpc.registrar_factura": { data: 1 },
    });

    await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [1],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });

    const factura = fake.rpcs.at(-1)!.args.p_factura as Record<string, unknown>;
    expect(factura.fecha_vence).toBe("2026-08-31");
  });

  it("guarda el periodo que cubren las guias", async () => {
    conPedidos([
      guia(5, false, [{ cantidad: 1 }]),
      guia(20, false, [{ cantidad: 1 }]),
    ]);
    const fake = montar({
      "clientes_empresa.select": { data: EMPRESA },
      "rpc.registrar_factura": { data: 1 },
    });

    await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [5, 20],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });

    const factura = fake.rpcs.at(-1)!.args.p_factura as Record<string, unknown>;
    expect(factura.periodo_desde).toBe("2026-07-05");
    expect(factura.periodo_hasta).toBe("2026-07-20");
  });

  it("la express cobra solo el recargo y solo las guias express", async () => {
    conPedidos([
      guia(1, false, [{ cantidad: 10, precio_unidad: 500 }]),
      guia(2, true, [{ cantidad: 4, precio_unidad: 500 }]),
    ]);
    const fake = montar({
      "clientes_empresa.select": { data: EMPRESA },
      "rpc.registrar_factura": { data: 88 },
    });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "express",
      guiaIds: [1, 2],
      folio: "1686",
      fecha: "2026-09-08",
      fecha_vence: null,
      notas: null,
    });

    expect(res.ok).toBe(true);
    const rpc = fake.rpcs.at(-1)!;
    const factura = rpc.args.p_factura as Record<string, unknown>;
    // 4 unidades x 300 (60% de 500) = 1.200, no las 14 del consolidado normal.
    expect(factura.neto).toBe(1200);
    expect(factura.folio).toBe("1686");
    // Solo la guia express queda amarrada al documento de recargo.
    expect(rpc.args.p_guias).toEqual([2]);
  });

  it("rechaza el express si ninguna guia marcada lo es", async () => {
    conPedidos([guia(1, false, [{ cantidad: 10 }])]);
    montar({ "clientes_empresa.select": { data: EMPRESA } });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "express",
      guiaIds: [1],
      folio: null,
      fecha: "2026-09-08",
      fecha_vence: null,
      notas: null,
    });

    expect(res).toEqual({
      ok: false,
      error: "Ninguna de las guías marcadas es express.",
    });
  });

  it("avisa si la empresa no tiene recargo configurado", async () => {
    conPedidos([guia(2, true, [{ cantidad: 4, precio_unidad: 500 }])]);
    montar({
      "clientes_empresa.select": { data: { ...EMPRESA, recargo_express: 0 } },
    });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "express",
      guiaIds: [2],
      folio: null,
      fecha: "2026-09-08",
      fecha_vence: null,
      notas: null,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("no tiene recargo express");
  });

  it("no factura si alguna guia se perdio en el camino", async () => {
    // La pantalla mando dos, la base devuelve una: alguien la anulo mientras
    // tanto. Emitir por la mitad seria peor que fallar.
    conPedidos([guia(1, false, [{ cantidad: 1 }])]);
    montar({ "clientes_empresa.select": { data: EMPRESA } });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [1, 2],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("Volvé a cargar");
  });

  it("deja pasar el aviso de guias ya facturadas tal cual lo arma la base", async () => {
    conPedidos([guia(1, false, [{ cantidad: 1 }])]);
    montar({
      "clientes_empresa.select": { data: EMPRESA },
      "rpc.registrar_factura": {
        error: { message: "Ya facturadas: guía #1 (factura #9)" },
      },
    });

    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [1],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });

    expect(res).toEqual({ ok: false, error: "guía #1 (factura #9)" });
  });

  it("exige al menos una guia", async () => {
    conPedidos([]);
    montar();
    const res = await registrarFactura({
      rut: EMPRESA.rut,
      tipo: "normal",
      guiaIds: [],
      folio: null,
      fecha: "2026-08-01",
      fecha_vence: null,
      notas: null,
    });
    expect(res).toEqual({ ok: false, error: "Marcá al menos una guía" });
  });
});

describe("crearFacturaManual", () => {
  it("calcula el IVA a partir del neto", async () => {
    const fake = montar({ "facturas.insert": { data: { id: 5 } } });

    const res = await crearFacturaManual({
      rut_empresa: EMPRESA.rut,
      tipo: "normal",
      folio: "1700",
      fecha: "2026-09-01",
      fecha_vence: null,
      neto: 100_000,
      notas: null,
    });

    expect(res).toEqual({ ok: true, id: 5 });
    const payload = fake.ultima("facturas", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.neto).toBe(100_000);
    expect(payload.iva).toBe(19_000);
    expect(payload.total).toBe(119_000);
    expect(payload.estado).toBe("pendiente");
  });

  it("exige una empresa", async () => {
    montar();
    const res = await crearFacturaManual({
      rut_empresa: "",
      tipo: "normal",
      folio: null,
      fecha: "2026-09-01",
      fecha_vence: null,
      neto: 1000,
      notas: null,
    });
    expect(res).toEqual({ ok: false, error: "Elegí una empresa" });
  });
});

describe("registrarAbono", () => {
  const FACTURA = { estado: "pendiente", total: 119_000, monto_pagado: 0 };

  it("guarda el pago contra la factura", async () => {
    const fake = montar({
      "facturas.select": { data: FACTURA },
      "facturas_abonos.insert": {},
    });

    const res = await registrarAbono(3, {
      fecha: "2026-09-20",
      monto: 50_000,
      forma_pago: "transferencia",
      notas: null,
    });

    expect(res.ok).toBe(true);
    const payload = fake.ultima("facturas_abonos", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      factura_id: 3,
      fecha: "2026-09-20",
      monto: 50_000,
      forma_pago: "transferencia",
    });
  });

  it("no escribe el estado: lo deriva la base de la suma de abonos", async () => {
    const fake = montar({
      "facturas.select": { data: FACTURA },
      "facturas_abonos.insert": {},
    });

    await registrarAbono(3, {
      fecha: "2026-09-20",
      monto: 119_000,
      forma_pago: "transferencia",
      notas: null,
    });

    // Aunque el abono salde la factura, la app no toca `facturas`.
    expect(fake.ultima("facturas", "update")).toBeUndefined();
  });

  it("acepta un abono parcial sobre uno previo", async () => {
    const fake = montar({
      "facturas.select": { data: { ...FACTURA, monto_pagado: 80_000 } },
      "facturas_abonos.insert": {},
    });

    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 39_000,
      forma_pago: "transferencia",
      notas: null,
    });

    expect(res.ok).toBe(true);
    const payload = fake.ultima("facturas_abonos", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.monto).toBe(39_000);
  });

  it("rechaza un abono que supera el saldo", async () => {
    montar({ "facturas.select": { data: { ...FACTURA, monto_pagado: 100_000 } } });

    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 50_000, // el saldo es 19.000
      forma_pago: "transferencia",
      notas: null,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("supera el saldo");
  });

  it("rechaza pagar una factura ya saldada", async () => {
    montar({
      "facturas.select": { data: { ...FACTURA, monto_pagado: 119_000 } },
    });

    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 1000,
      forma_pago: "transferencia",
      notas: null,
    });

    expect(res).toEqual({ ok: false, error: "Esta factura ya está saldada." });
  });

  it("rechaza pagar una factura anulada", async () => {
    montar({
      "facturas.select": { data: { ...FACTURA, estado: "anulada" } },
    });

    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 1000,
      forma_pago: "transferencia",
      notas: null,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("anulada");
  });

  it("rechaza monto cero", async () => {
    montar({ "facturas.select": { data: FACTURA } });
    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 0,
      forma_pago: "transferencia",
      notas: null,
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza una forma de pago que no corresponde a un cobro", async () => {
    montar({ "facturas.select": { data: FACTURA } });
    const res = await registrarAbono(3, {
      fecha: "2026-10-05",
      monto: 1000,
      // `no_pago` existe en el enum de mostrador pero no es un cobro.
      forma_pago: "no_pago" as "transferencia",
      notas: null,
    });
    expect(res.ok).toBe(false);
  });
});

describe("crearGasto", () => {
  it("guarda el gasto sin pagar", async () => {
    const fake = montar({ "gastos.insert": { data: { id: 2 } } });

    const res = await crearGasto({
      categoria: "luz",
      descripcion: "Boleta septiembre",
      proveedor: "Enel",
      documento: null,
      fecha: "2026-10-05",
      fecha_vence: "2026-10-20",
      periodo: "2026-09",
      monto: 185_000,
      notas: null,
    });

    expect(res).toEqual({ ok: true, id: 2 });
    const payload = fake.ultima("gastos", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.pagado).toBe(false);
    expect(payload.periodo).toBe("2026-09");
    expect(payload.monto).toBe(185_000);
  });

  it("rechaza un periodo mal escrito", async () => {
    montar();
    const res = await crearGasto({
      categoria: "agua",
      descripcion: "Boleta",
      proveedor: null,
      documento: null,
      fecha: "2026-10-05",
      fecha_vence: null,
      periodo: "2026-9",
      monto: 1000,
      notas: null,
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("2026-09");
  });

  it("rechaza monto cero", async () => {
    montar();
    const res = await crearGasto({
      categoria: "otros",
      descripcion: "Algo",
      proveedor: null,
      documento: null,
      fecha: "2026-10-05",
      fecha_vence: null,
      periodo: null,
      monto: 0,
      notas: null,
    });
    expect(res.ok).toBe(false);
  });
});
