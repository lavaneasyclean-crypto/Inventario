-- Inventario / Lavandería — pagar un pedido de a poco
--
-- `pedidos.pagado` es un interruptor: se pagó o no. En el mostrador pasa otra
-- cosa bastante seguido: dejan un abono al traer la ropa y pagan el resto al
-- retirarla. Hasta ahora eso no se podía anotar, y el pedido figuraba como
-- impago hasta que se cobraba entero.
--
-- Es el mismo modelo que `facturas_abonos` (0011) y por los mismos motivos:
-- cada pago recibido es una fila, y el estado del pedido se deriva de la suma
-- en vez de escribirse a mano. Dos lugares decidiendo lo mismo terminan
-- diciendo cosas distintas.
--
-- Hasta ahora el Access mandaba en el pago de los pedidos de mostrador y el
-- sync pisaba estas columnas en cada corrida. Desde que el mostrador trabaja
-- solo en la app, la fuente es esta tabla.
--
-- Idempotente.

-- =========================================================
-- 1. Los abonos
-- =========================================================
create table if not exists pedidos_abonos (
  id         bigserial primary key,
  pedido_id  bigint not null references pedidos(id) on delete cascade,
  fecha      date not null,
  monto      numeric(12,2) not null,
  forma_pago forma_pago,
  notas      text,
  created_at timestamptz not null default now()
);

create index if not exists pedidos_abonos_pedido_idx
  on pedidos_abonos (pedido_id, fecha);

-- Un abono de cero no es un pago, y uno negativo es una devolución que este
-- modelo no cubre.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_abonos_monto_positivo'
  ) then
    alter table pedidos_abonos
      add constraint pedidos_abonos_monto_positivo check (monto > 0);
  end if;
end $$;

-- =========================================================
-- 2. El estado del pedido sale de la suma
--
-- `forma_pago` es NOT NULL con default 'no_pago' en `pedidos`, así que cuando
-- no hay abonos vuelve a ese valor y no a NULL.
-- =========================================================
create or replace function recalcular_pago_pedido(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pagado numeric(12,2);
  v_fecha  date;
  v_forma  forma_pago;
  v_total  numeric(12,2);
begin
  select coalesce(sum(monto), 0)
    into v_pagado
    from pedidos_abonos
   where pedido_id = p_id;

  -- El último abono define la fecha y la forma que muestra la cabecera.
  select fecha, forma_pago
    into v_fecha, v_forma
    from pedidos_abonos
   where pedido_id = p_id
   order by fecha desc, id desc
   limit 1;

  select total_venta into v_total from pedidos where id = p_id;

  update pedidos
     set monto_abonado = v_pagado,
         pagado        = (coalesce(v_total, 0) > 0 and v_pagado >= v_total),
         -- La fecha de pago es la del último abono, y solo cuando quedó
         -- saldado: un abono parcial deja el pedido impago y sin fecha.
         fecha_pago    = case
                           when coalesce(v_total, 0) > 0 and v_pagado >= v_total
                             then (v_fecha + time '12:00') at time zone 'America/Santiago'
                           else null
                         end,
         forma_pago    = coalesce(v_forma, 'no_pago')
   where id = p_id;
end;
$$;

create or replace function trg_recalcular_pago_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform recalcular_pago_pedido(coalesce(new.pedido_id, old.pedido_id));
  return null;
end;
$$;

drop trigger if exists pedidos_abonos_recalcular on pedidos_abonos;
create trigger pedidos_abonos_recalcular
after insert or update or delete on pedidos_abonos
for each row execute function trg_recalcular_pago_pedido();

-- =========================================================
-- 3. Los pagos que ya estaban
--
-- Acá no se mira `monto_abonado`: de los 5.728 pedidos pagados, 5.683 lo
-- tienen en cero porque el campo venía vacío del Access. Quien dice la verdad
-- es `pagado`, así que un pedido pagado se convierte en un abono por su total.
--
-- Sin esto, el primer abono que alguien registre haría recalcular el pedido
-- desde una tabla vacía y lo dejaría impago.
-- =========================================================
insert into pedidos_abonos (pedido_id, fecha, monto, forma_pago, notas)
select p.id,
       coalesce(p.fecha_pago, p.fecha_recepcion)::date,
       p.total_venta,
       p.forma_pago,
       'Pago registrado antes de llevar abonos'
  from pedidos p
 where p.pagado = true
   and p.total_venta > 0
   and not exists (
     select 1 from pedidos_abonos a where a.pedido_id = p.id
   );

-- El caso al revés: impago pero con algo abonado. Hoy es uno solo, pero si se
-- pierde queda un pedido que dice deber de más.
insert into pedidos_abonos (pedido_id, fecha, monto, forma_pago, notas)
select p.id,
       coalesce(p.fecha_pago, p.fecha_recepcion)::date,
       p.monto_abonado,
       p.forma_pago,
       'Abono parcial registrado antes de llevar abonos'
  from pedidos p
 where p.pagado = false
   and p.monto_abonado > 0
   and not exists (
     select 1 from pedidos_abonos a where a.pedido_id = p.id
   );

-- =========================================================
-- 4. Row Level Security
-- =========================================================
alter table pedidos_abonos enable row level security;

drop policy if exists "auth_all" on pedidos_abonos;
create policy "auth_all" on pedidos_abonos
  for all to authenticated using (true) with check (true);

revoke execute on function recalcular_pago_pedido(bigint) from public, anon;
grant  execute on function recalcular_pago_pedido(bigint) to authenticated;
