import { EsqueletoCabecera, EsqueletoLista } from "@/components/esqueletos";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6">
      <EsqueletoCabecera />
      <EsqueletoLista />
    </div>
  );
}
