import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectorCliente, type Destinatario } from "./selector-cliente";
import type { Cliente } from "@/lib/types";

// El selector busca clientes en Supabase desde un efecto. Acá nunca se
// escribe en el buscador, así que el efecto no corre; el mock existe para
// que importar el módulo no intente levantar un cliente real.
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ or: () => ({ limit: async () => ({ data: [] }) }) }),
    }),
  }),
}));
vi.mock("./actions", () => ({ crearCliente: vi.fn() }));

function montar(destinatario: Destinatario | null = null) {
  const onSinRegistro = vi.fn();
  const onSelect = vi.fn();
  render(
    <SelectorCliente
      destinatario={destinatario}
      onSelect={onSelect}
      onSinRegistro={onSinRegistro}
      onClear={vi.fn()}
    />,
  );
  return { onSinRegistro, onSelect };
}

function abrirDialogo() {
  const r = montar();
  fireEvent.click(screen.getByRole("button", { name: /sin registro/i }));
  return r;
}

describe("SelectorCliente — pedido sin registro", () => {
  it("el diálogo llega con el nombre puesto, para no escribir nada", () => {
    abrirDialogo();

    const nombre = screen.getByLabelText("Nombre") as HTMLInputElement;
    expect(nombre.value).toBe("Sin registro");
  });

  it("confirmar sin tocar nada entrega nombre y teléfono vacío", () => {
    const { onSinRegistro } = abrirDialogo();

    fireEvent.click(screen.getByRole("button", { name: /usar sin registro/i }));

    expect(onSinRegistro).toHaveBeenCalledWith("Sin registro", null);
  });

  it("deja ponerle otro nombre", () => {
    const { onSinRegistro } = abrirDialogo();

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "  Señora de las acacias  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /usar sin registro/i }));

    expect(onSinRegistro).toHaveBeenCalledWith("Señora de las acacias", null);
  });

  it("no deja confirmar sin ningún nombre", () => {
    const { onSinRegistro } = abrirDialogo();

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /usar sin registro/i }));

    expect(onSinRegistro).not.toHaveBeenCalled();
    expect(screen.getByText(/poné un nombre/i)).toBeTruthy();
  });

  it("un teléfono a medias se rechaza: parece que se puede llamar y no", () => {
    const { onSinRegistro } = abrirDialogo();

    fireEvent.change(screen.getByLabelText(/teléfono/i), {
      target: { value: "9123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /usar sin registro/i }));

    expect(onSinRegistro).not.toHaveBeenCalled();
  });

  it("un teléfono completo viaja junto al nombre", () => {
    const { onSinRegistro } = abrirDialogo();

    fireEvent.change(screen.getByLabelText(/teléfono/i), {
      target: { value: "912345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /usar sin registro/i }));

    expect(onSinRegistro).toHaveBeenCalledTimes(1);
    const [nombre, telefono] = onSinRegistro.mock.calls[0];
    expect(nombre).toBe("Sin registro");
    expect(telefono).toBeTruthy();
  });

  it("ya elegido, avisa que no queda ficha de cliente", () => {
    montar({
      tipo: "sin_registro",
      nombre: "Señora de las acacias",
      telefono: "9 1234 5678",
    });

    expect(screen.getByText("Señora de las acacias")).toBeTruthy();
    expect(screen.getByText(/no queda ficha de cliente/i)).toBeTruthy();
  });
});

describe("SelectorCliente — cliente con ficha", () => {
  const ANA: Cliente = {
    rut: "12345678-9",
    nombre: "Ana Pérez",
    telefono: "9 1234 5678",
    correo: null,
    comuna: "Lo Barnechea",
    calle: "Las Acacias 201",
    dpto: null,
  };

  it("muestra el RUT, que es lo que lo distingue del sin registro", () => {
    montar({ tipo: "registrado", cliente: ANA });

    expect(screen.getByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByText("12345678-9")).toBeTruthy();
    expect(screen.queryByText(/no queda ficha de cliente/i)).toBeNull();
  });
});
