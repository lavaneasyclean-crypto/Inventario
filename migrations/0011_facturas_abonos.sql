-- Inventario / Lavandería — abonos: una factura se puede pagar de a poco
--
-- `0009_finanzas.sql` modeló el cobro como un interruptor: la factura estaba
-- pendiente o pagada. Las empresas no pagan así. Pagan una parte a fin de mes,
-- el resto cuando pueden, y mientras tanto la pregunta que importa no es "¿ya
-- pagó?" sino "¿cuánto falta?".
--
-- Cada pago recibido pasa a ser una fila en `facturas_abonos`. El estado de la
-- factura deja de escribirse a mano y pasa a derivarse de la suma:
--
--     sin abonos              → pendiente
--     abonos < total          → pendiente, con saldo
--     abonos >= total         → pagada
--
-- `facturas.monto_pagado` es la suma mantenida por un trigger, igual que
-- `pedidos.total_venta` en `0002_recompute_totales.sql`. Se guarda en vez de
-- calcularse en cada consulta porque los listados y el resumen la necesitan
-- para ordenar y sumar, y hacer el join en cada fila sale caro.
--
-- Idempotente.
--
-- IMPORTANTE: aplicar antes de desplegar el código que la usa.

-- =========================================================
-- 1. Los abonos
-- =========================================================
create table if not exists facturas_abonos (
  id          bigserial primary key,
  factura_id  bigint not null references facturas(id) on delete cascade,
  fecha       date not null,
  monto       integer not null,
  forma_pago  forma_pago,
  notas       text,
  created_at  timestamptz not null default now()
);

create index if not exists facturas_abonos_factura_idx
  on facturas_abonos (factura_id, fecha);

-- Un abono de cero no es un pago, y uno negativo es una nota de crédito que
-- este modelo no cubre: para eso se anula la factura y se emite otra.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'facturas_abonos_monto_positivo'
  ) then
    alter table facturas_abonos
      add constraint facturas_abonos_monto_positivo check (monto > 0);
  end if;
end $$;

-- =========================================================
-- 2. Lo pagado hasta ahora, mantenido por el motor
-- =========================================================
alter table facturas
  add column if not exists monto_pagado integer not null default 0;

comment on column facturas.monto_pagado is
  'Suma de los abonos. La mantiene un trigger: no escribirla a mano.';

-- =========================================================
-- 3. Recalcular una factura desde sus abonos
--
-- Se expone como función y no solo como trigger porque anular y reactivar
-- también necesitan rehacer la cuenta, y duplicar la regla en el server
-- action es la forma segura de que las dos copias se despeguen.
--
-- Las anuladas no cambian de estado: una factura anulada con abonos sigue
-- anulada, y su fecha de pago se conserva porque saber cuándo entró esa plata
-- es justamente lo que hace falta para devolverla.
-- =========================================================
create or replace function recalcular_pago_factura(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pagado      integer;
  v_fecha       date;
  v_forma       forma_pago;
begin
  select coalesce(sum(monto), 0)
    into v_pagado
    from facturas_abonos
   where factura_id = p_id;

  -- El último abono define la fecha y la forma que muestra la cabecera.
  select fecha, forma_pago
    into v_fecha, v_forma
    from facturas_abonos
   where factura_id = p_id
   order by fecha desc, id desc
   limit 1;

  update facturas f
     set monto_pagado = v_pagado,
         estado = case
                    when f.estado = 'anulada' then 'anulada'
                    when f.total > 0 and v_pagado >= f.total then 'pagada'
                    else 'pendiente'
                  end,
         -- La restricción facturas_pago_coherente exige fecha solo cuando está
         -- pagada: un pago parcial deja la factura pendiente y sin fecha.
         fecha_pago = case
                        when f.estado = 'anulada' then f.fecha_pago
                        when f.total > 0 and v_pagado >= f.total then v_fecha
                        else null
                      end,
         forma_pago = case
                        when f.estado = 'anulada' then f.forma_pago
                        else v_forma
                      end
   where f.id = p_id;
end;
$$;

create or replace function trg_recalcular_pago_factura()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform recalcular_pago_factura(coalesce(new.factura_id, old.factura_id));
  return null;
end;
$$;

drop trigger if exists facturas_abonos_recalcular on facturas_abonos;
create trigger facturas_abonos_recalcular
after insert or update or delete on facturas_abonos
for each row execute function trg_recalcular_pago_factura();

-- =========================================================
-- 4. Backfill: los pagos que ya existían pasan a ser un abono
--
-- Antes de esta migración, marcar una factura como pagada guardaba la fecha y
-- la forma en la cabecera. Esos pagos se convierten en un abono por el total
-- para que el saldo dé cero y no aparezcan como deuda.
-- =========================================================
insert into facturas_abonos (factura_id, fecha, monto, forma_pago, notas)
select f.id, f.fecha_pago, f.total, f.forma_pago,
       'Pago registrado antes de llevar abonos'
  from facturas f
 where f.estado = 'pagada'
   and f.fecha_pago is not null
   and f.total > 0
   and not exists (
     select 1 from facturas_abonos a where a.factura_id = f.id
   );

-- Por si alguna quedó fuera del caso de arriba (total 0, o abonos cargados a
-- mano antes de crear el trigger).
select recalcular_pago_factura(id) from facturas;

-- =========================================================
-- 5. Row Level Security
-- =========================================================
alter table facturas_abonos enable row level security;

drop policy if exists "auth_all" on facturas_abonos;
create policy "auth_all" on facturas_abonos
  for all to authenticated using (true) with check (true);

revoke execute on function recalcular_pago_factura(bigint) from public, anon;
grant  execute on function recalcular_pago_factura(bigint) to authenticated;
