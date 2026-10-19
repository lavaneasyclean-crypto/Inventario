-- Inventario / Lavandería — el historial se escribe solo
--
-- El problema
-- -----------
-- La tabla `auditoria` existe desde el principio y está **vacía**: 0 filas.
-- Solo dos archivos escriben en ella (catálogo y finanzas) y lo hacen a mano,
-- llamando a un helper. Los pedidos y las guías —que es donde de verdad
-- importa saber quién tocó qué— no registran nada.
--
-- Instrumentar las 28 acciones una por una tiene un problema que no se
-- arregla revisando bien: la número 29 se escribe el mes que viene y nadie se
-- acuerda. Y los scripts del ETL, que escriben por fuera de la app, no pasan
-- por ninguna de ellas.
--
-- Por eso esto va en la base. Un trigger no se puede olvidar ni saltar: toda
-- escritura queda, venga de la app, de un script o de la consola de Supabase.
--
-- Qué guarda
-- ----------
-- Solo **lo que cambió**. Guardar la fila entera en cada update hace un
-- historial ilegible: hay que comparar dos bloques de JSON a ojo para
-- descubrir que lo único distinto era el estado. Acá `antes` y `despues`
-- traen únicamente las claves que difieren.
--
-- `created_at` y `updated_at` se descartan: `updated_at` cambia en *todas*
-- las ediciones y no dice nada que la columna `ts` no diga mejor.
--
-- Quién lo hizo
-- -------------
-- Sale de `auth.uid()`, que PostgREST deja disponible en la transacción. Los
-- scripts del ETL usan la service role, que no tiene usuario: ahí queda en
-- null y se muestra como "script / ETL", que es la verdad.
--
-- Por qué no audito las líneas
-- ----------------------------
-- Guardar una guía reemplaza todas sus líneas. En Termomin son hasta 160:
-- auditarlas fila por fila deja 320 registros por cada vez que alguien aprieta
-- guardar, y el historial se vuelve inservible. El resumen de esos cambios lo
-- escribe el server action, que sí sabe contar prendas antes y después.
--
-- Idempotente.

-- =========================================================
-- 1. La función
--
-- `security definer` para que nunca falle por permisos: el historial no puede
-- depender de que quien escribe tenga derecho a escribirlo.
-- =========================================================
create or replace function auditar_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes    jsonb := '{}'::jsonb;
  v_despues  jsonb := '{}'::jsonb;
  v_fila     jsonb;
  v_vieja    jsonb;
  v_clave    text;
  v_id       text;
  v_email    text;
  v_accion   text;
  -- Las que cambian solas y solo hacen ruido.
  v_ruido    text[] := array['created_at', 'updated_at'];
begin
  -- El id de la fila: los nombres de las columnas que forman la clave vienen
  -- como argumentos del trigger, porque no todas las tablas usan "id"
  -- (clientes_empresa usa el rut, empresa_productos usa dos columnas).
  v_fila  := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_id    := '';
  foreach v_clave in array TG_ARGV loop
    v_id := v_id || case when v_id = '' then '' else '|' end
                 || coalesce(v_fila ->> v_clave, '');
  end loop;

  if TG_OP = 'INSERT' then
    v_accion  := 'alta';
    v_despues := v_fila - v_ruido;

  elsif TG_OP = 'DELETE' then
    v_accion := 'baja';
    v_antes  := to_jsonb(OLD) - v_ruido;

  else
    v_accion := 'edicion';
    v_vieja  := to_jsonb(OLD);
    -- Solo las claves cuyo valor es distinto.
    for v_clave in select jsonb_object_keys(v_fila) loop
      if v_clave = any(v_ruido) then
        continue;
      end if;
      if (v_fila -> v_clave) is distinct from (v_vieja -> v_clave) then
        v_antes   := v_antes   || jsonb_build_object(v_clave, v_vieja -> v_clave);
        v_despues := v_despues || jsonb_build_object(v_clave, v_fila  -> v_clave);
      end if;
    end loop;

    -- Un update que no cambió nada no es un cambio. Pasa seguido: guardar un
    -- formulario sin tocar nada, o un trigger que recalcula y deja lo mismo.
    if v_antes = '{}'::jsonb then
      return null;
    end if;
  end if;

  select email into v_email from perfiles where id = auth.uid();

  insert into auditoria (user_email, entidad, entidad_id, accion, antes, despues)
  values (
    v_email,
    TG_TABLE_NAME,
    v_id,
    v_accion,
    case when v_antes   = '{}'::jsonb then null else v_antes   end,
    case when v_despues = '{}'::jsonb then null else v_despues end
  );

  return null;
exception when others then
  -- El historial no puede voltear la operación real. Si algo acá falla, se
  -- pierde ese registro y la guía se guarda igual: al revés sería peor.
  return null;
end;
$$;

-- =========================================================
-- 2. Los triggers
--
-- Solo cabeceras. Las líneas quedan fuera a propósito (ver arriba).
-- `after` y no `before`: lo que se registra es lo que de verdad quedó
-- escrito, no lo que se intentó escribir.
-- =========================================================
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('pedidos',            array['id']),
      ('pedidos_empresa',    array['id']),
      ('clientes',           array['rut']),
      ('clientes_empresa',   array['rut']),
      ('productos',          array['id']),
      ('productos_empresa',  array['id']),
      ('empresa_bolsas',     array['id']),
      ('empresa_productos',  array['rut_empresa', 'producto_empresa_id'])
    ) as x(tabla, claves)
  loop
    execute format('drop trigger if exists %I on %I',
                   'auditar_' || t.tabla, t.tabla);
    -- Los argumentos de un trigger son literales de texto, no identificadores:
    -- hay que citarlos como tales o Postgres no los acepta.
    execute format(
      'create trigger %I after insert or update or delete on %I '
      'for each row execute function auditar_cambios(%s)',
      'auditar_' || t.tabla, t.tabla,
      (select string_agg(quote_literal(c), ', ') from unnest(t.claves) as c));
  end loop;
end $$;

-- =========================================================
-- 3. Índice para la pantalla
--
-- La pantalla ordena por fecha y filtra por entidad; los dos índices que ya
-- existen desde 0001 cubren eso. Falta el de "qué hizo esta persona".
-- =========================================================
create index if not exists auditoria_user_idx on auditoria (user_email, ts desc);
