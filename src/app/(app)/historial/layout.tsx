import { notFound } from "next/navigation";
import { esAdmin } from "@/lib/data/perfil";

/**
 * El historial es solo de admins.
 *
 * Mismo criterio que Finanzas: 404 y no un redirect, porque un redirect le
 * confirma a quien probó la URL que la sección existe. La frontera real la
 * pone RLS (migrations/0017): sin ella, esto solo escondería la pantalla.
 */
export default async function HistorialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await esAdmin())) notFound();
  return children;
}
