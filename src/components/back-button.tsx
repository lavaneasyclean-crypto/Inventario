import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Vuelve a lo que está *arriba* en la app, no a lo anterior en el historial.
 *
 * Antes llamaba a `router.back()`, que hace algo distinto de lo que el botón
 * promete: si editaste una guía, la guardaste y después apretaste Volver, te
 * devolvía a la pantalla de edición. Es de donde venías, pero no a donde
 * querías ir — y encima te deja a un paso de volver a editar sin querer.
 *
 * A dónde se sube es una propiedad de la pantalla, no del camino que tomó
 * quien llegó a ella, así que cada una declara el suyo. Va como `<Link>` y no
 * como botón para que ande el click con rueda, el "abrir en pestaña nueva" y
 * el prefetch.
 */
export function BackButton({
  href,
  label = "Volver",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
    >
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}
