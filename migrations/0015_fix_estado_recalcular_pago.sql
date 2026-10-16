-- Inventario / Lavandería — registrar un pago fallaba siempre
--
-- `0011_facturas_abonos.sql` dejó `recalcular_pago_factura` escribiendo el
-- estado así:
--
--     estado = case
--                when f.estado = 'anulada' then 'anulada'
--                when f.total > 0 and v_pagado >= f.total then 'pagada'
--                else 'pendiente'
--              end
--
-- Las tres ramas son literales sin tipo, así que Postgres resuelve el CASE
-- completo como `text`. `facturas.estado` es `estado_factura`, y de text a
-- enum no hay conversión implícita en un UPDATE. El motor cortaba con:
--
--     42804: column "estado" is of type estado_factura
--            but expression is of type text
--
-- El trigger `facturas_abonos_recalcular` llama a esta función, y como es
-- AFTER INSERT su fallo se llevaba puesto el INSERT entero: el abono no se
-- escribía. En pantalla salía el mensaje genérico de `src/lib/errores.ts`,
-- porque 42804 no está entre los códigos con explicación propia.
--
-- Las otras dos asignaciones del mismo UPDATE se salvaron de casualidad:
-- `fecha_pago` y `forma_pago` tienen ramas con tipo (`f.fecha_pago`,
-- `v_forma`), así que el CASE resuelve al tipo de la columna.
--
-- Nunca funcionó en producción. El backfill de 0011 no lo delató porque corrió
-- con `facturas` vacía: el UPDATE no se ejecutó ni una vez. Las facturas
-- entraron después, y desde entonces todo intento de cobro falló en silencio.
--
-- Idempotente.

create or replace function recalcular_pago_factura(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pagado integer;
  v_fecha  date;
  v_forma  forma_pago;
begin
  select coalesce(sum(monto), 0)
    into v_pagado
    from facturas_abonos
   where factura_id = p_id;

  -- El último abono define la fecha y la forma que muestra la cabecera.
  select fecha, forma_pago
    into v_fecha, v_forma
    from facturas_abonos
   where factura_id = p_id
   order by fecha desc, id desc
   limit 1;

  update facturas f
     set monto_pagado = v_pagado,
         -- El cast es lo que arregla el bug: sin él el CASE es text y el
         -- UPDATE no compila contra una columna enum.
         estado = (case
                     when f.estado = 'anulada' then 'anulada'
                     when f.total > 0 and v_pagado >= f.total then 'pagada'
                     else 'pendiente'
                   end)::estado_factura,
         -- La restricción facturas_pago_coherente exige fecha solo cuando está
         -- pagada: un pago parcial deja la factura pendiente y sin fecha.
         fecha_pago = case
                        when f.estado = 'anulada' then f.fecha_pago
                        when f.total > 0 and v_pagado >= f.total then v_fecha
                        else null
                      end,
         forma_pago = case
                        when f.estado = 'anulada' then f.forma_pago
                        else v_forma
                      end
   where f.id = p_id;
end;
$$;

revoke execute on function recalcular_pago_factura(bigint) from public, anon;
grant  execute on function recalcular_pago_factura(bigint) to authenticated;

-- Ahora sí corre de verdad. Con la tabla de abonos vacía esto no mueve nada
-- —todas quedan pendientes con saldo completo, que es lo que ya son— pero deja
-- la cuenta hecha para las que ya tengan abonos cuando se vuelva a aplicar.
select recalcular_pago_factura(id) from facturas;
