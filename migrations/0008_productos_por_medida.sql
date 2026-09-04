-- Inventario / Lavandería — productos que se cobran por medida
--
-- Hasta acá todo el catálogo se cobraba por pieza. Pero las alfombras se
-- cobran por metro cuadrado y las cortinas por metro lineal, así que el precio
-- del producto no alcanza: hay que medir la prenda.
--
-- El importe de una línea pasa a ser:
--
--     precio_unidad × medida cobrada × cantidad de piezas
--
-- donde la medida cobrada vale 1 para lo que va por unidad. De esa forma
-- `cantidad` sigue significando piezas en todos lados y las 10.027 líneas que
-- ya existen no cambian de sentido: quedan en 'unidad' con medida 1.
--
-- La medida se redondea hacia arriba al medio metro. Una alfombra de
-- 1,4 × 2,1 da 2,94 m² y se cobra 3,0; una cortina de 2,3 m se cobra 2,5.
--
-- Solo aplica al mostrador. Los productos de empresa siguen por unidad.
--
-- Idempotente.
--
-- IMPORTANTE: aplicar antes de desplegar el código que la usa.

-- =========================================================
-- 1. Tipo y columnas nuevas
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'unidad_cobro') then
    create type unidad_cobro as enum ('unidad', 'm2', 'metro_lineal');
  end if;
end $$;

alter table productos
  add column if not exists unidad_cobro unidad_cobro not null default 'unidad';

alter table pedidos_items
  add column if not exists unidad_cobro unidad_cobro not null default 'unidad',
  add column if not exists ancho numeric(6,2),
  add column if not exists largo numeric(6,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_items_medidas_positivas'
  ) then
    alter table pedidos_items
      add constraint pedidos_items_medidas_positivas
      check ((ancho is null or ancho > 0) and (largo is null or largo > 0));
  end if;
end $$;

-- =========================================================
-- 2. Medida por la que se multiplica el precio
--
-- Espejo de medidaCobrada() en src/lib/medidas.ts. Los tests de allá fijan
-- que las dos den lo mismo.
-- =========================================================
create or replace function medida_cobrada(
  p_unidad unidad_cobro,
  p_ancho  numeric,
  p_largo  numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_unidad
    when 'unidad' then 1::numeric
    when 'metro_lineal' then
      case when p_largo is null or p_largo <= 0 then null
           else ceil(p_largo * 2) / 2 end
    when 'm2' then
      case when p_ancho is null or p_ancho <= 0
             or p_largo is null or p_largo <= 0 then null
           else ceil(p_ancho * p_largo * 2) / 2 end
  end;
$$;

-- =========================================================
-- 3. crear_pedido, ahora con medidas
--
-- Reemplaza la versión de 0006. El importe se sigue calculando acá y no se
-- toma del cliente, para que no pueda llegar desalineado.
-- =========================================================
create or replace function crear_pedido(p_pedido jsonb, p_items jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     bigint;
  v_item   jsonb;
  v_unidad unidad_cobro;
  v_medida numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  -- Se valida antes de insertar nada: una línea por medida sin medidas
  -- cargadas no tiene importe posible.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_unidad := coalesce((v_item->>'unidad_cobro')::unidad_cobro, 'unidad');
    v_medida := medida_cobrada(
      v_unidad,
      (v_item->>'ancho')::numeric,
      (v_item->>'largo')::numeric
    );
    if v_medida is null then
      raise exception 'Falta la medida de "%"', v_item->>'producto_nombre'
        using errcode = '23514';
    end if;
  end loop;

  insert into pedidos (
    rut_cliente, nombre_cliente, contacto, direccion,
    estado, pagado, forma_pago, monto_abonado, total_venta,
    aviso_enviado, fecha_recepcion, fecha_pago, fecha_entrega, notas
  ) values (
    p_pedido->>'rut_cliente',
    p_pedido->>'nombre_cliente',
    p_pedido->>'contacto',
    p_pedido->>'direccion',
    coalesce((p_pedido->>'estado')::estado_pedido, 'recibido'),
    coalesce((p_pedido->>'pagado')::boolean, false),
    coalesce((p_pedido->>'forma_pago')::forma_pago, 'no_pago'),
    coalesce((p_pedido->>'monto_abonado')::numeric, 0),
    coalesce((p_pedido->>'total_venta')::numeric, 0),
    false,
    coalesce((p_pedido->>'fecha_recepcion')::timestamptz, now()),
    (p_pedido->>'fecha_pago')::timestamptz,
    (p_pedido->>'fecha_entrega')::timestamptz,
    p_pedido->>'notas'
  )
  returning id into v_id;

  insert into pedidos_items (
    pedido_id, producto_id, producto_nombre, producto_tipo_servicio,
    unidad_cobro, ancho, largo,
    precio_unidad, cantidad, importe, detalle_prenda
  )
  select
    v_id,
    it->>'producto_id',
    it->>'producto_nombre',
    (it->>'producto_tipo_servicio')::tipo_servicio,
    coalesce((it->>'unidad_cobro')::unidad_cobro, 'unidad'),
    (it->>'ancho')::numeric,
    (it->>'largo')::numeric,
    (it->>'precio_unidad')::numeric,
    (it->>'cantidad')::integer,
    round(
      (it->>'precio_unidad')::numeric
      * medida_cobrada(
          coalesce((it->>'unidad_cobro')::unidad_cobro, 'unidad'),
          (it->>'ancho')::numeric,
          (it->>'largo')::numeric
        )
      * (it->>'cantidad')::integer
    ),
    it->>'detalle_prenda'
  from jsonb_array_elements(p_items) as it;

  return v_id;
end;
$$;

-- =========================================================
-- 4. Permisos
-- =========================================================
revoke execute on function crear_pedido(jsonb, jsonb) from public, anon;
grant execute on function crear_pedido(jsonb, jsonb) to authenticated;

revoke execute on function medida_cobrada(unidad_cobro, numeric, numeric)
  from public, anon;
grant execute on function medida_cobrada(unidad_cobro, numeric, numeric)
  to authenticated;
