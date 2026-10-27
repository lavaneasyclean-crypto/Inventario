-- Inventario / Lavandería — qué significa el precio de cada empresa
--
-- El problema
-- -----------
-- La app asumió siempre que el precio guardado es **neto** y que el IVA se
-- suma al facturar. Casi todas las empresas trabajan así.
--
-- Pero hay acuerdos cerrados al revés: con El Cubo la carga de toallas son
-- $2.000 el kilo **con IVA incluido**. Para meter eso en una columna que se
-- interpreta como neta hay que dividir a mano, y ahí aparece el error
-- clásico: multiplicar por 0,81 en vez de dividir por 1,19.
--
--   1 / 1,19 = 0,8403    y no    0,81
--
-- No son lo mismo, y la diferencia se cobra de menos:
--
--   $2.000 con IVA
--     mal   2.000 x 0,81 = 1.620  ->  +19% = 1.928   faltan $72
--     bien  2.000 / 1,19 = 1.681  ->  +19% = 2.000
--
-- Eso es exactamente lo que estaba cargado: $1.620 el kilo y $1.215 el
-- delivery, los dos el 81% de su precio real.
--
-- La solución
-- -----------
-- Guardar el precio **tal como se acordó** y anotar en qué modo está. La
-- cuenta la hace la app, y en modo "con IVA" la hace hacia atrás: el total
-- es el número acordado y el neto sale de dividir. Así el total da exacto en
-- vez de arrastrar los centavos que una columna entera no puede guardar.
--
--   $2.000 x 6 kilos + $1.500 de delivery, con IVA incluido
--     total  13.500   <- exacto, es lo acordado
--     neto   11.345
--     IVA     2.155   <- por diferencia, para que neto + IVA dé el total
--
-- El default es `false` —precio neto— porque es lo que hacen casi todas y lo
-- que la app venía asumiendo: ninguna empresa cambia de comportamiento al
-- correr esto.
--
-- Idempotente.

alter table clientes_empresa
  add column if not exists precios_con_iva boolean not null default false;

comment on column clientes_empresa.precios_con_iva is
  'true = los precios de esta empresa ya incluyen IVA; el neto se calcula '
  'dividiendo por 1,19 al facturar. false (default) = precios netos, el IVA '
  'se suma encima.';
