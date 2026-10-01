-- Inventario / Lavandería — pedidos express y su recargo por empresa
--
-- Una guía puede venir "express": se lava y se devuelve apurada, y por eso se
-- cobra un porcentaje adicional. El porcentaje lo negocia cada empresa, así
-- que vive en `clientes_empresa` y no en una constante. Hoy el caso es Hotel
-- Acacias con 60%.
--
-- Cómo se cobra, que es lo que define el modelo:
--
--   factura normal   → TODAS las guías del período a precio base,
--                      las express incluidas.
--   factura express  → SOLO las guías express, y solo el recargo:
--                      precio unitario = round(precio base × recargo / 100).
--
-- Son dos documentos porque Haulmer —el facturador electrónico— no acepta
-- muchos items en una sola factura. Verificado contra la planilla de julio
-- 2026: el bloque principal da $2.246.850, el bloque "Servicio express" da
-- $129.618, y la factura N° 1686 emitida por el express trae exactamente ese
-- neto. La planilla suma los dos en su `Total Neto` ($2.376.468).
--
-- El recargo NO se congela en la línea del pedido, a diferencia del precio.
-- El precio se snapshotea porque cambia por producto y por acuerdo; el
-- recargo es una condición comercial única de la empresa y si cambia se aplica
-- de ahí en adelante. Lo que queda congelado igual es la factura: sus líneas
-- guardan el precio del recargo ya calculado.
--
-- Idempotente.
--
-- IMPORTANTE: aplicar antes de desplegar el código que la usa. La creación de
-- pedidos de empresa pasa por `crear_pedido_empresa`, que acá cambia de forma.

-- =========================================================
-- 1. El recargo de cada empresa
-- =========================================================
alter table clientes_empresa
  add column if not exists recargo_express integer not null default 0;

comment on column clientes_empresa.recargo_express is
  'Porcentaje adicional sobre el precio base de una guía express. 0 = la empresa no cobra express.';

-- Tope alto pero finito: 60 es el caso real, y el techo está para atajar el
-- dedo que escribe 600 queriendo 60.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_empresa_recargo_rango'
  ) then
    alter table clientes_empresa
      add constraint clientes_empresa_recargo_rango
      check (recargo_express >= 0 and recargo_express <= 500);
  end if;
end $$;

-- =========================================================
-- 2. La marca en la guía
-- =========================================================
alter table pedidos_empresa
  add column if not exists express boolean not null default false;

create index if not exists pedidos_empresa_express_idx
  on pedidos_empresa (rut_empresa, fecha desc) where express;

-- =========================================================
-- 3. Crear pedido de empresa, ahora con la marca
--
-- Reemplaza la versión de 0006_crear_pedido_atomico.sql. Lo único que cambia
-- es que la cabecera lee `express`; el resto es igual.
-- =========================================================
create or replace function crear_pedido_empresa(p_pedido jsonb, p_items jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  insert into pedidos_empresa (rut_empresa, alias, fecha, detalle, express)
  values (
    p_pedido->>'rut_empresa',
    p_pedido->>'alias',
    (p_pedido->>'fecha')::timestamptz,
    p_pedido->>'detalle',
    coalesce((p_pedido->>'express')::boolean, false)
  )
  returning id into v_id;

  -- precio_unidad puede venir NULL (producto todavía sin precio para esa
  -- empresa); en ese caso el importe también queda NULL y la facturación lo
  -- marca como "sin precio".
  insert into pedidos_empresa_items (
    pedido_empresa_id, producto_empresa_id, producto_empresa_nombre,
    precio_unidad, cantidad, importe, detalle_prenda
  )
  select
    v_id,
    it->>'producto_empresa_id',
    it->>'producto_empresa_nombre',
    (it->>'precio_unidad')::integer,
    (it->>'cantidad')::integer,
    (it->>'precio_unidad')::integer * (it->>'cantidad')::integer,
    it->>'detalle_prenda'
  from jsonb_array_elements(p_items) as it;

  return v_id;
end;
$$;

revoke execute on function crear_pedido_empresa(jsonb, jsonb) from public, anon;
grant  execute on function crear_pedido_empresa(jsonb, jsonb) to authenticated;

-- =========================================================
-- 4. Backfill del caso conocido
--
-- Hotel Acacias ya venía cobrando 60% sin que el sistema lo supiera. Se deja
-- cargado para no tener que acordarse, pero sin pisar un valor que alguien ya
-- haya puesto a mano.
-- =========================================================
update clientes_empresa
   set recargo_express = 60
 where rut = '96620830-9'
   and recargo_express = 0;

-- Las guías express históricas no se pueden deducir de la base: la marca
-- vivía en la planilla, en el sufijo "Express" de la fila `Guias`. Las que se
-- vuelvan a cargar con `05_cargar_guias_excel.py` entran ya marcadas; las
-- viejas hay que marcarlas a mano desde la ficha de la guía si hace falta.
