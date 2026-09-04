-- Inventario / Lavandería — catálogo de productos de empresa
--
-- Tres problemas al crear un producto nuevo desde la ficha de una empresa:
--
--  1. El id se calculaba trayendo TODOS los ids de productos_empresa a la app
--     y sacando el máximo en JavaScript. Además de la carrera entre dos
--     creaciones simultáneas, PostgREST devuelve como máximo 1000 filas por
--     defecto: pasado ese tamaño el máximo sale mal y los ids chocan.
--
--  2. El producto y su asignación a la empresa se insertaban en dos viajes,
--     con un borrado de compensación si el segundo fallaba.
--
--  3. Nada impedía cargar dos veces el mismo producto, así que el catálogo se
--     llena de "Sábana C/E" repetidas con ids distintos y cada empresa queda
--     asignada a una diferente.
--
-- Idempotente.
--
-- IMPORTANTE: aplicar antes de desplegar el código que la usa.

-- =========================================================
-- 1. Secuencia para la numeración del catálogo
--
-- Los ids del Access son texto de 3 dígitos ("001".."999"). Se mantiene el
-- formato, pero el número lo entrega una secuencia en vez de un max()+1.
-- =========================================================
create sequence if not exists productos_empresa_num_seq;

select setval(
  'productos_empresa_num_seq',
  coalesce(
    (select max(id::bigint) from productos_empresa where id ~ '^\d+$'),
    0
  ) + 1,
  false
);

-- =========================================================
-- 2. Nombres únicos en el catálogo
--
-- Si el histórico del Access ya trae duplicados, el índice no se puede crear:
-- en ese caso la migración avisa y sigue. La función de más abajo valida
-- igual, así que no se crean nuevos duplicados aunque falte el índice.
-- =========================================================
do $$
declare
  v_duplicados integer;
begin
  select count(*) into v_duplicados
  from (
    select 1
    from productos_empresa
    group by lower(btrim(nombre))
    having count(*) > 1
  ) d;

  if v_duplicados > 0 then
    raise notice
      'productos_empresa tiene % nombre(s) duplicado(s): no se crea el indice unico. Unificalos y volve a correr esta migracion.',
      v_duplicados;
  else
    create unique index if not exists productos_empresa_nombre_uniq
      on productos_empresa (lower(btrim(nombre)));
  end if;
end $$;

-- =========================================================
-- 3. Crear el producto y asignarlo, en una transacción
-- =========================================================
create or replace function crear_producto_empresa(
  p_rut_empresa text,
  p_nombre      text,
  p_precio      integer default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nombre     text := btrim(coalesce(p_nombre, ''));
  v_existente  text;
  v_id         text;
  v_num        bigint;
  v_intentos   integer := 0;
  v_constraint text;
begin
  if v_nombre = '' then
    raise exception 'El producto necesita un nombre' using errcode = '23514';
  end if;

  -- Duplicado por nombre: se reporta como unique_violation para que la app lo
  -- distinga sin tener que leer el texto del mensaje.
  select id into v_existente
  from productos_empresa
  where lower(btrim(nombre)) = lower(v_nombre)
  limit 1;

  if v_existente is not null then
    raise exception 'Ya existe el producto "%" con id %', v_nombre, v_existente
      using errcode = '23505';
  end if;

  loop
    v_intentos := v_intentos + 1;
    v_num := nextval('productos_empresa_num_seq');
    v_id := case
              when v_num < 1000 then lpad(v_num::text, 3, '0')
              else 'EMP' || v_num::text
            end;

    begin
      insert into productos_empresa (id, nombre, activo)
      values (v_id, v_nombre, true);
      exit;
    exception when unique_violation then
      -- Solo se reintenta si el choque fue por el id: un id heredado del
      -- Access puede ocupar ese número. Cualquier otra unicidad se propaga.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'productos_empresa_pkey'
         or v_intentos >= 100 then
        raise;
      end if;
    end;
  end loop;

  insert into empresa_productos (rut_empresa, producto_empresa_id, precio)
  values (p_rut_empresa, v_id, p_precio);

  return v_id;
end;
$$;

-- =========================================================
-- 4. Permisos: solo usuarios autenticados
-- =========================================================
revoke execute on function crear_producto_empresa(text, text, integer)
  from public, anon;
grant execute on function crear_producto_empresa(text, text, integer)
  to authenticated;
