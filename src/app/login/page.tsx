"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  /**
   * El `redirectTo` es lo que hace que el link del correo caiga en la pantalla
   * donde se elige la contraseña. Sin eso, Supabase manda a la raiz del sitio:
   * el token se canjea por una sesion, la persona entra a la app y la
   * contraseña queda igual que antes.
   *
   * Esa URL tiene que estar en la lista de Redirect URLs del proyecto, o
   * Supabase la ignora y vuelve a mandar a la raiz.
   */
  async function recuperar() {
    setError(null);

    if (!email.trim()) {
      setError("Escribí tu email arriba y volvé a tocar acá.");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/password`,
    });
    setLoading(false);

    if (err) {
      setError("No se pudo enviar el correo. Probá de nuevo en un rato.");
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary to-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo size={80} className="mb-2" />
          <CardTitle className="text-2xl">Inventario</CardTitle>
          <p className="text-sm text-muted-foreground">Easy Clean</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {enviado && (
              <p className="text-sm text-muted-foreground" role="status">
                Te mandamos un correo a {email}. El link sirve una sola vez y
                dura poco: abrilo apenas llegue. Si no aparece, mirá en spam.
              </p>
            )}
            <Button type="submit" disabled={loading} size="lg">
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
            <button
              type="button"
              onClick={recuperar}
              disabled={loading}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            >
              Olvidé mi contraseña
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
