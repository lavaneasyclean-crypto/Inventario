-- Inventario / Lavandería — anular pedidos empresa
--
-- Permite marcar un pedido empresa como anulado sin perderlo. Los
-- anulados quedan visibles en histórico pero no entran en la facturación
-- por defecto.
--
-- Idempotente.

alter table pedidos_empresa
  add column if not exists anulado boolean not null default false;

create index if not exists pedidos_empresa_anulado_idx
  on pedidos_empresa (rut_empresa, anulado, fecha desc);
