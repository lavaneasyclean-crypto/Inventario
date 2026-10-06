-- Inventario / Lavandería — prendas agrupadas por bolsa de trabajador
--
-- Termomín y Termochemical no mandan un bulto de ropa: mandan la bolsa de
-- cada trabajador, numerada, y hay que devolverla tal cual. La bolsa 3 vuelve
-- con las mismas 6 poleras y el mismo pantalón con que entró.
--
-- Hasta acá una guía era una lista de (producto, cantidad). Para estas
-- empresas pasa a ser una grilla: una fila por bolsa, una columna por prenda.
-- Exactamente la planilla que vienen llenando a mano.
--
-- La bolsa es logística, no comercial: NO cambia el precio. La facturación
-- sigue consolidando por producto y la ignora, igual que antes. Verificado
-- contra la planilla de septiembre 2026: semana 1 de Termomín da $164.400
-- sumando 52 poleras a $1.200, 35 pantalones y 20 polerones a $1.750, 3
-- cotonas a $1.750 y 1 gorro a $500, sin que la bolsa entre en la cuenta.
--
-- El padrón es lo que hace posible la grilla. Las bolsas son las mismas todas
-- las semanas —son de la misma gente— así que se cargan una vez y después
-- solo se tipean cantidades. Si el número fuera texto libre en cada carga, un
-- "7" y un " 7" serían bolsas distintas y el día que haya un reclamo no se
-- podría cruzar nada.
--
-- Idempotente.
--
-- IMPORTANTE: aplicar antes de desplegar el código que la usa.
-- `crear_pedido_empresa` cambia de forma otra vez.

-- =========================================================
-- 1. Qué empresas trabajan así
--
-- Opt-in, igual que el recargo express. Acacias manda bultos sueltos y no
-- tiene por qué ver una grilla de bolsas.
-- =========================================================
alter table clientes_empresa
  add column if not exists usa_bolsas boolean not null default false;

comment on column clientes_empresa.usa_bolsas is
  'La ropa viene separada por bolsa de trabajador y se devuelve igual. Habilita la grilla de carga y la hoja de devolución.';

-- =========================================================
-- 2. El padrón
--
-- `codigo` es texto y no un número porque no todas las bolsas lo son: en la
-- planilla conviven 1..32 con "Nicolás", "DV" y "Maxis", que son personas sin
-- bolsa numerada. El orden de la grilla se arma en la app —primero los
-- números, después los nombres— y no se guarda: derivarlo evita tener que
-- renumerar todo cuando entra alguien nuevo.
-- =========================================================
create table if not exists empresa_bolsas (
  id          bigserial primary key,
  rut_empresa text not null references clientes_empresa(rut)
                on update cascade on delete cascade,
  codigo      text not null,
  -- Quién la usa. Opcional: en la planilla casi siempre está vacío.
  nombre      text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists empresa_bolsas_codigo_unico
  on empresa_bolsas (rut_empresa, lower(codigo));

create index if not exists empresa_bolsas_empresa_idx
  on empresa_bolsas (rut_empresa) where activo;

drop trigger if exists empresa_bolsas_updated on empresa_bolsas;
create trigger empresa_bolsas_updated before update on empresa_bolsas
  for each row execute function set_updated_at();

-- =========================================================
-- 3. La bolsa en la línea del pedido
--
-- Se guardan las dos cosas, igual que con el producto: el id para poder
-- cruzar y agrupar, y el código como snapshot para que la guía siga diciendo
-- lo que decía aunque después la bolsa se renombre o se dé de baja.
-- =========================================================
alter table pedidos_empresa_items
  add column if not exists bolsa_id     bigint references empresa_bolsas(id)
                                          on update cascade on delete set null,
  add column if not exists bolsa_codigo text;

create index if not exists pedidos_empresa_items_bolsa_idx
  on pedidos_empresa_items (bolsa_id) where bolsa_id is not null;

-- Agrupar las líneas de una guía por bolsa es lo que hace la hoja de
-- devolución, y es la consulta caliente de esa pantalla.
create index if not exists pedidos_empresa_items_pedido_bolsa_idx
  on pedidos_empresa_items (pedido_empresa_id, bolsa_codigo);

-- =========================================================
-- 4. Crear pedido de empresa, ahora con la bolsa
--
-- Reemplaza la versión de 0010_pedidos_express.sql. Lo único que cambia es
-- que cada item puede traer su bolsa; el resto es igual.
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
    precio_unidad, cantidad, importe, detalle_prenda,
    bolsa_id, bolsa_codigo
  )
  select
    v_id,
    it->>'producto_empresa_id',
    it->>'producto_empresa_nombre',
    (it->>'precio_unidad')::integer,
    (it->>'cantidad')::integer,
    (it->>'precio_unidad')::integer * (it->>'cantidad')::integer,
    it->>'detalle_prenda',
    (it->>'bolsa_id')::bigint,
    -- El código se copia del padrón y no de lo que mande el cliente, para que
    -- el snapshot no pueda salir desalineado del id.
    (select b.codigo from empresa_bolsas b
      where b.id = (it->>'bolsa_id')::bigint)
  from jsonb_array_elements(p_items) as it;

  return v_id;
end;
$$;

revoke execute on function crear_pedido_empresa(jsonb, jsonb) from public, anon;
grant  execute on function crear_pedido_empresa(jsonb, jsonb) to authenticated;

-- =========================================================
-- 5. Row Level Security
-- =========================================================
alter table empresa_bolsas enable row level security;

drop policy if exists "auth_all" on empresa_bolsas;
create policy "auth_all" on empresa_bolsas
  for all to authenticated using (true) with check (true);
