import { describe, it, expect } from "vitest";
import {
  agruparPorBolsa,
  claveCelda,
  itemsDesdeGrilla,
  normalizarCodigoBolsa,
  ordenarBolsas,
  totalesPorProducto,
} from "./bolsas";
import type { EmpresaBolsa, PedidoEmpresaItem } from "./types";

function bolsa(codigo: string, nombre: string | null = null): EmpresaBolsa {
  return { id: 1, rut_empresa: "86667200-8", codigo, nombre, activo: true };
}

function item(partial: Partial<PedidoEmpresaItem> = {}): PedidoEmpresaItem {
  return {
    id: 1,
    pedido_empresa_id: 1,
    producto_empresa_id: "P01",
    producto_empresa_nombre: "Polera",
    precio_unidad: 1200,
    importe: 1200,
    cantidad: 1,
    detalle_prenda: null,
    bolsa_id: 1,
    bolsa_codigo: "1",
    created_at: "",
    ...partial,
  };
}

describe("ordenarBolsas", () => {
  it("ordena los numeros como numeros, no como texto", () => {
    // El bug clasico: como texto, "10" va antes que "2".
    const r = ordenarBolsas([bolsa("10"), bolsa("2"), bolsa("1")]);
    expect(r.map((b) => b.codigo)).toEqual(["1", "2", "10"]);
  });

  it("manda los nombres despues de todos los numeros", () => {
    const r = ordenarBolsas([
      bolsa("Nicolás"),
      bolsa("3"),
      bolsa("DV"),
      bolsa("21"),
    ]);
    expect(r.map((b) => b.codigo)).toEqual(["3", "21", "DV", "Nicolás"]);
  });

  it("ordena los nombres alfabeticamente en es", () => {
    const r = ordenarBolsas([bolsa("Maxis"), bolsa("DV"), bolsa("Nicolás")]);
    expect(r.map((b) => b.codigo)).toEqual(["DV", "Maxis", "Nicolás"]);
  });

  it("reproduce el orden de la planilla de Termomin", () => {
    const r = ordenarBolsas(
      ["Nicolás", "31", "21", "DV", "32", "Maxis", "25"].map((c) => bolsa(c)),
    );
    expect(r.map((b) => b.codigo)).toEqual([
      "21", "25", "31", "32", "DV", "Maxis", "Nicolás",
    ]);
  });

  it("no toca el arreglo original", () => {
    const original = [bolsa("10"), bolsa("2")];
    ordenarBolsas(original);
    expect(original.map((b) => b.codigo)).toEqual(["10", "2"]);
  });
});

describe("normalizarCodigoBolsa", () => {
  it("saca los ceros a la izquierda de los numeros", () => {
    // "07" y "7" son la misma bolsa; sin esto el padron se llena de duplicados
    // que en pantalla se ven iguales.
    expect(normalizarCodigoBolsa("07")).toBe("7");
    expect(normalizarCodigoBolsa("007")).toBe("7");
  });

  it("recorta los espacios", () => {
    expect(normalizarCodigoBolsa("  7  ")).toBe("7");
    expect(normalizarCodigoBolsa(" Nicolás ")).toBe("Nicolás");
  });

  it("colapsa espacios internos", () => {
    expect(normalizarCodigoBolsa("Juan   Perez")).toBe("Juan Perez");
  });

  it("no toca los nombres que parecen numeros pero no lo son", () => {
    expect(normalizarCodigoBolsa("7A")).toBe("7A");
    expect(normalizarCodigoBolsa("DV")).toBe("DV");
  });
});

