import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  crearSupabaseFake,
  type RespuestaFake,
  type SupabaseFake,
} from "@/lib/testing/supabase-fake";
import { MENSAJE_GENERICO, MENSAJE_SIN_CONEXION } from "@/lib/errores";

const estado = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearPedido, crearCliente } from "./actions";

// `fallo` registra el detalle en el log; acá solo estorba.
const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

function pedidoBase() {
  return {
    rut_cliente: "12345678-9",
    nombre_cliente: "Ana Pérez",
    contacto: null,
    direccion: null,
    fecha_entrega: null,
    notas: null,
    pagado: false,
    forma_pago: "efectivo" as const,
    items: [
      {
        producto_id: "SC001",
        nombre: "Lavado por kilo",
        tipo_servicio: "lavado" as const,
        precio_unidad: 3500,
        cantidad: 2,
        detalle: null,
      },
      {
        producto_id: "PL010",
        nombre: "Planchado camisa",
        tipo_servicio: "planchado" as const,
        precio_unidad: 1200,
        cantidad: 3,
        detalle: null,
      },
    ],
  };
}

describe("crearPedido — validación", () => {
  beforeEach(() => montar());

  it("exige al menos un item", async () => {
    const fake = montar();
    const res = await crearPedido({ ...pedidoBase(), items: [] });

    expect(res).toEqual({ ok: false, error: "Agregá al menos un item" });
    // No debe haber tocado la base.
    expect(fake.rpcs).toHaveLength(0);
  });

  it("rechaza cantidades en cero", async () => {
    const base = pedidoBase();
    const res = await crearPedido({
      ...base,
      items: [{ ...base.items[0], cantidad: 0 }],
    });

    expect(res.ok).toBe(false);
  });

  it("rechaza un RUT mal formado", async () => {
    const res = await crearPedido({
      ...pedidoBase(),
      rut_cliente: "12.345.678-9",
    });

    expect(res).toEqual({ ok: false, error: "RUT con formato inválido" });
  });

  it("exige cliente o nombre", async () => {
    const res = await crearPedido({
      ...pedidoBase(),
      rut_cliente: null,
      nombre_cliente: null,
    });

    expect(res).toEqual({ ok: false, error: "Indicá un cliente o un nombre" });
  });

  it("acepta un pedido sin RUT si tiene nombre", async () => {
    montar({ "rpc.crear_pedido": { data: 500 } });
    const res = await crearPedido({
      ...pedidoBase(),
      rut_cliente: null,
      nombre_cliente: "Cliente de paso",
    });

    expect(res).toEqual({ ok: true, id: 500 });
  });
});

describe("crearPedido — lo que se manda a la base", () => {
  it("crea el pedido con una sola llamada atómica", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1234 } });
    const res = await crearPedido(pedidoBase());

    expect(res).toEqual({ ok: true, id: 1234 });
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0].funcion).toBe("crear_pedido");
    // Nada de insertar el pedido y los items por separado.
    expect(fake.llamadas).toHaveLength(0);
  });

  it("no manda un id: lo asigna la secuencia", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido(pedidoBase());

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido).not.toHaveProperty("id");
  });

  it("suma el total como precio por cantidad", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido(pedidoBase());

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.total_venta).toBe(3500 * 2 + 1200 * 3); // 10.600
  });

  it("sin pagar deja forma_pago en no_pago y nada abonado", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({ ...pedidoBase(), pagado: false, forma_pago: "efectivo" });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.forma_pago).toBe("no_pago");
    expect(p_pedido.monto_abonado).toBe(0);
    expect(p_pedido.fecha_pago).toBeNull();
  });

  it("pagado abona el total y registra la fecha de pago", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({
      ...pedidoBase(),
      pagado: true,
      forma_pago: "transferencia",
    });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.forma_pago).toBe("transferencia");
    expect(p_pedido.monto_abonado).toBe(10600);
    expect(p_pedido.fecha_pago).toBe(p_pedido.fecha_recepcion);
  });

  it("los items no llevan importe: lo calcula la funcion SQL", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido(pedidoBase());

    const { p_items } = fake.rpcs[0].args as {
      p_items: Record<string, unknown>[];
    };
    expect(p_items).toHaveLength(2);
    for (const item of p_items) {
      expect(item).not.toHaveProperty("importe");
    }
    expect(p_items[0]).toMatchObject({
      producto_id: "SC001",
      producto_nombre: "Lavado por kilo",
      producto_tipo_servicio: "lavado",
      precio_unidad: 3500,
      cantidad: 2,
    });
  });

  it("acepta importes negativos (descuentos)", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    const base = pedidoBase();
    await crearPedido({
      ...base,
      items: [
        base.items[0],
        {
          producto_id: "AA999",
          nombre: "Descuento cliente frecuente",
          tipo_servicio: "descuento" as const,
          precio_unidad: -1000,
          cantidad: 1,
          detalle: null,
        },
      ],
    });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.total_venta).toBe(3500 * 2 - 1000);
  });
});

