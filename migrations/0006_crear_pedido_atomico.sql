-- Inventario / Lavandería — creación atómica de pedidos
--
-- Dos problemas que arrastraba la creación de pedidos desde la app:
--
--  1. El ID se calculaba desde la app con `select max(id)` + 1. Dos pedidos
--     creados a la vez sacaban el mismo número y el segundo chocaba contra la
--     clave primaria. Las secuencias ya existen desde 0001_init y están
--     puestas como default de la columna: alcanza con dejar que el motor
--     asigne el id. Acá solo se resincronizan por las dudas, porque el ETL
--     del Access insertó ids explícitos sin avanzarlas.
--
--  2. El pedido y sus items se insertaban en dos viajes separados. Si el
--     segundo fallaba, la app borraba el pedido "a mano"; si ese borrado
--     también fallaba quedaba un pedido con total y sin líneas. Estas
--     funciones hacen ambas inserciones dentro de una sola transacción.
--
-- El `importe` de cada línea se calcula acá y no se toma del cliente, para
-- que no pueda llegar desalineado del precio por la cantidad.
--
-- Idempotente: se puede re-ejecutar sin problema.
--
-- IMPORTANTE: aplicar esta migración ANTES de desplegar el código que la
-- usa; sin las funciones, crear un pedido falla.

-- =========================================================
-- 1. Resincronizar las secuencias con los datos ya cargados
-- =========================================================
select setval(
  'pedidos_id_seq',
  coalesce((select max(id) from pedidos), 0) + 1,
  false
);

select setval(
  'pedidos_empresa_id_seq',
  coalesce((select max(id) from pedidos_empresa), 0) + 1,
  false
);

-- =========================================================
-- 2. Pedido de mostrador
-- =========================================================
create or replace function crear_pedido(p_pedido jsonb, p_items jsonb)
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
    precio_unidad, cantidad, importe, detalle_prenda
  )
  select
    v_id,
    it->>'producto_id',
    it->>'producto_nombre',
    (it->>'producto_tipo_servicio')::tipo_servicio,
    (it->>'precio_unidad')::numeric,
    (it->>'cantidad')::integer,
    (it->>'precio_unidad')::numeric * (it->>'cantidad')::integer,
    it->>'detalle_prenda'
  from jsonb_array_elements(p_items) as it;

  return v_id;
end;
$$;

-- =========================================================
-- 3. Pedido de empresa
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

  insert into pedidos_empresa (rut_empresa, alias, fecha, detalle)
  values (
    p_pedido->>'rut_empresa',
    p_pedido->>'alias',
    (p_pedido->>'fecha')::timestamptz,
    p_pedido->>'detalle'
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

-- =========================================================
-- 4. Permisos: solo usuarios autenticados
-- =========================================================
revoke execute on function crear_pedido(jsonb, jsonb) from public, anon;
revoke execute on function crear_pedido_empresa(jsonb, jsonb) from public, anon;

grant execute on function crear_pedido(jsonb, jsonb) to authenticated;
grant execute on function crear_pedido_empresa(jsonb, jsonb) to authenticated;
