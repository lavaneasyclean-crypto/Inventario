import { EsqueletoCabecera, EsqueletoFiltros, EsqueletoLista } from "@/components/esqueletos";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6">
      <EsqueletoCabecera />
      <EsqueletoFiltros campos={2} />
      <EsqueletoLista filas={8} />
    </div>
  );
}
