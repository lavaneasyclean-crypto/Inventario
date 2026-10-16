"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatearChileno,
  partirTelefono,
  telefonoChileno,
  telefonoExtranjero,
} from "@/lib/telefono";

/**
 * Teléfono con país.
 *
 * Arranca en Chile porque es el caso de todos los días, y el número se va
 * formateando solo mientras se escribe: se tipean nueve dígitos y queda
 * `+56 9 1234 5678`, igual que los que ya están guardados.
 *
 * El selector de país existe por los clientes extranjeros, que aparecen de a
 * poco pero aparecen. Para esos no se intenta adivinar el formato de cada
 * país: se guarda lo que dicten, que es lo único que hace falta para poder
 * marcarlo después.
 */
export function InputTelefono({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inicial = partirTelefono(value);
  const [esChileno, setEsChileno] = useState(inicial.esChileno);
  const [numero, setNumero] = useState(inicial.numero);

  function cambiarPais(v: string | null) {
    const chile = v !== "otro";
    setEsChileno(chile);
    // El número no se arrastra entre países: el formato chileno no significa
    // nada afuera, y dejarlo puesto hace que se guarde algo que no se marca.
    setNumero("");
    onChange("");
  }

  function cambiarNumero(entrada: string) {
    if (esChileno) {
      const formateado = formatearChileno(entrada);
      setNumero(formateado);
      onChange(formateado ? telefonoChileno(formateado) : "");
    } else {
      setNumero(entrada);
      onChange(telefonoExtranjero(entrada));
    }
  }

  return (
    <div className="flex gap-2">
      <Select
        value={esChileno ? "cl" : "otro"}
        onValueChange={cambiarPais}
        disabled={disabled}
      >
        <SelectTrigger className="h-10 w-[7.5rem] shrink-0" aria-label="País">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cl">Chile +56</SelectItem>
          <SelectItem value="otro">Otro país</SelectItem>
        </SelectContent>
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        value={numero}
        onChange={(e) => cambiarNumero(e.target.value)}
        placeholder={esChileno ? "9 1234 5678" : "+54 11 4567 8900"}
        className="h-10"
        disabled={disabled}
      />
    </div>
  );
}
