-- Inventario / Lavandería — finanzas: facturas por cobrar y gastos por pagar
--
-- Hasta acá la pantalla de facturación era una calculadora sin memoria:
-- consolidaba las guías del rango, bajaba el Excel, y no dejaba rastro. No
-- había forma de saber qué se facturó, por cuánto, ni si el cliente pagó. Y
-- nada impedía facturar dos veces la misma guía.
--
-- Esta migración agrega las dos mitades del flujo de caja:
--
--   facturas         — lo que nos deben las empresas (por cobrar)
--   gastos           — lo que debemos nosotros: luz, agua, insumos, sueldos
--
-- La factura se guarda con un snapshot completo (`facturas_lineas`) y con las
-- guías que cubre (`facturas_guias`). El snapshot es el punto: si mañana
-- cambia el precio de una sábana, la factura de septiembre tiene que seguir
-- diciendo lo que decía cuando se emitió.
--
-- Plata en `integer`: son pesos chilenos sin decimales, igual que
-- `pedidos_empresa_items.precio_unidad`.
--
-- Fechas en `date` y no `timestamptz`: la fecha de emisión de una factura es
-- un día del calendario, no un instante. Guardarla como timestamp obliga a
-- decidir una hora que nadie eligió y abre el problema de zona horaria que
-- `src/lib/fecha.ts` resuelve para los pedidos. Un `date` viaja como
-- "YYYY-MM-DD", que es justo lo que come un <input type="date">.
--
-- Idempotente: se puede re-ejecutar sin pérdida de datos.
--
-- IMPORTANTE: aplicar esta migración ANTES de desplegar el código que la usa.
-- El botón "Registrar factura" llama a `registrar_factura`; sin la función,
-- falla con el aviso "falta aplicar una migración".

-- =========================================================
-- 1. ENUMs
-- =========================================================

-- 'anulada' en vez de borrar: una factura emitida es un documento tributario,
-- y saber que existió y se anuló es parte del historial. Las anuladas liberan
-- sus guías para volver a facturarlas.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_factura') then
    create type estado_factura as enum ('pendiente', 'pagada', 'anulada');
  end if;
end $$;

-- Un mismo período puede necesitar dos documentos. Haulmer —el facturador
-- electrónico— no acepta muchos items en una factura, así que el recargo por
-- servicio express de un mes se emite aparte: la factura 'normal' cobra todas
-- las guías a precio base y la 'express' cobra solo el porcentaje adicional de
-- las que vinieron apuradas. Las dos cubren las mismas guías, por eso el
-- control de "ya facturada" es por tipo y no a secas. El recargo en sí lo
-- define `0010_pedidos_express.sql`.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_factura') then
    create type tipo_factura as enum ('normal', 'express');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'categoria_gasto') then
    create type categoria_gasto as enum (
      'luz',
      'agua',
      'gas',
      'arriendo',
      'internet',
      'telefono',
      'insumos',
      'remuneraciones',
      'impuestos',
      'mantencion',
      'otros'
    );
  end if;
end $$;

-- =========================================================
-- 2. Facturas (por cobrar)
-- =========================================================
create table if not exists facturas (
  id            bigserial primary key,
  rut_empresa   text not null references clientes_empresa(rut) on update cascade,
  tipo          tipo_factura not null default 'normal',
  -- El folio lo asigna el SII a través del facturador electrónico, no esta
  -- app. Queda en texto y opcional: se registra la factura al emitirla y el
  -- número se completa cuando vuelve del portal.
  folio         text,
  fecha         date not null,
  fecha_vence   date,
  -- Rango de guías que cubre. Informativo (el detalle real está en
  -- facturas_guias), pero permite listar "Factura de septiembre" sin joins.
  periodo_desde date,
  periodo_hasta date,
  neto          integer not null default 0,
  iva           integer not null default 0,
  total         integer not null default 0,
  estado        estado_factura not null default 'pendiente',
  fecha_pago    date,
  forma_pago    forma_pago,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists facturas_updated on facturas;
create trigger facturas_updated before update on facturas
  for each row execute function set_updated_at();

create index if not exists facturas_fecha_idx   on facturas (fecha desc);
create index if not exists facturas_estado_idx  on facturas (estado, fecha desc);
create index if not exists facturas_empresa_idx on facturas (rut_empresa, tipo, fecha desc);

-- Un folio no se repite, pero puede estar vacío en varias facturas todavía
-- sin número: de ahí el índice parcial.
create unique index if not exists facturas_folio_unico
  on facturas (folio) where folio is not null;

-- Coherencia de estado: una factura pagada tiene fecha de pago y una
-- pendiente no. Sin esto se filtran filas "pagadas" sin fecha que después
-- rompen los informes por mes.
--
-- Las anuladas quedan libres a propósito: si se anula una factura que ya
-- estaba pagada, exigirle que borre la fecha de pago sería perder el dato de
-- cuándo entró esa plata.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'facturas_pago_coherente'
  ) then
    alter table facturas add constraint facturas_pago_coherente check (
      (estado = 'pagada'    and fecha_pago is not null) or
      (estado = 'pendiente' and fecha_pago is null)     or
      (estado = 'anulada')
    );
  end if;
