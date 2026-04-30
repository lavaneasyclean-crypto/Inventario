import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen p-6 sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight">Inventario</h1>
      <p className="mt-2 text-muted-foreground">
        Sistema de gestión de pedidos. Hola, {user.email}.
      </p>
    </main>
  );
}
