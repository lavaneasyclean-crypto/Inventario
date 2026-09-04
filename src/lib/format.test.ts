import { describe, it, expect } from "vitest";
import { formatCLP, formatDate, formatDateShort, diasDesde } from "./format";

describe("formatCLP", () => {
  it("formatea numeros como CLP", () => {
    expect(formatCLP(1500)).toMatch(/\$/);
    expect(formatCLP(1500)).toContain("1.500");
    expect(formatCLP(186600)).toContain("186.600");
  });

  it("acepta strings numericos", () => {
    expect(formatCLP("1500")).toContain("1.500");
    expect(formatCLP("0")).toContain("0");
  });

  it("devuelve dash para null/undefined", () => {
    expect(formatCLP(null)).toBe("—");
    expect(formatCLP(undefined)).toBe("—");
  });

  it("devuelve dash para NaN o strings no numericos", () => {
    expect(formatCLP("abc")).toBe("—");
  });

  it("maneja negativos (descuentos)", () => {
    const out = formatCLP(-3500);
    expect(out).toContain("3.500");
    expect(out).toMatch(/-/);
  });

  it("no muestra decimales (CLP es entero)", () => {
    expect(formatCLP(1500.99)).not.toContain(",");
  });
});

describe("formatDate", () => {
  it("formatea ISO strings con dia y hora", () => {
    const out = formatDate("2026-02-21T11:13:00-03:00");
    expect(out).toMatch(/feb/i);
    expect(out).toMatch(/21/);
  });

  it("acepta Date", () => {
    const out = formatDate(new Date("2026-04-15T15:00:00Z"));
    expect(out).toMatch(/abr/i);
  });

  it("un pedido de la noche conserva el dia chileno, no el UTC", () => {
    // 22:30 del 3-sep en Chile ya es 4-sep en UTC. El servidor corre en UTC,
    // asi que sin anclar la zona esto mostraria "04-sept".
    const out = formatDate("2026-09-04T02:30:00Z");
    expect(out).toMatch(/03/);
    expect(out).toMatch(/sept/i);
    expect(out).not.toMatch(/04/);
  });

  it("respeta el horario de verano chileno", () => {
    // 15-ene: Chile esta en UTC-3, asi que 15:00Z son las 12:00 locales.
    expect(formatDate("2026-01-15T15:00:00Z")).toMatch(/12:00/);
    // 15-jun: Chile esta en UTC-4, asi que 15:00Z son las 11:00 locales.
    expect(formatDate("2026-06-15T15:00:00Z")).toMatch(/11:00/);
  });

  it("devuelve dash para null/undefined/invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("nada")).toBe("—");
  });
});

describe("formatDateShort", () => {
  it("solo dia y mes", () => {
    const out = formatDateShort("2026-04-15T12:00:00-03:00");
    expect(out).toMatch(/abr/i);
    expect(out).toMatch(/15/);
    expect(out).not.toMatch(/:/); // sin hora
  });

  it("vacios", () => {
    expect(formatDateShort(null)).toBe("—");
  });
});

describe("diasDesde", () => {
  it("calcula diferencia en dias", () => {
    const hace3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(diasDesde(hace3)).toBe(3);
  });

  it("cuenta dias calendario, no bloques de 24 horas", () => {
    // Ayer a las 20:00 en Chile lleva 1 dia, aunque no hayan pasado 24 horas.
    const ayer20 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(diasDesde(ayer20)).toBe(1);
  });

  it("hoy es 0", () => {
    expect(diasDesde(new Date())).toBe(0);
  });

  it("devuelve 0 para vacios", () => {
    expect(diasDesde(null)).toBe(0);
    expect(diasDesde(undefined)).toBe(0);
    expect(diasDesde("nada")).toBe(0);
  });
});
