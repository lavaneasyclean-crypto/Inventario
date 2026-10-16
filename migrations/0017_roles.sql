-- Inventario / Lavandería — roles: quién ve las finanzas
--
-- Hasta acá todas las tablas tenían la misma política: `auth_all`, cualquier
-- usuario autenticado hace todo. Alcanzaba con una sola cuenta. Con gente de
-- ventas usando la app, no: las facturas, los gastos, lo que nos deben y a
-- quién le pagamos no son datos de mostrador.
--
-- Esconder el menú no sirve. La app habla con PostgREST y las tablas están
-- expuestas por HTTP: quien tenga una sesión válida puede pedir `facturas`
-- directamente aunque no vea el botón. La única frontera real es RLS.
--
-- Idempotente.

-- =========================================================
-- 1. El rol
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario') then
    create type rol_usuario as enum ('admin', 'ventas');
  end if;
end $$;

-- `ventas` es el default a propósito: una cuenta nueva nace sin acceso a la
-- plata y hay que promoverla a mano. Al revés, un olvido la deja viendo todo.
create table if not exists perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  rol        rol_usuario not null default 'ventas',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists perfiles_updated on perfiles;
create trigger perfiles_updated before update on perfiles
  for each row execute function set_updated_at();

-- =========================================================
-- 2. Cada cuenta nueva estrena su perfil
--
-- Sin esto habría que acordarse de crear la fila a mano cada vez que se da de
-- alta a alguien, y una cuenta sin perfil no es ni admin ni ventas: no podría
-- entrar a ningún lado y nadie entendería por qué.
-- =========================================================
create or replace function crear_perfil_para_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, email, rol)
  values (new.id, new.email, 'ventas')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function crear_perfil_para_usuario();

-- =========================================================
-- 3. Las cuentas que ya existían
--
-- Los emails van escritos acá porque son tres y están decididos. Para el
-- cuarto, el default de la tabla ya hace lo correcto.
-- =========================================================
insert into perfiles (id, email, rol)
select u.id,
       u.email,
       case
         when u.email in ('ddeocaresp@gmail.com', 'tomasdeocares1999@gmail.com')
           then 'admin'::rol_usuario
         else 'ventas'::rol_usuario
       end
  from auth.users u
on conflict (id) do update
  set rol   = excluded.rol,
      email = excluded.email;

-- =========================================================
-- 4. ¿Quien pregunta es admin?
--
-- `security definer` para que pueda leer `perfiles` sin depender de la
-- política de esa misma tabla: si no, la política de perfiles necesitaría
-- llamar a esta función y se muerde la cola.
--
-- `stable` para que Postgres la evalúe una vez por consulta y no una vez por
-- fila: en un listado de 300 facturas la diferencia se nota.
-- =========================================================
create or replace function es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfiles
     where id = auth.uid()
       and rol = 'admin'
  );
$$;

revoke execute on function es_admin() from public, anon;
grant  execute on function es_admin() to authenticated;

-- =========================================================
-- 5. Quién ve su perfil
--
-- Cada uno ve el suyo —la app necesita saber qué rol tiene para armar el
-- menú— y los admins ven todos. Escribir solo pueden los admins: si ventas
-- pudiera actualizar su propia fila, se haría admin sola y todo esto sobra.
-- =========================================================
alter table perfiles enable row level security;

drop policy if exists "perfil_propio_o_admin" on perfiles;
create policy "perfil_propio_o_admin" on perfiles
  for select to authenticated
  using (id = auth.uid() or es_admin());

drop policy if exists "solo_admin_escribe" on perfiles;
create policy "solo_admin_escribe" on perfiles
  for update to authenticated
  using (es_admin()) with check (es_admin());

-- =========================================================
-- 6. Las tablas de plata pasan a ser de admins
--
-- `facturas_guias` entra en la lista aunque parezca de pedidos: dice qué
-- guías cubre cada factura, y con eso se reconstruye cuánto se le facturó a
-- cada empresa.
--
-- Los pedidos, clientes, empresas y el catálogo NO se tocan: ventas los
-- necesita para trabajar.
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'facturas',
    'facturas_lineas',
    'facturas_guias',
    'facturas_abonos',
    'gastos',
    'proveedores'
  ] loop
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('drop policy if exists "solo_admin" on %I', t);
    execute format(
      'create policy "solo_admin" on %I for all to authenticated '
      'using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;

-- =========================================================
-- 7. El registro de auditoría
--
-- Guarda el detalle de cada movimiento, incluidos los de facturas y abonos:
-- dejarlo abierto seria cerrar la puerta y dejar la ventana. Ninguna pantalla
-- lo lee —solo se escribe—, asi que restringir la lectura no rompe nada.
--
-- El INSERT sigue abierto: ventas tambien genera registros al tocar el
-- catalogo, y si no pudiera escribirlos perderiamos ese rastro.
-- =========================================================
drop policy if exists "auth_read" on auditoria;
drop policy if exists "solo_admin_lee" on auditoria;
create policy "solo_admin_lee" on auditoria
  for select to authenticated
  using (es_admin());
