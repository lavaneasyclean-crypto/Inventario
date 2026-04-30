-- Inventario / Lavandería — esquema inicial
-- Migración desde "Datos Lavanderia.accdb" (Microsoft Access)
-- Postgres 15+ (Supabase)
--
-- Idempotente: se puede re-ejecutar de manera segura. Si ya hubo un intento
-- previo (parcial o completo), el bloque de cleanup limpia y rearma todo.

-- =========================================================
-- Cleanup (drop si quedó algo de un intento previo)
-- =========================================================
drop table if exists _import_cuarentena    cascade;
drop table if exists auditoria             cascade;
drop table if exists pedidos_empresa_items cascade;
drop table if exists pedidos_empresa       cascade;
drop table if exists pedidos_items         cascade;
drop table if exists pedidos               cascade;
drop table if exists clientes_empresa      cascade;
drop table if exists clientes              cascade;
drop table if exists productos_empresa     cascade;
drop table if exists productos             cascade;

drop type if exists estado_pedido cascade;
drop type if exists forma_pago    cascade;
drop type if exists tipo_servicio cascade;

drop function if exists set_updated_at() cascade;

-- =========================================================
-- ENUMs
-- =========================================================
create type tipo_servicio as enum (
  'lavado',
  'seco',
  'planchado',
  'manchas',
  'aplicaciones',
  'ganchos',
  'delivery',
  'pedido_especial',
  'descuento',
  'secado'
);

create type forma_pago as enum (
  'efectivo',
  'transferencia',
  'redcompra',
  'no_pago'
);

-- Modelo simplificado: 4 estados operativos en vez de 3 booleans separados.
-- (pagado y aviso_enviado siguen siendo flags porque son ortogonales).
create type estado_pedido as enum (
  'recibido',   -- ingresado, en proceso de lavado/planchado
  'listo',      -- terminado, esperando retiro
  'entregado',  -- retirado por el cliente
  'anulado'     -- pedido cancelado (no en Access; útil hacia adelante)
);

