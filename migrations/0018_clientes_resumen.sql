-- Inventario / Lavandería — el listado de clientes en una sola consulta
--
-- La búsqueda de clientes hacía dos viajes: uno por los 50 clientes y otro
-- que se descargaba **todos los pedidos de esos 50** —paginando de a mil—
-- para después contarlos en JavaScript y quedarse con la fecha del último.
-- Medido contra esta base: 325 filas y 25 KB bajados para calcular un número
-- y una fecha.
--
-- Cada viaje a Supabase cuesta entre 0,6 y 0,8 segundos desde acá, así que el
-- segundo pesa más que todo lo que se hace con él. Contar es trabajo de la
-- base, que además ya tiene el índice justo: `pedidos (rut_cliente,
-- fecha_recepcion desc)`, de la 0001.
--
-- Se hace con una vista y no con una función para que PostgREST la pueda
-- filtrar y ordenar como a cualquier tabla: la búsqueda sigue siendo el mismo
-- `or(...)` de antes, solo que contra esto.
--
-- Idempotente.

-- `security_invoker` para que la vista se lea con los permisos de quien
-- consulta y no con los del dueño: sin eso, una vista es un agujero por donde
-- se leen tablas que RLS tendría cerradas. Hoy clientes y pedidos están
-- abiertos a cualquier autenticado, pero el día que dejen de estarlo esto ya
-- hace lo correcto.
create or replace view clientes_resumen
with (security_invoker = true) as
select c.rut,
       c.nombre,
       c.comuna,
       c.calle,
       c.dpto,
       c.telefono,
       c.correo,
       coalesce(p.cuantos, 0)::integer as pedidos_count,
       p.ultimo                        as ultimo_pedido
  from clientes c
  left join (
    select rut_cliente,
           count(*)             as cuantos,
           max(fecha_recepcion) as ultimo
      from pedidos
     group by rut_cliente
  ) p on p.rut_cliente = c.rut;

comment on view clientes_resumen is
  'Clientes con su cantidad de pedidos y la fecha del ultimo. Reemplaza el '
  'conteo en JavaScript que bajaba todos los pedidos para contarlos.';

grant select on clientes_resumen to authenticated;
