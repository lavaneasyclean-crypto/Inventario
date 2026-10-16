import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { getRolActual } from "@/lib/data/perfil";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const rol = await getRolActual();

  return (
    <AppShell userEmail={user.email ?? ""} esAdmin={rol === "admin"}>
      {children}
    </AppShell>
  );
}
