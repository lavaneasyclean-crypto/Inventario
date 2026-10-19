import {
  EsqueletoCabecera,
  EsqueletoFiltros,
  EsqueletoListaDoble,
} from "@/components/esqueletos";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6">
      <EsqueletoCabecera />
      <EsqueletoFiltros campos={4} />
      <EsqueletoListaDoble />
    </div>
  );
}
