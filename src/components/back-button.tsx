"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón "Volver" que usa el back del navegador. Si no hay historia,
 * cae al fallback.
 */
export function BackButton({
  fallbackHref = "/",
  label = "Volver",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  const handleClick = () => {
    // Si hay historia previa, usar back nativo. Sino ir al fallback.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleClick}>
      <ArrowLeft className="size-4" /> {label}
    </Button>
  );
}
