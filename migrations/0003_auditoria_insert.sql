-- Inventario / Lavandería — permitir insert en auditoría
--
-- La tabla `auditoria` se creó con solo política SELECT para usuarios
-- autenticados. Para registrar cambios (precios, anulaciones, etc.) desde
-- los server actions necesitamos permitir INSERT.
--
-- Idempotente.

drop policy if exists "auth_insert" on auditoria;
create policy "auth_insert" on auditoria
  for insert
  to authenticated
  with check (true);
