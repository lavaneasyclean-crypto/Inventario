import { describe, it, expect } from "vitest";
import {
  describirMedida,
  importeLinea,
  medidaCobrada,
  medidasQueRequiere,
  redondearMedida,
} from "./medidas";

describe("redondearMedida", () => {
  it("sube al medio metro mas cercano hacia arriba", () => {
    expect(redondearMedida(2.94)).toBe(3);
    expect(redondearMedida(2.1)).toBe(2.5);
    expect(redondearMedida(0.2)).toBe(0.5);
  });

  it("deja quietos los valores que ya caen justo", () => {
    expect(redondearMedida(2.5)).toBe(2.5);
    expect(redondearMedida(3)).toBe(3);
  });
});

describe("medidaCobrada", () => {
  it("por unidad siempre es 1", () => {
    expect(medidaCobrada("unidad", null, null)).toBe(1);
    // Aunque vengan medidas cargadas, no participan del calculo.
    expect(medidaCobrada("unidad", 2, 3)).toBe(1);
  });

  it("por m2 multiplica ancho por largo y redondea", () => {
    expect(medidaCobrada("m2", 1.4, 2.1)).toBe(3); // 2,94
    expect(medidaCobrada("m2", 2, 3)).toBe(6);
    expect(medidaCobrada("m2", 1, 1.2)).toBe(1.5); // 1,2
  });

  it("por metro lineal solo mira el largo", () => {
    expect(medidaCobrada("metro_lineal", null, 2.3)).toBe(2.5);
    expect(medidaCobrada("metro_lineal", 99, 3)).toBe(3);
  });

  it("devuelve null si falta una medida", () => {
    expect(medidaCobrada("m2", null, 2)).toBeNull();
    expect(medidaCobrada("m2", 2, null)).toBeNull();
    expect(medidaCobrada("metro_lineal", 2, null)).toBeNull();
  });

  it("rechaza medidas que no son positivas", () => {
    expect(medidaCobrada("m2", 0, 2)).toBeNull();
    expect(medidaCobrada("m2", -1, 2)).toBeNull();
    expect(medidaCobrada("metro_lineal", null, NaN)).toBeNull();
  });
});

describe("importeLinea", () => {
  it("una alfombra de 1,4 x 2,1 a $8.000 el m2 sale 24.000", () => {
    // 2,94 m2 redondea a 3,0 -> 3 x 8.000
    expect(
      importeLinea({ unidad: "m2", precioUnidad: 8000, cantidad: 1, ancho: 1.4, largo: 2.1 }),
    ).toBe(24000);
  });

  it("una cortina de 2,3 m a $4.000 el metro sale 10.000", () => {
    // 2,3 m redondea a 2,5 -> 2,5 x 4.000
    expect(
      importeLinea({ unidad: "metro_lineal", precioUnidad: 4000, cantidad: 1, largo: 2.3 }),
    ).toBe(10000);
  });

  it("multiplica por la cantidad de piezas iguales", () => {
    expect(
      importeLinea({ unidad: "m2", precioUnidad: 8000, cantidad: 2, ancho: 2, largo: 3 }),
    ).toBe(96000); // 6 m2 x 2 piezas x 8.000
  });

  it("lo que va por unidad se calcula como siempre", () => {
    expect(importeLinea({ unidad: "unidad", precioUnidad: 2500, cantidad: 3 })).toBe(7500);
  });

  it("acepta descuentos (precio negativo)", () => {
    expect(importeLinea({ unidad: "unidad", precioUnidad: -1000, cantidad: 1 })).toBe(-1000);
  });

  it("redondea el importe a peso", () => {
    // 0,5 m2 x 3.333 = 1.666,5
    expect(
      importeLinea({ unidad: "m2", precioUnidad: 3333, cantidad: 1, ancho: 0.5, largo: 0.5 }),
    ).toBe(1667);
  });

  it("devuelve null mientras falten medidas", () => {
    expect(
      importeLinea({ unidad: "m2", precioUnidad: 8000, cantidad: 1, ancho: 1.4 }),
    ).toBeNull();
  });
});

describe("medidasQueRequiere", () => {
  it("por unidad no pide nada", () => {
    expect(medidasQueRequiere("unidad")).toEqual({ ancho: false, largo: false });
  });

  it("por m2 pide las dos", () => {
    expect(medidasQueRequiere("m2")).toEqual({ ancho: true, largo: true });
  });

  it("por metro lineal solo el largo", () => {
    expect(medidasQueRequiere("metro_lineal")).toEqual({ ancho: false, largo: true });
  });
});

describe("describirMedida", () => {
  it("muestra la medida cruda y la cobrada", () => {
    expect(describirMedida("m2", 1.4, 2.1)).toBe("1,4 × 2,1 m → 3 m²");
    expect(describirMedida("metro_lineal", null, 2.3)).toBe("2,3 m → 2,5 m");
  });

  it("no dice nada para lo que va por unidad", () => {
    expect(describirMedida("unidad", null, null)).toBeNull();
  });

  it("no dice nada si faltan medidas", () => {
    expect(describirMedida("m2", 1.4, null)).toBeNull();
  });
});
