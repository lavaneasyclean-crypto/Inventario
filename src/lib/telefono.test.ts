import { describe, it, expect } from "vitest";
import {
  formatearChileno,
  partirTelefono,
  telefonoChileno,
  telefonoChilenoCompleto,
  telefonoExtranjero,
  telefonoExtranjeroCompleto,
} from "./telefono";

describe("formatearChileno", () => {
  it("agrupa como 9 1234 5678", () => {
    expect(formatearChileno("912345678")).toBe("9 1234 5678");
  });

  it("formatea mientras se escribe, sin esperar a que este completo", () => {
    expect(formatearChileno("9")).toBe("9");
    expect(formatearChileno("912")).toBe("9 12");
    expect(formatearChileno("91234")).toBe("9 1234");
    expect(formatearChileno("912345")).toBe("9 1234 5");
  });

  it("ignora lo que no sea digito, asi se puede pegar un numero con formato", () => {
    expect(formatearChileno("+56 9 1234 5678")).toBe("5 6912 3456");
    expect(formatearChileno("9-1234-5678")).toBe("9 1234 5678");
  });

  it("corta en nueve digitos", () => {
    expect(formatearChileno("9123456789999")).toBe("9 1234 5678");
  });
});

describe("telefonoChileno", () => {
  it("arma el formato que ya usan los 400 telefonos cargados", () => {
    expect(telefonoChileno("912345678")).toBe("+56 9 1234 5678");
    // Los fijos tambien: +56 2 2321 5637
    expect(telefonoChileno("223215637")).toBe("+56 2 2321 5637");
  });

  it("sabe cuando esta completo", () => {
    expect(telefonoChilenoCompleto("9 1234 567")).toBe(false);
    expect(telefonoChilenoCompleto("9 1234 5678")).toBe(true);
  });
});

describe("telefonoExtranjero", () => {
  it("le pone el + si falta y no toca el resto", () => {
    expect(telefonoExtranjero("54 11 4567 8900")).toBe("+54 11 4567 8900");
    expect(telefonoExtranjero("+1 305 555 0123")).toBe("+1 305 555 0123");
  });

  it("normaliza el espaciado de mas", () => {
    expect(telefonoExtranjero("  +44   20  7946 0958 ")).toBe(
      "+44 20 7946 0958",
    );
  });

  it("vacio sigue vacio, no queda un + solo", () => {
    expect(telefonoExtranjero("   ")).toBe("");
  });

  it("pide un minimo razonable de digitos", () => {
    expect(telefonoExtranjeroCompleto("+1 23")).toBe(false);
    expect(telefonoExtranjeroCompleto("+54 11 4567 8900")).toBe(true);
  });
});

describe("partirTelefono", () => {
  it("reconoce un chileno guardado y devuelve solo el numero", () => {
    expect(partirTelefono("+56 9 2032 8180")).toEqual({
      esChileno: true,
      numero: "9 2032 8180",
    });
  });

  it("un numero de otro pais queda entero y marcado como extranjero", () => {
    expect(partirTelefono("+54 11 4567 8900")).toEqual({
      esChileno: false,
      numero: "+54 11 4567 8900",
    });
  });

  it("vacio arranca en Chile, que es el caso normal del mostrador", () => {
    expect(partirTelefono(null)).toEqual({ esChileno: true, numero: "" });
    expect(partirTelefono("")).toEqual({ esChileno: true, numero: "" });
  });

  it("un +56 con cantidad rara de digitos no se fuerza a chileno", () => {
    // Si se tratara como chileno, el campo mostraria algo que no es lo que
    // esta guardado y al guardar de nuevo lo corromperia.
    expect(partirTelefono("+56 12345").esChileno).toBe(false);
  });
});
