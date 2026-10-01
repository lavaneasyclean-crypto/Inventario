import { describe, it, expect } from "vitest";
import {
  desgloseIva,
  diasHastaVencer,
  esPeriodoValido,
  estadoMostradoFactura,
  estadoVencimiento,
  etiquetaPeriodo,
  periodoDeFecha,
  rangoDeFechas,
  resumirFacturas,
  resumirGastos,
  saldoFactura,
  vencimientoPorDefecto,
} from "./finanzas";
import type { Factura, Gasto } from "./types";

const HOY = "2026-09-15";

function factura(partial: Partial<Factura> = {}): Factura {
  return {
    id: 1,
    rut_empresa: "76116233-0",
    tipo: "normal",
    folio: null,
    fecha: "2026-09-01",
    fecha_vence: "2026-10-01",
    periodo_desde: null,
    periodo_hasta: null,
    neto: 100_000,
    iva: 19_000,
    total: 119_000,
    estado: "pendiente",
    monto_pagado: 0,
    fecha_pago: null,
    forma_pago: null,
    notas: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function gasto(partial: Partial<Gasto> = {}): Gasto {
  return {
    id: 1,
    categoria: "luz",
    descripcion: "Boleta luz",
    proveedor: "Enel",
    documento: null,
    fecha: "2026-09-01",
    fecha_vence: "2026-09-20",
    periodo: "2026-08",
    monto: 50_000,
    pagado: false,
    fecha_pago: null,
    forma_pago: null,
    notas: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("desgloseIva", () => {
  it("agrega el 19% y redondea", () => {
    expect(desgloseIva(100_000)).toEqual({
      neto: 100_000,
      iva: 19_000,
      total: 119_000,
    });
  });

  it("redondea el iva al peso", () => {
    // 12.345 * 0,19 = 2.345,55
    expect(desgloseIva(12_345)).toEqual({
      neto: 12_345,
      iva: 2_346,
      total: 14_691,
    });
  });

  it("el total siempre es neto + iva", () => {
    for (const neto of [1, 7, 999, 1_000_001]) {
      const d = desgloseIva(neto);
      expect(d.total).toBe(d.neto + d.iva);
    }
  });

  it("acepta cero", () => {
    expect(desgloseIva(0)).toEqual({ neto: 0, iva: 0, total: 0 });
  });
});

describe("vencimientoPorDefecto", () => {
  it("suma 30 dias y cruza el fin de mes", () => {
    expect(vencimientoPorDefecto("2026-09-30")).toBe("2026-10-30");
  });

  it("acepta otro plazo", () => {
    expect(vencimientoPorDefecto("2026-09-01", 15)).toBe("2026-09-16");
  });
});

describe("estadoVencimiento", () => {
  it("sin fecha no vence nunca", () => {
    expect(estadoVencimiento(null, HOY)).toBe("sin_fecha");
    expect(estadoVencimiento("", HOY)).toBe("sin_fecha");
    expect(estadoVencimiento("no-es-fecha", HOY)).toBe("sin_fecha");
  });

  it("ayer esta vencido", () => {
    expect(estadoVencimiento("2026-09-14", HOY)).toBe("vencido");
  });

  it("el dia del vencimiento todavia esta al dia", () => {
    expect(estadoVencimiento(HOY, HOY)).toBe("por_vencer");
  });

  it("dentro de la semana esta por vencer", () => {
    expect(estadoVencimiento("2026-09-22", HOY)).toBe("por_vencer");
  });

  it("mas alla del aviso esta al dia", () => {
    expect(estadoVencimiento("2026-09-23", HOY)).toBe("al_dia");
    expect(estadoVencimiento("2026-10-01", HOY)).toBe("al_dia");
  });
});

describe("diasHastaVencer", () => {
  it("cuenta hacia adelante y hacia atras", () => {
    expect(diasHastaVencer("2026-09-20", HOY)).toBe(5);
    expect(diasHastaVencer("2026-09-10", HOY)).toBe(-5);
    expect(diasHastaVencer(HOY, HOY)).toBe(0);
  });

  it("devuelve null sin fecha", () => {
    expect(diasHastaVencer(null, HOY)).toBeNull();
  });
});

describe("estadoMostradoFactura", () => {
  it("una pagada se muestra pagada aunque la fecha haya pasado", () => {
    const f = factura({ estado: "pagada", fecha_vence: "2026-01-01" });
    expect(estadoMostradoFactura(f, HOY)).toBe("pagada");
  });

  it("una anulada vencida sigue anulada", () => {
    const f = factura({ estado: "anulada", fecha_vence: "2026-01-01" });
    expect(estadoMostradoFactura(f, HOY)).toBe("anulada");
  });

  it("una pendiente con fecha pasada esta vencida", () => {
    expect(
      estadoMostradoFactura(factura({ fecha_vence: "2026-09-01" }), HOY),
    ).toBe("vencida");
  });

  it("una pendiente sin fecha de vencimiento queda pendiente", () => {
    expect(
      estadoMostradoFactura(factura({ fecha_vence: null }), HOY),
    ).toBe("pendiente");
  });
});

describe("resumirFacturas", () => {
  it("las anuladas no suman a nada", () => {
    const r = resumirFacturas(
      [factura({ estado: "anulada", total: 500_000 })],
      HOY,
    );
    expect(r.pendiente).toEqual({ cantidad: 0, total: 0 });
    expect(r.liquidado).toEqual({ cantidad: 0, total: 0 });
    expect(r.vencido).toEqual({ cantidad: 0, total: 0 });
  });

  it("separa lo pendiente de lo cobrado", () => {
    const r = resumirFacturas(
      [
        factura({ id: 1, total: 100_000 }),
        factura({
          id: 2,
          total: 200_000,
          monto_pagado: 200_000,
          estado: "pagada",
          fecha_pago: HOY,
        }),
      ],
      HOY,
    );
    expect(r.pendiente).toEqual({ cantidad: 1, total: 100_000 });
    expect(r.liquidado).toEqual({ cantidad: 1, total: 200_000 });
  });

  it("lo vencido es un subconjunto de lo pendiente, no algo aparte", () => {
    const r = resumirFacturas(
      [
        factura({ id: 1, total: 100_000, fecha_vence: "2026-08-01" }),
        factura({ id: 2, total: 200_000, fecha_vence: "2026-12-01" }),
      ],
      HOY,
    );
    expect(r.pendiente).toEqual({ cantidad: 2, total: 300_000 });
    expect(r.vencido).toEqual({ cantidad: 1, total: 100_000 });
  });

  it("clasifica por vencer sin contarlo como vencido", () => {
    const r = resumirFacturas(
      [factura({ total: 100_000, fecha_vence: "2026-09-18" })],
      HOY,
    );
    expect(r.porVencer).toEqual({ cantidad: 1, total: 100_000 });
    expect(r.vencido).toEqual({ cantidad: 0, total: 0 });
  });

  it("sin facturas todo queda en cero", () => {
    const r = resumirFacturas([], HOY);
    expect(r.pendiente.total).toBe(0);
    expect(r.vencido.total).toBe(0);
    expect(r.porVencer.total).toBe(0);
    expect(r.liquidado.total).toBe(0);
  });
});

describe("resumirGastos", () => {
  it("separa pagados de pendientes", () => {
    const r = resumirGastos(
      [
        gasto({ id: 1, monto: 50_000 }),
        gasto({ id: 2, monto: 30_000, pagado: true, fecha_pago: HOY }),
      ],
      HOY,
    );
    expect(r.pendiente).toEqual({ cantidad: 1, total: 50_000 });
    expect(r.liquidado).toEqual({ cantidad: 1, total: 30_000 });
  });

  it("marca vencido lo impago con fecha pasada", () => {
    const r = resumirGastos(
      [gasto({ monto: 50_000, fecha_vence: "2026-09-01" })],
      HOY,
    );
    expect(r.vencido).toEqual({ cantidad: 1, total: 50_000 });
  });

  it("un gasto pagado fuera de plazo no cuenta como vencido", () => {
    const r = resumirGastos(
      [
        gasto({
          monto: 50_000,
          fecha_vence: "2026-09-01",
          pagado: true,
          fecha_pago: "2026-09-10",
        }),
      ],
      HOY,
    );
    expect(r.vencido).toEqual({ cantidad: 0, total: 0 });
    expect(r.liquidado).toEqual({ cantidad: 1, total: 50_000 });
  });
});

describe("periodos", () => {
  it("periodoDeFecha recorta al mes", () => {
    expect(periodoDeFecha("2026-09-15")).toBe("2026-09");
  });

  it("periodoDeFecha rechaza una fecha invalida", () => {
    expect(() => periodoDeFecha("2026-13-01")).toThrow(RangeError);
  });

  it("esPeriodoValido exige YYYY-MM con mes real", () => {
    expect(esPeriodoValido("2026-09")).toBe(true);
    expect(esPeriodoValido("2026-00")).toBe(false);
    expect(esPeriodoValido("2026-13")).toBe(false);
    expect(esPeriodoValido("2026-9")).toBe(false);
    expect(esPeriodoValido(null)).toBe(false);
  });

  it("etiquetaPeriodo escribe el mes en castellano", () => {
    expect(etiquetaPeriodo("2026-09")).toBe("sep 2026");
    expect(etiquetaPeriodo("2026-01")).toBe("ene 2026");
    expect(etiquetaPeriodo("2026-12")).toBe("dic 2026");
    expect(etiquetaPeriodo(null)).toBe("—");
  });
});

describe("rangoDeFechas", () => {
  it("toma el minimo y el maximo", () => {
    expect(rangoDeFechas(["2026-09-10", "2026-09-01", "2026-09-30"])).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("recorta los timestamps de las guias a su dia", () => {
    expect(
      rangoDeFechas(["2026-09-10T12:00:00-03:00", "2026-09-02T12:00:00-03:00"]),
    ).toEqual({ desde: "2026-09-02", hasta: "2026-09-10" });
  });

  it("devuelve null si no hay fechas usables", () => {
    expect(rangoDeFechas([])).toBeNull();
    expect(rangoDeFechas(["cualquier cosa"])).toBeNull();
  });
});

describe("saldoFactura", () => {
  it("resta lo abonado", () => {
    expect(saldoFactura({ total: 119_000, monto_pagado: 50_000 })).toBe(69_000);
  });

  it("sin abonos el saldo es el total", () => {
    expect(saldoFactura({ total: 119_000, monto_pagado: 0 })).toBe(119_000);
  });

  it("no devuelve negativo si pagaron de mas", () => {
    // Pasa con transferencias redondeadas. El excedente no es credito: es
    // otro problema y no se modela.
    expect(saldoFactura({ total: 119_000, monto_pagado: 120_000 })).toBe(0);
  });
});

describe("estadoMostradoFactura con abonos", () => {
  it("un pago parcial a tiempo se muestra como parcial", () => {
    const f = factura({ monto_pagado: 50_000, fecha_vence: "2026-12-01" });
    expect(estadoMostradoFactura(f, HOY)).toBe("parcial");
  });

  it("el vencimiento manda sobre el parcial", () => {
    // Una factura abonada a medias que ya vencio sigue siendo cobranza:
    // decir "parcial" esconderia el problema.
    const f = factura({ monto_pagado: 50_000, fecha_vence: "2026-09-01" });
    expect(estadoMostradoFactura(f, HOY)).toBe("vencida");
  });

  it("sin abonos y sin vencer sigue siendo pendiente", () => {
    const f = factura({ monto_pagado: 0, fecha_vence: "2026-12-01" });
    expect(estadoMostradoFactura(f, HOY)).toBe("pendiente");
  });
});

describe("resumirFacturas con pagos parciales", () => {
  it("lo pendiente es el saldo, no el total", () => {
    const r = resumirFacturas(
      [factura({ total: 119_000, monto_pagado: 80_000 })],
      HOY,
    );
    expect(r.pendiente).toEqual({ cantidad: 1, total: 39_000 });
  });

  it("lo abonado cuenta como cobrado aunque la factura siga abierta", () => {
    // Si solo contara al saldarse, un mes de muchos pagos parciales
    // apareceria como si no hubiera entrado nada.
    const r = resumirFacturas(
      [factura({ total: 119_000, monto_pagado: 80_000 })],
      HOY,
    );
    expect(r.liquidado).toEqual({ cantidad: 1, total: 80_000 });
  });

  it("lo vencido tambien es el saldo", () => {
    const r = resumirFacturas(
      [
        factura({
          total: 119_000,
          monto_pagado: 100_000,
          fecha_vence: "2026-08-01",
        }),
      ],
      HOY,
    );
    expect(r.vencido).toEqual({ cantidad: 1, total: 19_000 });
  });

  it("una pagada no suma a pendiente y suma entera a cobrado", () => {
    const r = resumirFacturas(
      [
        factura({
          estado: "pagada",
          total: 119_000,
          monto_pagado: 119_000,
          fecha_pago: HOY,
        }),
      ],
      HOY,
    );
    expect(r.pendiente.total).toBe(0);
    expect(r.liquidado.total).toBe(119_000);
  });

  it("un sobrepago no infla lo cobrado ni deja saldo negativo", () => {
    const r = resumirFacturas(
      [
        factura({
          estado: "pagada",
          total: 119_000,
          monto_pagado: 125_000,
          fecha_pago: HOY,
        }),
      ],
      HOY,
    );
    expect(r.liquidado.total).toBe(119_000);
    expect(r.pendiente.total).toBe(0);
  });

  it("una anulada con abonos sigue sin sumar a nada", () => {
    const r = resumirFacturas(
      [factura({ estado: "anulada", total: 119_000, monto_pagado: 60_000 })],
      HOY,
    );
    expect(r.pendiente.total).toBe(0);
    expect(r.liquidado.total).toBe(0);
  });
});

describe("resumirFacturas sin la migracion de abonos aplicada", () => {
  it("una pagada cuenta entera aunque monto_pagado llegue indefinido", () => {
    // Escenario real: codigo desplegado antes de aplicar 0011. La columna no
    // existe y sin esta guarda la factura aparecia como deuda entera.
    const f = {
      ...factura({ estado: "pagada", total: 119_000, fecha_pago: HOY }),
      monto_pagado: undefined as unknown as number,
    };
    const r = resumirFacturas([f], HOY);
    expect(r.liquidado).toEqual({ cantidad: 1, total: 119_000 });
    expect(r.pendiente.total).toBe(0);
  });

  it("una pendiente sin la columna se cuenta por su total", () => {
    const f = {
      ...factura({ total: 119_000 }),
      monto_pagado: undefined as unknown as number,
    };
    expect(resumirFacturas([f], HOY).pendiente.total).toBe(119_000);
  });
});
