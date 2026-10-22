import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BotonGuardar } from "./boton-guardar";

describe("BotonGuardar", () => {
  it("guarda cuando no falta nada", async () => {
    const guardar = vi.fn();
    render(<BotonGuardar onClick={guardar}>Registrar</BotonGuardar>);
    fireEvent.click(screen.getByRole("button"));
    expect(guardar).toHaveBeenCalledOnce();
  });

  it("si falta algo, lo DICE en vez de apagarse", async () => {
    // Este era el bug: el boton quedaba gris y no habia forma de saber por que.
    const guardar = vi.fn();
    render(
      <BotonGuardar onClick={guardar} faltan={["la descripción"]}>
        Registrar
      </BotonGuardar>,
    );
    const boton = screen.getByRole("button");
    expect(boton).toBeEnabled();

    fireEvent.click(boton);
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Falta la descripción");
  });

  it("nombra todo lo que falta, no solo lo primero", async () => {
    render(
      <BotonGuardar onClick={vi.fn()} faltan={["la descripción", "el monto"]}>
        Registrar
      </BotonGuardar>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Faltan la descripción y el monto",
    );
  });

  it("descarta los false, para poder escribir `!x && \"el nombre\"`", async () => {
    const guardar = vi.fn();
    render(
      <BotonGuardar onClick={guardar} faltan={[false, null, undefined]}>
        Registrar
      </BotonGuardar>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(guardar).toHaveBeenCalledOnce();
  });

  it("el aviso se va solo al completar el campo", async () => {
    const { rerender } = render(
      <BotonGuardar onClick={vi.fn()} faltan={["el monto"]}>
        Registrar
      </BotonGuardar>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Seguir reclamando por algo que ya esta escrito seria molesto.
    rerender(
      <BotonGuardar onClick={vi.fn()} faltan={[]}>
        Registrar
      </BotonGuardar>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mientras guarda si se apaga: ahi el motivo se lee en el texto", () => {
    render(
      <BotonGuardar onClick={vi.fn()} pending>
        Guardando…
      </BotonGuardar>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
