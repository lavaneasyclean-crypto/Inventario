import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearSupabaseFake, type SupabaseFake } from "@/lib/testing/supabase-fake";

const estado = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));
vi.mock("server-only", () => ({}));

import { getPedidoEmpresaDetalle } from "./empresas";

/**
 * La forma cruda que devuelve PostgREST con los anidados.
 *
 * Está copiada de una respuesta real de la guía #1633 (Termochemical) y no
 * inventada: si el día de mañana cambia el nombre de una relación o deja de
 * venir un anidado, lo que se rompe es esto y no la pantalla.
 */
const FILA_CRUDA = {
  id: 1633,
  rut_empresa: "96868910-K",
  alias: null,
  fecha: "2026-09-30T15:00:00+00:00",
  detalle: null,
  created_at: "2026-10-01T12:00:00+00:00",
  updated_at: "2026-10-01T12:00:00+00:00",
  express: false,
  anulado: false,
  fecha_entrega: null,
  fecha_pago: null,
  // A propósito desordenadas: tienen que salir por id ascendente, que es el
  // orden de la planilla de papel contra la que se revisa la ropa.
  pedidos_empresa_items: [
    { id: 8702, cantidad: 2, pedido_empresa_id: 1633, producto_empresa_id: "036",
      producto_empresa_nombre: "Polera", precio_unidad: 1200, importe: 2400,
      bolsa_id: 21, bolsa_codigo: "21", detalle_prenda: null, created_at: "x" },
    { id: 8701, cantidad: 1, pedido_empresa_id: 1633, producto_empresa_id: "037",
      producto_empresa_nombre: "Pantalón", precio_unidad: 1500, importe: 1500,
      bolsa_id: 22, bolsa_codigo: "22", detalle_prenda: null, created_at: "x" },
  ],
  clientes_empresa: {
    rut: "96868910-K",
    nombre: "Termochemical Latinoamerica S.A.",
    alias: null,
    usa_bolsas: true,
    recargo_express: 0,
    activo: true,
    calle: null, comuna: null, correo: null,
    contacto_1: null, contacto_2: null,
    created_at: "x", updated_at: "x",
    empresa_bolsas: [
      { id: 22, codigo: "22", nombre: null, activo: true, rut_empresa: "96868910-K" },
      { id: 21, codigo: "21", nombre: null, activo: true, rut_empresa: "96868910-K" },
      { id: 20, codigo: "20", nombre: null, activo: false, rut_empresa: "96868910-K" },
    ],
    empresa_productos: [
      { producto_empresa_id: "036", precio: 1200, orden: 0, en_grilla: true,
        productos_empresa: { nombre: "Polera", activo: true } },
      { producto_empresa_id: "999", precio: 500, orden: 1, en_grilla: true,
        productos_empresa: { nombre: "Prenda dada de baja", activo: false } },
      { producto_empresa_id: "040", precio: 800, orden: 2, en_grilla: false,
        productos_empresa: { nombre: "Traslado", activo: true } },
    ],
  },
  facturas_guias: [
    { factura_id: 28, facturas: { id: 28, folio: "1699" } },
  ],
};

function montar(data: unknown): SupabaseFake {
  const fake = crearSupabaseFake({ "pedidos_empresa.select": { data } });
  estado.supabase = fake;
  return fake;
}

describe("getPedidoEmpresaDetalle — todo en un solo viaje", () => {
  let fake: SupabaseFake;
  beforeEach(() => {
    fake = montar(FILA_CRUDA);
  });

  it("consulta una sola vez: ese era el problema de fondo", async () => {
    await getPedidoEmpresaDetalle(1633);
    expect(fake.llamadas).toHaveLength(1);
    expect(fake.llamadas[0].tabla).toBe("pedidos_empresa");
  });

  it("saca los anidados de adentro del pedido", async () => {
    const d = await getPedidoEmpresaDetalle(1633);
    // Si quedaran pegados, se filtrarian a cualquier update que mande el
    // pedido entero de vuelta a la base.
    expect(d!.pedido).not.toHaveProperty("pedidos_empresa_items");
    expect(d!.pedido).not.toHaveProperty("clientes_empresa");
    expect(d!.pedido).not.toHaveProperty("facturas_guias");
    expect(d!.empresa).not.toHaveProperty("empresa_bolsas");
    expect(d!.empresa).not.toHaveProperty("empresa_productos");
    expect(d!.pedido.id).toBe(1633);
    expect(d!.empresa!.nombre).toBe("Termochemical Latinoamerica S.A.");
  });

  it("ordena las lineas por id, como la planilla", async () => {
    const d = await getPedidoEmpresaDetalle(1633);
    expect(d!.items.map((i) => i.id)).toEqual([8701, 8702]);
  });

  it("devuelve las bolsas inactivas tambien", async () => {
    // La hoja de devolucion necesita la bolsa dada de baja para poder nombrar
    // una guia vieja; el editor es el que filtra despues.
    const d = await getPedidoEmpresaDetalle(1633);
    expect(d!.bolsas.map((b) => b.codigo)).toEqual(["20", "21", "22"]);
  });

  it("descarta los productos dados de baja y respeta el orden", async () => {
    const d = await getPedidoEmpresaDetalle(1633);
    expect(d!.productos.map((p) => p.nombre)).toEqual(["Polera", "Traslado"]);
  });

  it("aplana la cobertura de facturas", async () => {
    const d = await getPedidoEmpresaDetalle(1633);
    expect(d!.facturas).toEqual([{ id: 28, folio: "1699" }]);
  });

  it("sin guia, null", async () => {
    montar(null);
    expect(await getPedidoEmpresaDetalle(999999)).toBeNull();
  });

  it("aguanta que no vuelva ningun anidado", async () => {
    // A ventas, RLS le vacia facturas_guias. No es un error: es que no las ve.
    montar({ ...FILA_CRUDA, pedidos_empresa_items: null,
             clientes_empresa: null, facturas_guias: null });
    const d = await getPedidoEmpresaDetalle(1633);
    expect(d!.empresa).toBeNull();
    expect(d!.items).toEqual([]);
    expect(d!.bolsas).toEqual([]);
    expect(d!.productos).toEqual([]);
    expect(d!.facturas).toEqual([]);
  });
});
