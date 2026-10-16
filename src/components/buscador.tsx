"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Cuánto se espera después de la última tecla antes de buscar.
 *
 * Tipeando normal no se dispara una consulta por letra: se dispara cuando la
 * persona frena. Más corto hace que cada palabra cueste varias consultas;
 * más largo se siente trabado.
 */
const ESPERA_MS = 300;

/**
 * Barra de búsqueda que busca sola mientras se escribe.
 *
 * Va *dentro* del `<form>` que ya tenía cada pantalla, y de ahí saca el resto
 * de los filtros: lee el formulario entero con FormData, así una categoría o
 * un rango de fechas recién elegidos no se pierden porque alguien escribió
 * algo después. Por eso el navegador tiene que ver un form de verdad y no
 * alcanza con armar la URL a mano.
 *
 * Navega con `replace` y no con `push`: si cada tecla dejara una entrada en el
 * historial, el botón Atrás tendría que apretarse una vez por letra.
 */
export function Buscador({
  defaultValue = "",
  placeholder,
  name = "q",
  className,
  autoFocus,
}: {
  defaultValue?: string;
  placeholder?: string;
  name?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState(defaultValue);
  const [pendiente, startTransition] = useTransition();

  // Lo último que se mandó a la URL. Sirve para distinguir "la página volvió
  // con lo que yo pedí" de "la URL cambió por otra cosa" —por ejemplo el link
  // de limpiar filtros—, que es lo único que debe pisar lo que se está
  // tipeando.
  const enviado = useRef(defaultValue);

  useEffect(() => {
    if (valor === enviado.current) return;

    const t = setTimeout(() => {
      enviado.current = valor;

      const params = new URLSearchParams();
      const form = ref.current?.form;
      if (form) {
        for (const [k, v] of new FormData(form).entries()) {
          // Los vacíos no van: un `?desde=&hasta=` ensucia la URL y no filtra.
          if (typeof v === "string" && v !== "") params.set(k, v);
        }
      }
      if (valor) params.set(name, valor);
      else params.delete(name);

      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, ESPERA_MS);

    return () => clearTimeout(t);
  }, [valor, name, pathname, router]);

  useEffect(() => {
    if (defaultValue !== enviado.current) {
      enviado.current = defaultValue;
      setValor(defaultValue);
    }
  }, [defaultValue]);

  return (
    <div className={cn("relative flex-1", className)}>
      {pendiente ? (
        <Loader2
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : (
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      )}
      <Input
        ref={ref}
        type="search"
        name={name}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        className="h-11 pl-9 text-base"
        autoFocus={autoFocus}
      />
    </div>
  );
}
