-- Inventario / Lavandería — recalculo de total_venta
--
-- En el Access la columna TotalVenta estaba mayormente vacía o en 0.
-- La suma real existe distribuida en pedidos_items.importe.
-- Esta migración:
--  1. Backfillea pedidos.total_venta sumando los importes de sus items.
--  2. Para pedidos marcados como pagados con monto_abonado = 0, asume que
--     se cobró el total (caso típico del Access).
--  3. Crea un trigger sobre pedidos_items para mantener total_venta
--     sincronizado en adelante (insert/update/delete).
--
-- Idempotente: se puede re-ejecutar sin problema.

-- 1. Backfill
update pedidos p
set total_venta = coalesce((
  select sum(importe) from pedidos_items where pedido_id = p.id
), 0);

-- 2. monto_abonado para pedidos pagados sin monto registrado
update pedidos
set monto_abonado = total_venta
where pagado = true
  and monto_abonado = 0
  and total_venta > 0;

-- 3. Trigger para mantener total_venta sincronizado
create or replace function recompute_pedido_total()
returns trigger
language plpgsql
as $$
declare
  pid bigint;
begin
  pid := coalesce(new.pedido_id, old.pedido_id);
  update pedidos
  set total_venta = coalesce((
    select sum(importe) from pedidos_items where pedido_id = pid
  ), 0)
  where id = pid;
  return null;
end;
$$;

drop trigger if exists pedidos_items_recompute_total on pedidos_items;
create trigger pedidos_items_recompute_total
after insert or update or delete on pedidos_items
for each row execute function recompute_pedido_total();