end $$;

-- =========================================================
-- 3. Snapshot de las líneas facturadas
--
-- Copia del consolidado al momento de emitir. `precio_unidad` puede ser NULL
-- si el producto todavía no tenía precio para esa empresa: la línea se emitió
-- igual, en cero, y el consolidado lo avisaba en pantalla.
-- =========================================================
create table if not exists facturas_lineas (
  id                  bigserial primary key,
  factura_id          bigint not null references facturas(id) on delete cascade,
  producto_empresa_id text,
  nombre              text not null,
  cantidad            integer not null,
  precio_unidad       integer,
  importe             integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists facturas_lineas_factura_idx
  on facturas_lineas (factura_id);

-- =========================================================
-- 4. Qué guías cubre cada factura
--
-- `on delete restrict` en el pedido: si una guía ya se facturó, borrarla
-- dejaría la factura mintiendo. Primero hay que anular la factura.
--
-- Una guía aparece acá una vez por cada documento que la cubre: la factura
-- normal y, si vino express, también la de recargo. Lo que no puede pasar es
-- que entre dos veces en el mismo tipo.
--
-- Ese control no se puede expresar como índice único: hace falta mirar el
-- `tipo` y el `estado`, que viven en la otra tabla, y una guía de una factura
-- anulada tiene que poder volver a facturarse. Lo hace `registrar_factura`,
-- que bloquea las guías antes de revisar.
-- =========================================================
create table if not exists facturas_guias (
  factura_id        bigint not null references facturas(id) on delete cascade,
  pedido_empresa_id bigint not null references pedidos_empresa(id) on delete restrict,
  primary key (factura_id, pedido_empresa_id)
);

create index if not exists facturas_guias_pedido_idx
  on facturas_guias (pedido_empresa_id);

-- =========================================================
-- 5. Gastos (por pagar)
--
-- Acá `pagado` es un boolean y no un enum, al revés que en facturas: un gasto
-- no es un documento que emitimos nosotros, es una anotación. Si se cargó mal
-- se corrige o se borra, no se anula.
-- =========================================================
create table if not exists gastos (
  id          bigserial primary key,
  categoria   categoria_gasto not null,
  descripcion text not null,
  proveedor   text,
  -- N° de boleta o factura del proveedor, para cruzar con el papel.
  documento   text,
  fecha       date not null,
  fecha_vence date,
  -- Mes al que corresponde el consumo, "YYYY-MM". La boleta de la luz llega
  -- en octubre por el consumo de septiembre, y para comparar meses importa el
  -- segundo, no el primero.
  periodo     text,
  monto       integer not null,
  pagado      boolean not null default false,
  fecha_pago  date,
  forma_pago  forma_pago,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists gastos_updated on gastos;
create trigger gastos_updated before update on gastos
  for each row execute function set_updated_at();

create index if not exists gastos_fecha_idx     on gastos (fecha desc);
create index if not exists gastos_pagado_idx    on gastos (pagado, fecha desc);
create index if not exists gastos_categoria_idx on gastos (categoria, fecha desc);
create index if not exists gastos_periodo_idx   on gastos (periodo) where periodo is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gastos_pago_coherente'
  ) then
    alter table gastos add constraint gastos_pago_coherente check (
      (pagado and fecha_pago is not null) or
      (not pagado and fecha_pago is null)
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gastos_periodo_formato'
  ) then
    alter table gastos add constraint gastos_periodo_formato check (
      periodo is null or periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'
    );
  end if;
end $$;

-- =========================================================
-- 6. Registrar una factura de forma atómica
--
-- Cabecera, líneas y guías en una sola transacción, igual que
-- `crear_pedido`. Si algo falla no queda una factura sin líneas ni guías
-- reservadas contra una factura que no existe.
-- =========================================================
create or replace function registrar_factura(
  p_factura jsonb,
  p_lineas  jsonb,
  p_guias   jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      bigint;
  v_tipo    tipo_factura;
  v_guias   bigint[];
  v_validas integer;
  v_tomadas text;
begin
  v_tipo := coalesce((p_factura->>'tipo')::tipo_factura, 'normal');

  if jsonb_typeof(p_guias) <> 'array' or jsonb_array_length(p_guias) = 0 then
    raise exception 'La factura necesita al menos una guía';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura necesita al menos una línea';
  end if;

  select array_agg(distinct v::bigint)
    into v_guias
    from jsonb_array_elements_text(p_guias) as t(v);

  -- Bloquea las guías antes de mirar si están libres. Se bloquean los pedidos
  -- y no las facturas porque los pedidos siempre existen: si la guía todavía
  -- no está en ninguna factura no habría fila de factura que bloquear, y dos
  -- registros simultáneos la tomarían los dos. Con esto el segundo espera,
  -- vuelve a leer y la encuentra ocupada.
  perform 1 from pedidos_empresa where id = any(v_guias) for update;

  select count(*)
    into v_validas
    from pedidos_empresa pe
   where pe.id = any(v_guias)
     and pe.rut_empresa = p_factura->>'rut_empresa'
     and not pe.anulado;

  if v_validas <> coalesce(array_length(v_guias, 1), 0) then
    raise exception
      'Alguna de las guías no existe, está anulada o no es de esta empresa';
  end if;

  -- ¿Alguna ya está en una factura vigente de este mismo tipo? La normal y la
  -- de recargo cubren las mismas guías sin pisarse.
  select string_agg('guía #' || fg.pedido_empresa_id ||
                    ' (factura #' || f.id || ')', ', ')
    into v_tomadas
    from facturas_guias fg
    join facturas f on f.id = fg.factura_id
   where fg.pedido_empresa_id = any(v_guias)
     and f.tipo = v_tipo
     and f.estado <> 'anulada';

  if v_tomadas is not null then
    raise exception 'Ya facturadas: %', v_tomadas;
  end if;

  insert into facturas (
    rut_empresa, tipo, folio, fecha, fecha_vence,
    periodo_desde, periodo_hasta,
    neto, iva, total, estado, fecha_pago, forma_pago, notas
  ) values (
    p_factura->>'rut_empresa',
    v_tipo,
    nullif(p_factura->>'folio', ''),
    (p_factura->>'fecha')::date,
    (p_factura->>'fecha_vence')::date,
    (p_factura->>'periodo_desde')::date,
    (p_factura->>'periodo_hasta')::date,
    coalesce((p_factura->>'neto')::integer, 0),
    coalesce((p_factura->>'iva')::integer, 0),
    coalesce((p_factura->>'total')::integer, 0),
    'pendiente',
    null,
    null,
    nullif(p_factura->>'notas', '')
  )
  returning id into v_id;

  insert into facturas_lineas (
    factura_id, producto_empresa_id, nombre, cantidad, precio_unidad, importe
  )
  select
    v_id,
    l->>'producto_empresa_id',
    l->>'nombre',
    (l->>'cantidad')::integer,
    (l->>'precio_unidad')::integer,
    coalesce((l->>'importe')::integer, 0)
  from jsonb_array_elements(p_lineas) as l;

  insert into facturas_guias (factura_id, pedido_empresa_id)
  select v_id, unnest(v_guias);

  return v_id;
end;
$$;

-- =========================================================
-- 7. Row Level Security
-- =========================================================
alter table facturas        enable row level security;
alter table facturas_lineas enable row level security;
alter table facturas_guias  enable row level security;
alter table gastos          enable row level security;

drop policy if exists "auth_all" on facturas;
drop policy if exists "auth_all" on facturas_lineas;
drop policy if exists "auth_all" on facturas_guias;
drop policy if exists "auth_all" on gastos;

create policy "auth_all" on facturas        for all to authenticated using (true) with check (true);
create policy "auth_all" on facturas_lineas for all to authenticated using (true) with check (true);
create policy "auth_all" on facturas_guias  for all to authenticated using (true) with check (true);
create policy "auth_all" on gastos          for all to authenticated using (true) with check (true);

revoke execute on function registrar_factura(jsonb, jsonb, jsonb) from public, anon;
grant  execute on function registrar_factura(jsonb, jsonb, jsonb) to authenticated;
