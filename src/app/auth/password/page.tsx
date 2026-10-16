"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/browser";

/** Supabase rechaza menos de 6; pedimos un poco mas para que no sea trivial. */
const MINIMO = 8;

type Estado = "revisando" | "listo" | "sin-sesion";

/**
 * Elegir una contraseña nueva.
 *
 * Sirve para los dos caminos, que terminan en el mismo lugar:
 *
 *  - Se llego desde el correo de recuperacion. Ese link trae un token que el
 *    cliente de Supabase canjea solo por una sesion al cargar la pagina; sin
 *    una pantalla como esta, el token se gasta en entrar a la app y la
 *    contraseña nunca se cambia. Eso es exactamente lo que estaba pasando.
 *  - Ya se esta adentro y se quiere cambiar la contraseña.
 *
 * La ruta cuelga de /auth, que el middleware deja pasar sin sesion: cuando se
 * llega desde el correo, la sesion todavia se esta estableciendo.
 */
export default function CambiarPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [estado, setEstado] = useState<Estado>("revisando");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;

    // El token del correo viene en el fragmento de la URL y el cliente lo
    // procesa al arrancar. Escuchar el cambio de sesion evita la carrera de
    // preguntar antes de que termine.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (vivo && sesion) setEstado("listo");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setEstado(data.session ? "listo" : "sin-sesion");
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MINIMO) {
      setError(`La contraseña necesita al menos ${MINIMO} caracteres.`);
      return;
    }
    if (password !== repetida) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setGuardando(false);

    if (err) {
      setError(
        err.message.toLowerCase().includes("session")
          ? "El link expiró. Pedí uno nuevo desde la pantalla de ingreso."
          : "No se pudo cambiar la contraseña. Probá de nuevo.",
      );
      return;
    }

    setListo(true);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary to-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo size={80} className="mb-2" />
          <CardTitle className="text-2xl">Contraseña nueva</CardTitle>
        </CardHeader>
        <CardContent>
          {estado === "revisando" && (
            <p className="text-center text-sm text-muted-foreground">
              Revisando el link…
            </p>
          )}

          {estado === "sin-sesion" && (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este link ya no sirve: los de recuperación duran poco y se usan
                una sola vez.
              </p>
              <Link
                href="/login"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Pedir uno nuevo
              </Link>
            </div>
          )}

          {estado === "listo" && listo && (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm">
                Listo. Anotala en algún lado antes de cerrar esto.
              </p>
              <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
                Ir a la app
              </Link>
            </div>
          )}

          {estado === "listo" && !listo && (
            <form onSubmit={guardar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña nueva</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={guardando}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Al menos {MINIMO} caracteres.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="repetida">Repetila</Label>
                <Input
                  id="repetida"
                  type="password"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={guardando}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={guardando} size="lg">
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