describe("crearPedido — productos por medida", () => {
  function alfombra(extra: Record<string, unknown> = {}) {
    return {
      producto_id: "SC050",
      nombre: "Alfombra base dura",
      tipo_servicio: "lavado" as const,
      unidad_cobro: "m2" as const,
      ancho: 1.4,
      largo: 2.1,
      precio_unidad: 8000,
      cantidad: 1,
      detalle: null,
      ...extra,
    };
  }

  it("cobra la superficie redondeada al medio m2", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({ ...pedidoBase(), items: [alfombra()] });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    // 1,4 x 2,1 = 2,94 m2 -> se cobra 3,0 -> 3 x 8.000
    expect(p_pedido.total_venta).toBe(24000);
  });

  it("manda las medidas y la unidad a la base", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({ ...pedidoBase(), items: [alfombra()] });

    const { p_items } = fake.rpcs[0].args as { p_items: Record<string, unknown>[] };
    expect(p_items[0]).toMatchObject({
      unidad_cobro: "m2",
      ancho: 1.4,
      largo: 2.1,
      precio_unidad: 8000,
      cantidad: 1,
    });
    // El importe lo calcula la funcion SQL, no viaja desde acá.
    expect(p_items[0]).not.toHaveProperty("importe");
  });

  it("una cortina solo necesita el largo", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({
      ...pedidoBase(),
      items: [
        alfombra({
          nombre: "Cortina",
          unidad_cobro: "metro_lineal",
          ancho: null,
          largo: 2.3,
          precio_unidad: 4000,
        }),
      ],
    });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.total_venta).toBe(10000); // 2,3 -> 2,5 x 4.000
  });

  it("multiplica por las piezas", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido({
      ...pedidoBase(),
      items: [alfombra({ ancho: 2, largo: 3, cantidad: 2 })],
    });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.total_venta).toBe(96000); // 6 m2 x 2 piezas x 8.000
  });

  it("no deja cerrar el pedido si falta una medida", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    const res = await crearPedido({
      ...pedidoBase(),
      items: [alfombra({ largo: null })],
    });

    expect(res).toEqual({
      ok: false,
      error: 'Falta la medida de "Alfombra base dura"',
    });
    expect(fake.rpcs).toHaveLength(0);
  });

  it("los productos por unidad siguen andando sin medidas", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    await crearPedido(pedidoBase());

    const { p_items } = fake.rpcs[0].args as { p_items: Record<string, unknown>[] };
    expect(p_items[0]).toMatchObject({ unidad_cobro: "unidad", ancho: null, largo: null });
  });

  it("mezcla piezas y medidas en el mismo pedido", async () => {
    const fake = montar({ "rpc.crear_pedido": { data: 1 } });
    const base = pedidoBase();
    await crearPedido({ ...base, items: [base.items[0], alfombra()] });

    const { p_pedido } = fake.rpcs[0].args as { p_pedido: Record<string, unknown> };
    expect(p_pedido.total_venta).toBe(3500 * 2 + 24000);
  });
});

