import { Construction } from "lucide-react";

export function Placeholder({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border bg-background p-12 text-center">
        <Construction className="size-12 text-muted-foreground" aria-hidden />
        <p className="text-base font-medium">En construcción</p>
        <p className="max-w-md text-sm text-muted-foreground">{descripcion}</p>
      </div>
    </div>
  );
}
