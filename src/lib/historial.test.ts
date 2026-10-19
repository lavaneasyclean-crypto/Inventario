import { describe, it, expect } from "vitest";
import {
  cambiosLegibles,
  etiquetaCampo,
  etiquetaEntidad,
  formatearValor,
  quienLoHizo,
  resumenCambio,
  rutaEntidad,
  type RegistroAuditoria,
} from "./historial";

function registro(p: Partial<RegistroAuditoria> = {}): RegistroAuditoria {
  return {
    id: 1,
    ts: "2026-10-19T18:00:00+00:00",
    user_email: "ddeocaresp@gmail.com",
    entidad: "pedidos",
    entidad_id: "13543",
    accion: "edicion",
    antes: null,
    despues: null,
    ...p,
  };
}

describe("cambiosLegibles", () => {
  it("muestra el antes y el despues de cada campo que cambio", () => {
    const c = cambiosLegibles(
      registro({
        antes: { estado: "recibido", total_venta: 12000 },
        despues: { estado: "entregado", total_venta: 14500 },
      }),
    );
    expect(c).toEqual([
      { campo: "estado", antes: "recibido", despues: "entregado" },
      { campo: "total", antes: "$12.000", despues: "$14.500" },
    ]);
  });

  it("en un alta no inventa un 'antes'", () => {
    const c = cambiosLegibles(
      registro({
        accion: "alta",
        despues: { nombre: "Mantel Ovalado", precio: 4500, notas: null },
      }),
    );
    // `notas` viene en null: una prenda nueva sin notas no merece una linea
    // que diga "notas: —".
    expect(c).toEqual([
      { campo: "nombre", antes: "—", despues: "Mantel Ovalado" },
      { campo: "precio", antes: "—", despues: "$4.500" },
    ]);
  });

  it("esconde los campos de relleno", () => {
    const c = cambiosLegibles(
      registro({
        antes: { estado: "a", created_at: "x", updated_at: "y", id: 1 },
        despues: { estado: "b", created_at: "x", updated_at: "z", id: 1 },
      }),
    );
    expect(c).toHaveLength(1);
    expect(c[0].campo).toBe("estado");
  });

  it("no lista lo que no cambio aunque venga en el registro", () => {
    const c = cambiosLegibles(
      registro({
        antes: { estado: "a", notas: "igual" },
        despues: { estado: "b", notas: "igual" },
      }),
    );
    expect(c.map((x) => x.campo)).toEqual(["estado"]);
  });
});

describe("formatearValor", () => {
  it("los booleanos se leen", () => {
    expect(formatearValor("pagado", true)).toBe("sí");
    expect(formatearValor("pagado", false)).toBe("no");
  });

  it("la plata se ve como plata, venga como numero o como texto", () => {
    expect(formatearValor("precio", 4500)).toBe("$4.500");
    expect(formatearValor("total_venta", "14500")).toBe("$14.500");
  });

  it("las fechas van en dia, no en hora", () => {
    // El `ts` del registro ya dice cuando se hizo el cambio; del campo
    // interesa a que dia quedo apuntando.
    expect(formatearValor("fecha_entrega", "2026-10-19T15:00:00+00:00")).toBe(
      "19-10-2026",
    );
  });

  it("vacio y nulo se ven igual y no asustan", () => {
    expect(formatearValor("notas", null)).toBe("—");
    expect(formatearValor("notas", "")).toBe("—");
  });

  it("un numero suelto no se disfraza de plata", () => {
    expect(formatearValor("cantidad", 3)).toBe("3");
  });
});

describe("etiquetas y rutas", () => {
  it("las tablas tienen nombre de persona", () => {
    expect(etiquetaEntidad("pedidos_empresa")).toBe("Guía");
    expect(etiquetaEntidad("tabla_que_no_existe")).toBe("tabla_que_no_existe");
  });

  it("las columnas tambien", () => {
    expect(etiquetaCampo("total_venta")).toBe("total");
    expect(etiquetaCampo("un_campo_nuevo")).toBe("un campo nuevo");
  });

  it("lleva a la pantalla de la cosa que cambio", () => {
    expect(rutaEntidad("pedidos", "13543")).toBe("/pedidos/13543");
    expect(rutaEntidad("pedidos_empresa", "1670")).toBe(
      "/empresas/pedidos/1670",
    );
  });

  it("una clave compuesta no apunta a ningun lado", () => {
    // No hay pantalla para "el precio de la polera en Termomin".
    expect(rutaEntidad("empresa_productos", "86667200-8|036")).toBeNull();
  });
});

describe("resumenCambio", () => {
  it("un solo campo se cuenta entero", () => {
    expect(
      resumenCambio(
        registro({ antes: { estado: "recibido" }, despues: { estado: "listo" } }),
      ),
    ).toBe("estado: recibido → listo");
  });

  it("varios campos se nombran nomas", () => {
    expect(
      resumenCambio(
        registro({
          antes: { estado: "a", notas: "x" },
          despues: { estado: "b", notas: "y" },
        }),
      ),
    ).toBe("estado, notas");
  });

  it("alta y baja se dicen en una palabra", () => {
    expect(resumenCambio(registro({ accion: "alta", despues: { nombre: "x" } })))
      .toBe("se creó");
    expect(resumenCambio(registro({ accion: "baja", antes: { nombre: "x" } })))
      .toBe("se eliminó");
  });
});

describe("quienLoHizo", () => {
  it("sin email fue un script, y se dice", () => {
    // Los scripts del ETL usan la service role, que no tiene usuario. Decir
    // "sistema" seria mentir un poco: fue alguien corriendo un script.
    expect(quienLoHizo(null)).toBe("script / ETL");
    expect(quienLoHizo("a@b.cl")).toBe("a@b.cl");
  });
});
