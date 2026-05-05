-- Inventario / Lavandería — productos por empresa (many-to-many)
--
-- Cada producto sigue siendo global (productos_empresa) pero ahora cada
-- empresa "adquiere" los items que usa, con su propio precio. La tabla
-- de items de pedidos guarda un snapshot del precio al momento del pedido
-- para que la facturación quede congelada y los cambios futuros de
-- precio no afecten histórico.
--
-- Idempotente: se puede re-ejecutar sin pérdida de datos.

-- =========================================================
-- 1. Junction empresa_productos
-- =========================================================
create table if not exists empresa_productos (
  rut_empresa          text not null references clientes_empresa(rut) on update cascade on delete cascade,
  producto_empresa_id  text not null references productos_empresa(id) on update cascade on delete cascade,
  precio               integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (rut_empresa, producto_empresa_id)
);

create index if not exists empresa_productos_empresa_idx
  on empresa_productos (rut_empresa);
create index if not exists empresa_productos_producto_idx
  on empresa_productos (producto_empresa_id);

drop trigger if exists empresa_productos_updated on empresa_productos;
create trigger empresa_productos_updated
  before update on empresa_productos
  for each row execute function set_updated_at();

alter table empresa_productos enable row level security;
drop policy if exists "auth_all" on empresa_productos;
create policy "auth_all" on empresa_productos
  for all to authenticated using (true) with check (true);

-- =========================================================
-- 2. Snapshot de precio en items
-- =========================================================
alter table pedidos_empresa_items
  add column if not exists precio_unidad integer,
  add column if not exists importe       integer;

-- =========================================================
-- 3. Migración inteligente: para cada (empresa, producto) que aparezca
--    alguna vez en el histórico, crear la adquisición. Los precios
--    quedan en NULL — el usuario los va completando a su ritmo.
-- =========================================================
insert into empresa_productos (rut_empresa, producto_empresa_id)
select distinct p.rut_empresa, pei.producto_empresa_id
from pedidos_empresa_items pei
join pedidos_empresa p on p.id = pei.pedido_empresa_id
where pei.producto_empresa_id is not null
  and p.rut_empresa is not null
on conflict do nothing;