describe("agruparPorBolsa", () => {
  it("arma el contenido de cada bolsa", () => {
    const { bolsas } = agruparPorBolsa([
      item({ bolsa_codigo: "3", producto_empresa_nombre: "Polera", cantidad: 6 }),
      item({ bolsa_codigo: "3", producto_empresa_id: "P02", producto_empresa_nombre: "Pantalón", cantidad: 1 }),
      item({ bolsa_codigo: "4", producto_empresa_nombre: "Polera", cantidad: 1 }),
    ]);

    expect(bolsas).toHaveLength(2);
    expect(bolsas[0].codigo).toBe("3");
    expect(bolsas[0].totalPrendas).toBe(7);
    expect(bolsas[0].lineas.map((l) => l.nombre)).toEqual([
      "Pantalón",
      "Polera",
    ]);
    expect(bolsas[1].codigo).toBe("4");
  });

  it("suma el mismo producto repetido en una bolsa", () => {
    // Dos filas iguales en la hoja impresa se leen como un error.
    const { bolsas } = agruparPorBolsa([
      item({ bolsa_codigo: "3", cantidad: 2 }),
      item({ bolsa_codigo: "3", cantidad: 4 }),
    ]);
    expect(bolsas[0].lineas).toHaveLength(1);
    expect(bolsas[0].lineas[0].cantidad).toBe(6);
    expect(bolsas[0].totalPrendas).toBe(6);
  });

  it("ordena las bolsas como la grilla", () => {
    const { bolsas } = agruparPorBolsa([
      item({ bolsa_codigo: "Nicolás" }),
      item({ bolsa_codigo: "10" }),
      item({ bolsa_codigo: "2" }),
    ]);
    expect(bolsas.map((b) => b.codigo)).toEqual(["2", "10", "Nicolás"]);
  });

  it("trae el nombre del trabajador desde el padron", () => {
    const { bolsas } = agruparPorBolsa(
      [item({ bolsa_codigo: "3" })],
      [bolsa("3", "Pedro")],
    );
    expect(bolsas[0].nombre).toBe("Pedro");
  });

  it("separa lo que vino sin bolsa en vez de perderlo", () => {
    const { bolsas, sinBolsa } = agruparPorBolsa([
      item({ bolsa_codigo: "3", cantidad: 2 }),
      item({ bolsa_codigo: null, bolsa_id: null, cantidad: 5 }),
    ]);
    expect(bolsas).toHaveLength(1);
    expect(sinBolsa).toHaveLength(1);
    expect(sinBolsa[0].cantidad).toBe(5);
  });

  it("sin items devuelve todo vacio", () => {
    const r = agruparPorBolsa([]);
    expect(r.bolsas).toHaveLength(0);
    expect(r.sinBolsa).toHaveLength(0);
  });
});

describe("itemsDesdeGrilla", () => {
  it("convierte las celdas con cantidad en items", () => {
    const items = itemsDesdeGrilla({
      [claveCelda(1, "P01")]: "6",
      [claveCelda(1, "P02")]: "1",
    });
    expect(items).toHaveLength(2);
    expect(items).toContainEqual({
      bolsa_id: 1,
      producto_empresa_id: "P01",
      cantidad: 6,
    });
  });

  it("ignora las celdas vacias y en cero", () => {
    const items = itemsDesdeGrilla({
      [claveCelda(1, "P01")]: "",
      [claveCelda(1, "P02")]: "0",
      [claveCelda(2, "P01")]: "3",
    });
    expect(items).toHaveLength(1);
    expect(items[0].bolsa_id).toBe(2);
  });

  it("no se confunde con ids de producto que traen el separador", () => {
    // El id va despues del primer "|", asi que uno con pipe adentro sobrevive.
    const items = itemsDesdeGrilla({ "7|P|01": "2" });
    expect(items[0]).toEqual({
      bolsa_id: 7,
      producto_empresa_id: "P|01",
      cantidad: 2,
    });
  });

  it("descarta basura en vez de generar items invalidos", () => {
    const items = itemsDesdeGrilla({
      "sinpipe": "3",
      "|P01": "3",
      [claveCelda(1, "P01")]: "abc",
    });
    expect(items).toHaveLength(0);
  });

  it("trunca decimales: media polera no existe", () => {
    const items = itemsDesdeGrilla({ [claveCelda(1, "P01")]: "2.9" });
    expect(items[0].cantidad).toBe(2);
  });
});

describe("totalesPorProducto", () => {
  it("suma la columna de cada prenda", () => {
    // Es lo que cierra contra el pie de la planilla.
    const totales = totalesPorProducto({
      [claveCelda(1, "P01")]: "6",
      [claveCelda(2, "P01")]: "5",
      [claveCelda(1, "P02")]: "1",
    });
    expect(totales.get("P01")).toBe(11);
    expect(totales.get("P02")).toBe(1);
  });

  it("sin celdas no hay totales", () => {
    expect(totalesPorProducto({}).size).toBe(0);
  });
});
