import { describe, it, expect } from "vitest";
import {
  compararProductos,
  moverProducto,
  ordenarProductos,
} from "./orden-productos";
import type { ProductoEmpresaAdquirido } from "./types";

function p(
  nombre: string,
  orden: number | null = null,
): ProductoEmpresaAdquirido {
  return { producto_empresa_id: nombre, nombre, precio: 1000, orden, en_grilla: true };
}

describe("ordenarProductos", () => {
  it("respeta el orden explicito", () => {
    // El de la planilla de Termomin, que alfabetico arrancaria por Cotona.
    const r = ordenarProductos([
      p("Cotona", 3),
      p("Polera", 0),
      p("Gorro", 6),
      p("Pantalón", 1),
    ]);
    expect(r.map((x) => x.nombre)).toEqual([
      "Polera",
      "Pantalón",
      "Cotona",
      "Gorro",
    ]);
  });

  it("sin orden explicito sigue siendo alfabetico", () => {
    const r = ordenarProductos([p("Polera"), p("Cotona"), p("Gorro")]);
    expect(r.map((x) => x.nombre)).toEqual(["Cotona", "Gorro", "Polera"]);
  });

  it("las prendas nuevas van al final, no al principio", () => {
    // Agregar una prenda a una empresa ya acomodada no debe correrle las
    // columnas que venia usando.
    const r = ordenarProductos([
      p("Nueva"),
      p("Polera", 0),
      p("Pantalón", 1),
    ]);
    expect(r.map((x) => x.nombre)).toEqual(["Polera", "Pantalón", "Nueva"]);
  });

  it("varias sin orden quedan alfabeticas entre si", () => {
    const r = ordenarProductos([
      p("Zapato"),
      p("Polera", 0),
      p("Abrigo"),
    ]);
    expect(r.map((x) => x.nombre)).toEqual(["Polera", "Abrigo", "Zapato"]);
  });

  it("el orden 0 cuenta como orden y no como ausencia", () => {
    // El bug clasico de usar `!orden` en vez de comparar con null.
    const r = ordenarProductos([p("Sin"), p("Primera", 0)]);
    expect(r[0].nombre).toBe("Primera");
  });

  it("empate de orden se desempata por nombre", () => {
    const r = ordenarProductos([p("Zapato", 2), p("Abrigo", 2)]);
    expect(r.map((x) => x.nombre)).toEqual(["Abrigo", "Zapato"]);
  });

  it("no toca el arreglo original", () => {
    const original = [p("Zapato"), p("Abrigo")];
    ordenarProductos(original);
    expect(original.map((x) => x.nombre)).toEqual(["Zapato", "Abrigo"]);
  });

  it("compararProductos sirve directo como comparador", () => {
    expect(compararProductos(p("A", 0), p("B", 1))).toBeLessThan(0);
    expect(compararProductos(p("A", 1), p("B", 0))).toBeGreaterThan(0);
  });
});

describe("moverProducto", () => {
  const lista = [p("Uno"), p("Dos"), p("Tres")];

  it("sube una posicion", () => {
    const r = moverProducto(lista, "Dos", -1);
    expect(r.map((x) => x.nombre)).toEqual(["Dos", "Uno", "Tres"]);
  });

  it("baja una posicion", () => {
    const r = moverProducto(lista, "Dos", 1);
    expect(r.map((x) => x.nombre)).toEqual(["Uno", "Tres", "Dos"]);
  });

  it("subir la primera no la saca de la lista", () => {
    const r = moverProducto(lista, "Uno", -1);
    expect(r.map((x) => x.nombre)).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("bajar la ultima no la saca de la lista", () => {
    const r = moverProducto(lista, "Tres", 1);
    expect(r.map((x) => x.nombre)).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("un id que no esta no cambia nada", () => {
    const r = moverProducto(lista, "Fantasma", 1);
    expect(r.map((x) => x.nombre)).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("no toca el arreglo original", () => {
    moverProducto(lista, "Dos", -1);
    expect(lista.map((x) => x.nombre)).toEqual(["Uno", "Dos", "Tres"]);
  });
});