-- =========================================================
-- Helper: trigger updated_at
-- =========================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- Catálogo
-- =========================================================
create table productos (
  id            text primary key,
  nombre        text not null,
  tipo_servicio tipo_servicio not null,
  precio        integer not null,                     -- puede ser negativo (descuentos)
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger productos_updated before update on productos
  for each row execute function set_updated_at();
create index productos_tipo_idx on productos (tipo_servicio) where activo;

create table productos_empresa (
  id          text primary key,
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger productos_empresa_updated before update on productos_empresa
  for each row execute function set_updated_at();

-- =========================================================
-- Clientes
-- =========================================================
create table clientes (
  rut         text primary key,
  nombre      text,
  comuna      text,
  calle       text,
  dpto        text,
  telefono    text,
  correo      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger clientes_updated before update on clientes
  for each row execute function set_updated_at();
create index clientes_nombre_lower_idx on clientes (lower(nombre)) where nombre is not null;
create index clientes_telefono_idx     on clientes (telefono)      where telefono is not null;

create table clientes_empresa (
  rut         text primary key,
  nombre      text not null,
  alias       text,
  comuna      text,
  calle       text,
  contacto_1  text,
  contacto_2  text,
  correo      text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger clientes_empresa_updated before update on clientes_empresa
  for each row execute function set_updated_at();

-- =========================================================
-- Pedidos retail
-- =========================================================
create table pedidos (
  id              bigint primary key,                       -- preserva ID_Pedido del Access
  rut_cliente     text references clientes(rut) on update cascade,
  nombre_cliente  text,                                     -- snapshot al crear el pedido
  contacto        text,
  direccion       text,
  estado          estado_pedido not null default 'recibido',
  pagado          boolean not null default false,
  forma_pago      forma_pago not null default 'no_pago',
  monto_abonado   numeric(12,2) not null default 0,
  total_venta     numeric(12,2) not null default 0,         -- snapshot calculado al cierre
  aviso_enviado   boolean not null default false,
  fecha_recepcion timestamptz not null,
  fecha_pago      timestamptz,
  fecha_entrega   timestamptz,                              -- prometida al cliente
  fecha_retiro    timestamptz,                              -- efectiva al entregar
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger pedidos_updated before update on pedidos
  for each row execute function set_updated_at();
create index pedidos_fecha_recepcion_idx  on pedidos (fecha_recepcion desc);
create index pedidos_estado_fecha_idx     on pedidos (estado, fecha_recepcion desc);
create index pedidos_pagado_fecha_idx     on pedidos (pagado, fecha_recepcion desc);
create index pedidos_rut_cliente_idx      on pedidos (rut_cliente, fecha_recepcion desc);

create sequence if not exists pedidos_id_seq;
alter table pedidos alter column id set default nextval('pedidos_id_seq');
alter sequence pedidos_id_seq owned by pedidos.id;

create table pedidos_items (
  id                       bigserial primary key,
  pedido_id                bigint not null references pedidos(id) on delete cascade,
  producto_id              text,                              -- snapshot del catálogo (puede haberse desactivado)
  producto_nombre          text not null,                     -- snapshot
  producto_tipo_servicio   tipo_servicio not null,            -- snapshot
  precio_unidad            numeric(12,2) not null,            -- puede ser negativo (descuentos)
  cantidad                 integer not null check (cantidad > 0),
  importe                  numeric(12,2) not null,            -- puede ser negativo (descuentos)
  detalle_prenda           text,
  created_at               timestamptz not null default now()
);
create index pedidos_items_pedido_idx on pedidos_items (pedido_id);

-- =========================================================
-- Pedidos empresa
-- =========================================================
create table pedidos_empresa (
  id              bigint primary key,                       -- preserva ID_Pedido_Empresa del Access
  rut_empresa     text references clientes_empresa(rut) on update cascade,
  alias           text,
  fecha           timestamptz not null,
  detalle         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger pedidos_empresa_updated before update on pedidos_empresa
  for each row execute function set_updated_at();
create index pedidos_empresa_fecha_idx on pedidos_empresa (fecha desc);
create index pedidos_empresa_rut_idx   on pedidos_empresa (rut_empresa, fecha desc);

create sequence if not exists pedidos_empresa_id_seq;
alter table pedidos_empresa alter column id set default nextval('pedidos_empresa_id_seq');
alter sequence pedidos_empresa_id_seq owned by pedidos_empresa.id;

create table pedidos_empresa_items (
  id                          bigserial primary key,
  pedido_empresa_id           bigint not null references pedidos_empresa(id) on delete cascade,
  producto_empresa_id         text,
  producto_empresa_nombre     text not null,
  cantidad                    integer not null check (cantidad > 0),
  detalle_prenda              text,
  created_at                  timestamptz not null default now()
);
create index pedidos_empresa_items_pedido_idx
  on pedidos_empresa_items (pedido_empresa_id);

-- =========================================================
-- Auditoría — para cambios sensibles (precios, anulaciones, edición de pagos)
-- =========================================================
create table auditoria (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  user_email  text,
  entidad     text not null,             -- 'pedido', 'producto', etc.
  entidad_id  text not null,
  accion      text not null,             -- 'edit', 'anular', 'cambio_precio', etc.
  antes       jsonb,
  despues     jsonb
);
create index auditoria_entidad_idx on auditoria (entidad, entidad_id, ts desc);
create index auditoria_ts_idx      on auditoria (ts desc);

-- =========================================================
-- Cuarentena: filas que el ETL no pudo importar limpias
-- =========================================================
create table _import_cuarentena (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  origen      text not null,             -- nombre de la tabla del Access
  motivo      text not null,             -- por qué se descartó
  payload     jsonb not null             -- la fila original tal cual
);

-- =========================================================
-- Row Level Security — acceso solo a usuarios autenticados
-- =========================================================
alter table productos             enable row level security;
alter table productos_empresa     enable row level security;
alter table clientes              enable row level security;
alter table clientes_empresa      enable row level security;
alter table pedidos               enable row level security;
alter table pedidos_items         enable row level security;
alter table pedidos_empresa       enable row level security;
alter table pedidos_empresa_items enable row level security;
alter table auditoria             enable row level security;
alter table _import_cuarentena    enable row level security;

create policy "auth_all" on productos             for all to authenticated using (true) with check (true);
create policy "auth_all" on productos_empresa     for all to authenticated using (true) with check (true);
create policy "auth_all" on clientes              for all to authenticated using (true) with check (true);
create policy "auth_all" on clientes_empresa      for all to authenticated using (true) with check (true);
create policy "auth_all" on pedidos               for all to authenticated using (true) with check (true);
create policy "auth_all" on pedidos_items         for all to authenticated using (true) with check (true);
create policy "auth_all" on pedidos_empresa       for all to authenticated using (true) with check (true);
create policy "auth_all" on pedidos_empresa_items for all to authenticated using (true) with check (true);
create policy "auth_read" on auditoria            for select to authenticated using (true);
create policy "auth_read" on _import_cuarentena   for select to authenticated using (true);
