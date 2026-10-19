-- Inventario / Lavandería — cuándo se entregó y cuándo se pagó una guía
--
-- `pedidos_empresa` tenía cinco columnas: id, empresa, fecha, detalle y alias.
-- Ni entrega ni pago. Por eso no se guardaban: no es que fallara, es que
-- nunca se construyó.
--
-- **Entrega**: el caso real es la empresa que dice que no le devolvieron la
-- ropa. Sin fecha no hay con qué responder. Con fecha, la discusión se acaba.
--
-- **Pago**: sirve para las empresas que pagan guía por guía. Ojo con las que
-- se facturan a fin de mes: ahí el pago de verdad vive en la factura, con sus
-- abonos y su saldo (`facturas_abonos`, 0011). Esta fecha no reemplaza eso ni
-- se sincroniza con eso; la pantalla muestra al lado si la guía ya está en una
-- factura, para que nadie las haga decir cosas distintas.
--
-- Las dos van sin bandera de "entregada" o "pagada": la fecha llena ya dice
-- que sí, y una bandera aparte es una oportunidad de que las dos se
-- contradigan.
--
-- Idempotente.

alter table pedidos_empresa
  add column if not exists fecha_entrega timestamptz,
  add column if not exists fecha_pago    timestamptz;

comment on column pedidos_empresa.fecha_entrega is
  'Cuando se devolvio la ropa a la empresa. NULL = todavia no se entrego.';

comment on column pedidos_empresa.fecha_pago is
  'Cuando se pago esta guia. NULL = sin pagar. Para las empresas facturadas '
  'a fin de mes, el pago real vive en la factura.';

-- Para buscar lo que falta entregar sin recorrer la tabla entera.
create index if not exists pedidos_empresa_sin_entregar_idx
  on pedidos_empresa (rut_empresa, fecha)
  where fecha_entrega is null;
