"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Campo numérico que solo se escribe.
 *
 * `type="number"` trae tres problemas que en el mostrador se pagan caro:
 *
 *  1. Las flechitas del spinner y la rueda del mouse cambian el valor. Basta
 *     pasar el scroll sobre un campo enfocado para alterar un precio o una
 *     cantidad sin darse cuenta.
 *  2. El navegador acepta "e", "+" y "-" porque son notación científica
 *     válida, y después eso no parsea.
 *  3. Cuando el contenido no es un número válido, `value` vuelve vacío y se
 *     pierde lo que la persona venía escribiendo.
 *
 * Con `type="text"` e `inputMode="numeric"` no hay spinner ni rueda, el
 * teclado del teléfono sigue saliendo numérico, y qué caracteres entran queda
 * bajo nuestro control.
 *
 * El valor se maneja como texto a propósito: mientras se escribe tiene que
 * poder quedar vacío. Convertir a número es tarea de quien lo usa, al guardar.
 */
export const InputNumero = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type" | "onChange" | "value"> & {
    value: string;
    onValueChange: (v: string) => void;
    /** Para descuentos, que en el catálogo se cargan en negativo. */
    permitirNegativo?: boolean;
  }
>(function InputNumero(
  { value, onValueChange, permitirNegativo = false, ...props },
  ref,
) {
  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const limpio = permitirNegativo
          ? e.target.value.replace(/(?!^-)[^\d]/g, "")
          : e.target.value.replace(/[^\d]/g, "");
        onValueChange(limpio);
      }}
    />
  );
});
