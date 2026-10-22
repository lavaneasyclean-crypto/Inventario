import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectorItems, type ItemDraft } from "./selector-items";
import type { Producto } from "@/lib/types";

function producto(p: Partial<Producto>): Producto {
  return {
    id: "XX001",
    nombre: "Camisa",
    tipo_servicio: "lavado",
    unidad_cobro: "unidad",
    precio: 4500,
    activo: true,
    created_at: "x",
    updated_at: "x",
    ...p,
  } as Producto;
}

/** El comodín real del catálogo: precio 0 porque no tiene precio de lista. */
const OTRO = producto({
  id: "AA001",
  nombre: "AA-Otro",
  tipo_servicio: "pedido_especial",
  precio: 0,
});
const DESCUENTO = producto({
  id: "SC080",
  nombre: "Descuento",
  tipo_servicio: "descuento",
  precio: 0,
});
const CAMISA = producto({});

/** Renderiza el selector controlado, devolviendo los items que quedaron. */
function montar(productos: Producto[]) {
  const estado: { items: ItemDraft[] } = { items: [] };
  const onChange = vi.fn((next: ItemDraft[]) => {
    estado.items = next;
    vista.rerender(
      <SelectorItems productos={productos} items={next} onChange={onChange} />,
    );
  });
  const vista = render(
    <SelectorItems productos={productos} items={[]} onChange={onChange} />,
  );
  return estado;
}

function agregar(nombre: string) {
  const buscador = document.querySelector("input.pl-9") as HTMLInputElement;
  fireEvent.focus(buscador);
  fireEvent.change(buscador, { target: { value: nombre } });
  // Dentro del desplegable y no en cualquier lado: "Descuento" es a la vez el
  // nombre del producto y la etiqueta de su tipo de servicio, asi que buscarlo
  // suelto encuentra dos cosas distintas.
  const lista = document.querySelectorAll("ul")[0];
  const opcion = [...lista.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(nombre),
  )!;
  fireEvent.click(opcion);
}

/** El bloque de la prenda ya cargada, para no confundirlo con el buscador. */
function lineaCargada(): HTMLElement {
  return document.querySelectorAll("ul")[0].querySelector("li") as HTMLElement;
}

describe("SelectorItems — el precio del comodín", () => {
  it("AA-Otro pide el precio al cargarlo", () => {
    const estado = montar([OTRO, CAMISA]);
    agregar("AA-Otro");

    expect(estado.items[0].precio_libre).toBe(true);
    expect(screen.getByLabelText(/precio/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no tiene precio de lista/i),
    ).toBeInTheDocument();
  });

  it("una prenda con precio de lista NO lo pide", () => {
    // "solo en ese item": el resto del catalogo sigue con su precio fijo.
    const estado = montar([OTRO, CAMISA]);
    agregar("Camisa");

    expect(estado.items[0].precio_libre).toBe(false);
    expect(screen.queryByLabelText(/precio/i)).toBeNull();
    expect(lineaCargada().textContent).toContain("$4.500");
  });

  it("lo que se escribe queda en el item", () => {
    const estado = montar([OTRO]);
    agregar("AA-Otro");
    fireEvent.change(screen.getByLabelText(/precio/i), {
      target: { value: "12000" },
    });

    expect(estado.items[0].precio_unidad).toBe(12000);
  });

  it("el descuento se puede escribir en negativo sin perder el signo", () => {
    // Es el motivo de guardar el texto y no solo el numero: al teclear "-"
    // solo, Number("-") es NaN y el signo recien puesto desapareceria.
    const estado = montar([DESCUENTO]);
    agregar("Descuento");
    const campo = screen.getByLabelText(/precio/i);

    fireEvent.change(campo, { target: { value: "-" } });
    expect(estado.items[0].precio_texto).toBe("-");

    fireEvent.change(campo, { target: { value: "-5000" } });
    expect(estado.items[0].precio_unidad).toBe(-5000);
  });

  it("al descuento le dice que va en negativo", () => {
    montar([DESCUENTO]);
    agregar("Descuento");
    expect(lineaCargada().textContent).toContain("para que reste del total");
  });
});
