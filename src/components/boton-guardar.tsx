"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * El botón de guardar de un formulario, que nunca se apaga en silencio.
 *
 * El patrón de antes era `disabled={!descripcion.trim() || monto <= 0}`: el
 * botón quedaba gris y no decía por qué. Quien llenó el formulario ve todos
 * los campos con algo escrito —los opcionales dicen "(opcional)", los
 * obligatorios no dicen nada— y un botón muerto. No hay forma de salir de ahí
 * salvo adivinar.
 *
 * Los mensajes de validación existían, pero del lado del servidor: como el
 * botón no dejaba llamar, nunca se llegaba a verlos.
 *
 * Acá el botón se puede apretar siempre. Si falta algo, lo dice con el nombre
 * del campo y no manda nada. Se apaga solo mientras se está guardando, que es
 * la única razón honesta para apagarlo: ahí el motivo se ve en el texto.
 */
export function BotonGuardar({
  onClick,
  pending = false,
  faltan = [],
  children,
  ...props
}: {
  onClick: () => void | Promise<void>;
  pending?: boolean;
  /**
   * Qué falta para poder guardar, en el orden en que aparece en pantalla.
   * Se escriben como se leen en la frase: "Falta la descripción".
   * Los `false` se descartan, para poder escribir `!x.trim() && "el nombre"`.
   */
  faltan?: (string | false | null | undefined)[];
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "disabled">) {
  const [aviso, setAviso] = useState<string | null>(null);
  const pendientes = faltan.filter((f): f is string => Boolean(f));

  // Si ya completaron lo que faltaba, el aviso sobra: molestaría seguir
  // mostrando un reclamo sobre algo que ya está escrito.
  if (aviso && pendientes.length === 0) setAviso(null);

  const intentar = () => {
    if (pendientes.length > 0) {
      setAviso(
        pendientes.length === 1
          ? `Falta ${pendientes[0]}`
          : `Faltan ${pendientes.slice(0, -1).join(", ")} y ${pendientes.at(-1)}`,
      );
      return;
    }
    setAviso(null);
    void onClick();
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      {aviso && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {aviso}
        </p>
      )}
      <Button onClick={intentar} disabled={pending} {...props}>
        {children}
      </Button>
    </div>
  );
}
