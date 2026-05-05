import { describe, it, expect } from "vitest";
import {
  nextProductoId,
  nextProductoEmpresaId,
  PREFIX_BY_TIPO,
} from "./producto-id";

describe("PREFIX_BY_TIPO", () => {
  it("mapea cada tipo al prefijo historico del Access", () => {
    expect(PREFIX_BY_TIPO.lavado).toBe("SC");
    expect(PREFIX_BY_TIPO.secado).toBe("SC");
    expect(PREFIX_BY_TIPO.seco).toBe("LES");
    expect(PREFIX_BY_TIPO.planchado).toBe("PL");
    expect(PREFIX_BY_TIPO.manchas).toBe("AA");
    expect(PREFIX_BY_TIPO.aplicaciones).toBe("AA");
    expect(PREFIX_BY_TIPO.ganchos).toBe("AA");
    expect(PREFIX_BY_TIPO.delivery).toBe("AA");
    expect(PREFIX_BY_TIPO.pedido_especial).toBe("AA");
    expect(PREFIX_BY_TIPO.descuento).toBe("AA");
  });
});

describe("nextProductoId", () => {
  it("arranca en 001 si no hay productos del prefijo", () => {
    expect(nextProductoId("lavado", [])).toBe("SC001");
    expect(nextProductoId("planchado", [])).toBe("PL001");
    expect(nextProductoId("manchas", [])).toBe("AA001");
  });

  it("usa el max + 1 con padding a 3 digitos", () => {
    expect(nextProductoId("lavado", ["SC001", "SC005", "SC003"])).toBe("SC006");
    expect(nextProductoId("planchado", ["PL019"])).toBe("PL020");
    expect(nextProductoId("manchas", ["AA005"])).toBe("AA006");
  });

  it("ignora productos de otros prefijos", () => {
    expect(
      nextProductoId("lavado", ["LES019", "PL005", "AA001", "SC027"]),
    ).toBe("SC028");
  });

  it("ignora IDs sin parte numerica valida", () => {
    expect(nextProductoId("lavado", ["SCabc", "SC005"])).toBe("SC006");
  });

  it("comparte prefijo SC entre lavado y secado", () => {
    expect(nextProductoId("secado", ["SC076", "SC080"])).toBe("SC081");
    expect(nextProductoId("lavado", ["SC076", "SC080"])).toBe("SC081");
  });

  it("hace fallback con timestamp si supera 999", () => {
    const ids = Array.from({ length: 999 }, (_, i) =>
      `SC${String(i + 1).padStart(3, "0")}`,
    );
    const next = nextProductoId("lavado", ids);
    expect(next.startsWith("SC")).toBe(true);
    expect(next.length).toBeGreaterThan(5); // con timestamp es mucho mas largo
  });
});

describe("nextProductoEmpresaId", () => {
  it("arranca en 001 si no hay nada", () => {
    expect(nextProductoEmpresaId([])).toBe("001");
  });

  it("incrementa con padding a 3 digitos", () => {
    expect(nextProductoEmpresaId(["001", "002", "065"])).toBe("066");
  });

  it("ignora IDs no numericos", () => {
    expect(nextProductoEmpresaId(["EMP123", "001", "abc", "010"])).toBe("011");
  });
});
