import { describe, it, expect } from "vitest";
import {
  esFechaValida,
  fechaEnChile,
  finDeDiaChile,
  inicioDeDiaChile,
  mediodiaChile,
  offsetChile,
  rangoDelMes,
  sumarDias,
} from "./fecha";

// Chile 2026: UTC-4 en invierno, UTC-3 en verano. El horario de verano
// arranca el 6 de septiembre de 2026.

describe("offsetChile", () => {
  it("invierno es UTC-4", () => {
    expect(offsetChile(new Date("2026-06-15T15:00:00Z"))).toBe(-240);
  });

  it("verano es UTC-3", () => {
    expect(offsetChile(new Date("2026-01-15T15:00:00Z"))).toBe(-180);
  });
});

describe("inicioDeDiaChile", () => {
  it("medianoche de invierno es 04:00 UTC", () => {
    expect(inicioDeDiaChile("2026-06-15")).toBe("2026-06-15T04:00:00.000Z");
  });

  it("medianoche de verano es 03:00 UTC", () => {
    expect(inicioDeDiaChile("2026-01-15")).toBe("2026-01-15T03:00:00.000Z");
  });

  it("en el dia sin medianoche devuelve el primer instante que existe", () => {
    // El 6-sep-2026 los relojes saltan de las 24:00 del 5 a la 01:00, asi que
    // las 00:00 de ese dia no existen: el limite del rango es la 01:00 local.
    expect(inicioDeDiaChile("2026-09-06")).toBe("2026-09-06T04:00:00.000Z");
  });

  it("rechaza fechas inexistentes", () => {
    expect(() => inicioDeDiaChile("2026-02-30")).toThrow(RangeError);
  });
});

describe("finDeDiaChile", () => {
  it("es el inicio del dia siguiente", () => {
    expect(finDeDiaChile("2026-06-15")).toBe("2026-06-16T04:00:00.000Z");
  });

  it("cruza fin de mes", () => {
    expect(finDeDiaChile("2026-06-30")).toBe("2026-07-01T04:00:00.000Z");
  });
});

describe("mediodiaChile", () => {
  it("invierno", () => {
    expect(mediodiaChile("2026-06-15")).toBe("2026-06-15T16:00:00.000Z");
  });

  it("verano", () => {
    expect(mediodiaChile("2026-01-15")).toBe("2026-01-15T15:00:00.000Z");
  });
});

describe("fechaEnChile", () => {
  it("de noche el dia sigue siendo el de Chile, no el UTC", () => {
    // 22:30 del 3-sep en Chile ya es 4-sep en UTC.
    expect(fechaEnChile(new Date("2026-09-04T02:30:00Z"))).toBe("2026-09-03");
  });

  it("de manana coincide", () => {
    expect(fechaEnChile(new Date("2026-09-03T15:00:00Z"))).toBe("2026-09-03");
  });
});

describe("esFechaValida", () => {
  it("acepta un dia real", () => {
    expect(esFechaValida("2026-02-28")).toBe(true);
  });

  it("rechaza dias que no existen", () => {
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
  });

  it("rechaza basura y vacios", () => {
    expect(esFechaValida("ayer")).toBe(false);
    expect(esFechaValida("2026-6-1")).toBe(false);
    expect(esFechaValida(null)).toBe(false);
    expect(esFechaValida(undefined)).toBe(false);
  });
});

describe("sumarDias", () => {
  it("cruza mes y anio", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("rangoDelMes", () => {
  it("mes de 30 dias", () => {
    expect(rangoDelMes("2026-09-15")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("febrero", () => {
    expect(rangoDelMes("2026-02-10")).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
  });
});
