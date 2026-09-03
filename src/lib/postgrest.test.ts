import { describe, it, expect } from "vitest";
import {
  filtroContiene,
  filtroContienePorCampo,
  patronContiene,
} from "./postgrest";

describe("patronContiene", () => {
  it("entrecomilla y agrega comodines", () => {
    expect(patronContiene("perez")).toBe('"%perez%"');
  });

  it("una coma queda dentro de las comillas y no corta la lista", () => {
    expect(patronContiene("Perez, Juan")).toBe('"%Perez, Juan%"');
  });

  it("los parentesis no cierran el or()", () => {
    expect(patronContiene("Lavaseco (centro)")).toBe('"%Lavaseco (centro)%"');
  });

  it("escapa las comillas dobles", () => {
    // Entrada: el "gordo"   ->   salida citada con las comillas escapadas.
    expect(patronContiene('el "gordo"')).toBe('"%el \\"gordo\\"%"');
  });

  it("escapa la barra invertida dos veces", () => {
    // Una para LIKE (donde \ es el caracter de escape) y otra para el string
    // entrecomillado de PostgREST: una sola barra tipeada viaja como cuatro.
    expect(patronContiene("a\\b")).toBe('"%a\\\\\\\\b%"');
  });

  it("neutraliza los comodines de LIKE", () => {
    // Sin escapar, un "%" tipeado haria que la busqueda devuelva todo.
    expect(patronContiene("100%")).toBe('"%100\\\\%%"');
    expect(patronContiene("a_b")).toBe('"%a\\\\_b%"');
  });

  it("deja pasar acentos y enie", () => {
    expect(patronContiene("Muñoz Peña")).toBe('"%Muñoz Peña%"');
  });
});

describe("filtroContiene", () => {
  it("repite el termino en cada campo", () => {
    expect(filtroContiene(["nombre", "rut"], "perez")).toBe(
      'nombre.ilike."%perez%",rut.ilike."%perez%"',
    );
  });

  it("un termino con coma produce exactamente un filtro por campo", () => {
    const out = filtroContiene(["nombre", "rut"], "Perez, Juan");
    // Dos filtros, no cuatro: las comas del termino van dentro de comillas.
    expect(out.match(/\.ilike\./g)).toHaveLength(2);
  });
});

describe("filtroContienePorCampo", () => {
  it("permite un termino distinto por campo", () => {
    expect(
      filtroContienePorCampo([
        ["rut", "12345678-9"],
        ["nombre", "12.345.678-9"],
      ]),
    ).toBe('rut.ilike."%12345678-9%",nombre.ilike."%12.345.678-9%"');
  });
});
