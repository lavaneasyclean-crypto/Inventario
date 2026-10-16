import { notFound } from "next/navigation";
import { esAdmin } from "@/lib/data/perfil";
import { NavFinanzas } from "./nav-finanzas";

/**
 * Finanzas es solo de admins.
 *
 * Devuelve 404 y no un redirect: un redirect a /inicio le confirma a quien
 * probo la URL que la seccion existe y que no tiene permiso. El 404 no dice
 * nada. De todas formas la frontera real es RLS: sin ella, esto solo esconde
 * la pantalla y los datos se siguen pudiendo pedir por la API.
 */
export default async function FinanzasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await esAdmin())) notFound();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Lo que nos deben las empresas y lo que tenemos que pagar
        </p>
      </div>
      <div className="mb-6">
        <NavFinanzas />
      </div>
      {children}
    </div>
  );
}
