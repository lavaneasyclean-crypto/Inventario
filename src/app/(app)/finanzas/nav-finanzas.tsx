"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "/finanzas", label: "Resumen", icon: PieChart, exacta: true },
  { href: "/finanzas/facturas", label: "Por cobrar", icon: ArrowDownLeft },
  { href: "/finanzas/gastos", label: "Por pagar", icon: ArrowUpRight },
];

export function NavFinanzas() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-xl border bg-background p-1">
      {SECCIONES.map(({ href, label, icon: Icon, exacta }) => {
        const activa = exacta
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              activa
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
