-- Inventario / Lavandería — proveedores con ficha propia
--
-- Hasta acá `gastos.proveedor` era texto libre. Alcanzaba mientras el dato
-- fuera "Mercado Libre", pero no cuando el proveedor es una persona a la que
-- hay que transferirle: ahí hacen falta su RUT, con quién se habla y los datos
-- de la cuenta, y escribirlos en cada gasto es repetirlos y equivocarse.
--
-- El texto libre además no se puede corregir: si un mes se escribe mal, queda
-- un proveedor fantasma que nadie encuentra después.
--
-- Idempotente.

-- =========================================================
-- 1. Tipo de cuenta bancaria
--
-- Enum y no texto por lo mismo que `forma_pago`: son cuatro valores que no
-- cambian, y escritos a mano terminan en "cte", "Cuenta Corriente" y "cta cte"
-- para la misma cosa.
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_cuenta') then
    create type tipo_cuenta as enum (
      'corriente',
      'vista',
      'ahorro',
      'cuenta_rut'
    );
  end if;
end $$;

-- =========================================================
-- 2. Los proveedores
--
-- Todo opcional menos el nombre. Mercado Libre no tiene RUT que nos importe
-- ni cuenta a la que transferir; la persona del detergente tiene las dos
-- cosas. Exigir cualquiera de esos campos trabaría justo el caso fácil.
--
-- `contacto` es el nombre de la persona con quien se habla, que no siempre es
-- el nombre del proveedor: en una empresa es el vendedor.
--
-- `titular` y `rut_titular` existen porque la cuenta no siempre está a nombre
-- de quien nos vende. Vacíos significan "la cuenta es del proveedor".
-- =========================================================
create table if not exists proveedores (
  id            bigserial primary key,
  nombre        text not null,
  rut           text,
  contacto      text,
  telefono      text,
  correo        text,
  direccion     text,
  comuna        text,
  giro          text,
  -- Datos para transferir
  banco         text,
  tipo_cuenta   tipo_cuenta,
  numero_cuenta text,
  titular       text,
  rut_titular   text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists proveedores_updated on proveedores;
create trigger proveedores_updated before update on proveedores
  for each row execute function set_updated_at();

-- Mismo criterio que el catálogo de prendas (0007): el nombre es único sin
-- importar mayúsculas ni espacios de más, para que no convivan "Mercado Libre"
-- y "mercado libre" como dos proveedores distintos.
create unique index if not exists proveedores_nombre_uniq
  on proveedores (lower(btrim(nombre)));

-- El RUT identifica de verdad: dos fichas con el mismo RUT son la misma
-- persona cargada dos veces. Parcial porque la mayoría no va a tener RUT.
create unique index if not exists proveedores_rut_uniq
  on proveedores (rut) where rut is not null;

create index if not exists proveedores_activo_idx
  on proveedores (activo, nombre);

-- =========================================================
-- 3. El gasto apunta al proveedor
--
-- `on delete restrict`: borrar un proveedor que tiene gastos dejaría esos
-- gastos sin decir a quién se le pagó, que es justo el dato que se quiere
-- guardar. Un proveedor que ya no se usa se desactiva, no se borra.
-- =========================================================
alter table gastos
  add column if not exists proveedor_id bigint
    references proveedores(id) on delete restrict;

create index if not exists gastos_proveedor_idx
  on gastos (proveedor_id);

-- =========================================================
-- 4. Los proveedores que ya estaban escritos a mano
--
-- Cada texto distinto pasa a ser una ficha, y su gasto queda apuntando a
-- ella. Se agrupa por `lower(btrim(...))` para que dos escrituras de lo mismo
-- no creen dos fichas; el nombre que queda es el primero que entró.
--
-- Todo el bloque mira si la columna vieja todavía existe: así la migración se
-- puede volver a correr una vez que la columna ya no está.
-- =========================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'gastos'
       and column_name  = 'proveedor'
  ) then
    insert into proveedores (nombre)
    select distinct on (lower(btrim(g.proveedor))) btrim(g.proveedor)
      from gastos g
     where g.proveedor is not null
       and btrim(g.proveedor) <> ''
       and not exists (
         select 1 from proveedores p
          where lower(btrim(p.nombre)) = lower(btrim(g.proveedor))
       )
     order by lower(btrim(g.proveedor)), g.id;

    update gastos g
       set proveedor_id = p.id
      from proveedores p
     where g.proveedor_id is null
       and g.proveedor is not null
       and lower(btrim(p.nombre)) = lower(btrim(g.proveedor));

    alter table gastos drop column proveedor;
  end if;
end $$;

-- =========================================================
-- 5. Row Level Security
-- =========================================================
alter table proveedores enable row level security;

drop policy if exists "auth_all" on proveedores;
create policy "auth_all" on proveedores
  for all to authenticated using (true) with check (true);
