"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Menu, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { SidebarNav } from "./sidebar-nav";

export function TopBar({
  userEmail,
  esAdmin,
}: {
  userEmail: string;
  esAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-3 sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menú"
            />
          }
        >
          <Menu className="size-6" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2">
              <Logo size={28} /> Inventario
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setOpen(false)} esAdmin={esAdmin} />
        </SheetContent>
      </Sheet>

      <Logo size={32} className="hidden md:block" />
      <h1 className="text-lg font-bold tracking-tight">Inventario</h1>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:block">
          {userEmail}
        </span>
        <Link
          href="/auth/password"
          aria-label="Cambiar contraseña"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <KeyRound className="size-5" />
        </Link>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
            <LogOut className="size-5" />
          </Button>
        </form>
      </div>
    </header>
  );
}
