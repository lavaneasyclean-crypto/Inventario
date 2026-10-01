import { NavFinanzas } from "./nav-finanzas";

export default function FinanzasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