describe("crearPedido — errores", () => {
  it("no filtra el mensaje crudo de Postgres a la pantalla", async () => {
    montar({
      "rpc.crear_pedido": {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "pedidos_pkey"',
        },
      },
    });
    const res = await crearPedido(pedidoBase());

    expect(res.ok).toBe(false);
    const error = (res as { error: string }).error;
    expect(error).toBe("Ya existe un registro con esos datos.");
    expect(error).not.toMatch(/constraint|pkey|duplicate/i);
  });

  it("avisa cuando falta aplicar la migracion de la funcion", async () => {
    montar({
      "rpc.crear_pedido": {
        error: {
          code: "PGRST202",
          message: "Could not find the function public.crear_pedido",
        },
      },
    });
    const res = await crearPedido(pedidoBase());

    expect((res as { error: string }).error).toMatch(/migración/i);
  });

  it("distingue un problema de conexion", async () => {
    montar({
      "rpc.crear_pedido": { error: { message: "TypeError: fetch failed" } },
    });
    const res = await crearPedido(pedidoBase());

    expect((res as { error: string }).error).toBe(MENSAJE_SIN_CONEXION);
  });

  it("cae al generico con un error sin codigo conocido", async () => {
    montar({ "rpc.crear_pedido": { error: { code: "XX999", message: "boom" } } });
    const res = await crearPedido(pedidoBase());

    expect((res as { error: string }).error).toBe(MENSAJE_GENERICO);
  });

  it("no da por creado un pedido si la funcion no devuelve id", async () => {
    montar({ "rpc.crear_pedido": { data: null } });
    const res = await crearPedido(pedidoBase());

    expect(res.ok).toBe(false);
  });
});

describe("crearCliente", () => {
  const clienteBase = {
    rut: "12345678-9",
    nombre: "Ana Pérez",
    telefono: "912345678",
    correo: "ana@example.cl",
    comuna: "Ñuñoa",
    calle: "Irarrázaval 123",
    dpto: null,
  };

  it("inserta cuando el RUT no existe", async () => {
    const fake = montar({ "clientes.select": { data: null } });
    const res = await crearCliente(clienteBase);

    expect(res).toEqual({ ok: true, rut: "12345678-9" });
    const insert = fake.ultima("clientes", "insert");
    expect(insert?.payload).toMatchObject({
      rut: "12345678-9",
      nombre: "Ana Pérez",
      telefono: "912345678",
    });
    expect(fake.ultima("clientes", "update")).toBeUndefined();
  });

  it("si el RUT ya existe actualiza en vez de insertar", async () => {
    const fake = montar({ "clientes.select": { data: { rut: "12345678-9" } } });
    const res = await crearCliente(clienteBase);

    expect(res.ok).toBe(true);
    expect(fake.ultima("clientes", "insert")).toBeUndefined();
    const update = fake.ultima("clientes", "update");
    expect(update?.filtros).toContainEqual({
      metodo: "eq",
      args: ["rut", "12345678-9"],
    });
  });

  it("al actualizar no pisa con nulos lo que ya estaba guardado", async () => {
    const fake = montar({ "clientes.select": { data: { rut: "12345678-9" } } });
    await crearCliente({
      ...clienteBase,
      telefono: null,
      correo: null,
      comuna: null,
      calle: null,
      dpto: null,
    });

    const parche = fake.ultima("clientes", "update")?.payload as Record<
      string,
      unknown
    >;
    // Solo viaja lo que la persona completó: el resto queda como estaba.
    expect(parche).toEqual({ nombre: "Ana Pérez" });
  });

  it("rechaza un RUT con puntos", async () => {
    montar();
    const res = await crearCliente({ ...clienteBase, rut: "12.345.678-9" });

    expect(res).toEqual({ ok: false, error: "RUT con formato inválido" });
  });

  it("rechaza un correo mal formado", async () => {
    montar();
    const res = await crearCliente({ ...clienteBase, correo: "ana@" });

    expect(res).toEqual({ ok: false, error: "Correo inválido" });
  });

  it("acepta correo vacio como sin correo", async () => {
    const fake = montar({ "clientes.select": { data: null } });
    const res = await crearCliente({ ...clienteBase, correo: "" });

    expect(res.ok).toBe(true);
    const payload = fake.ultima("clientes", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.correo).toBeNull();
  });

  it("no filtra el error crudo al fallar el insert", async () => {
    montar({
      "clientes.select": { data: null },
      "clientes.insert": {
        error: { code: "23505", message: 'duplicate key ... "clientes_pkey"' },
      },
    });
    const res = await crearCliente(clienteBase);

    expect((res as { error: string }).error).not.toMatch(/pkey|duplicate/i);
  });
});
