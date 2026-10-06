-- Inventario / Lavandería — productos que se facturan pero no van en la grilla
--
-- No todo lo que se le cobra a una empresa es una prenda que viene en una
-- bolsa. Termomín y Termochemical pagan $80.000 de "Traslado" al mes: se
-- factura como una línea más, pero no se reparte entre los trabajadores ni se
-- devuelve a nadie.
--
-- Sin esta distinción, agregar el traslado al catálogo le mete una columna
-- vacía a la grilla de carga, en la pantalla donde más molesta: la que se
-- llena copiando de un papel, columna por columna.
--
-- `en_grilla` default true porque el caso normal es la prenda. Lo que queda en
-- false sigue cobrándose igual —entra al consolidado, a la factura y al
-- total— y solo deja de ocupar una columna que nadie iba a llenar. Tampoco
-- aparece en la hoja de devolución, que es lo correcto: un traslado no se
-- devuelve.
--
-- Idempotente.

alter table empresa_productos
  add column if not exists en_grilla boolean not null default true;

comment on column empresa_productos.en_grilla is
  'false para lo que se factura pero no es una prenda de bolsa (traslado, recargos). No ocupa columna en la grilla de carga.';
