# Migrations

Cómo aplicar el esquema en Supabase (manual, una sola vez).

## 0001_init.sql

1. Abrir el [SQL Editor de Supabase](https://supabase.com/dashboard) en el proyecto **Inventario**.
2. Crear nueva query, pegar todo el contenido de `0001_init.sql`.
3. Ejecutar (botón **Run** o `Ctrl+Enter`).
4. Verificar en **Table Editor** que aparecen las tablas:
   `productos`, `productos_empresa`, `clientes`, `clientes_empresa`,
   `pedidos`, `pedidos_items`, `pedidos_empresa`, `pedidos_empresa_items`,
   `auditoria`, `_import_cuarentena`.

Después de aplicar el esquema, ejecutar el ETL (`scripts/etl/`).

## Migraciones posteriores

Se aplican igual: pegar el archivo completo en el SQL Editor y ejecutar.
Todas son idempotentes, así que re-ejecutarlas no rompe nada.

| Archivo | Qué hace |
|---|---|
| `0002_recompute_totales.sql` | Backfill de `total_venta` + trigger que lo mantiene sincronizado |
| `0003_auditoria_insert.sql` | Política de INSERT en `auditoria` |
| `0004_empresa_productos.sql` | Junction `empresa_productos` + snapshot de precio en items |
| `0005_pedidos_empresa_anulado.sql` | Columna `anulado` en `pedidos_empresa` |
| `0006_crear_pedido_atomico.sql` | Funciones `crear_pedido` / `crear_pedido_empresa` + resync de secuencias |
| `0007_producto_empresa_atomico.sql` | Función `crear_producto_empresa`, secuencia de numeración y nombres únicos en el catálogo |
| `0008_productos_por_medida.sql` | `unidad_cobro` en productos, medidas en los items y `crear_pedido` recalculado |
| `0009_finanzas.sql` | `facturas`, `facturas_lineas`, `facturas_guias`, `gastos` y la función `registrar_factura` |
| `0010_pedidos_express.sql` | `express` en las guías, `recargo_express` por empresa y `crear_pedido_empresa` recalculado |
| `0011_facturas_abonos.sql` | `facturas_abonos` + `monto_pagado` mantenido por trigger: una factura se puede pagar de a poco |
| `0012_bolsas_por_trabajador.sql` | `empresa_bolsas`, `usa_bolsas` por empresa, la bolsa en cada línea y `crear_pedido_empresa` recalculado |

⚠️ **De la `0006` a la `0012` hay que aplicarlas antes de desplegar el código
que las usa.** La app crea los pedidos, los productos de
empresa y las facturas llamando a esas funciones; si no existen todavía, los
botones de guardar fallan con el aviso "falta aplicar una migración".

`crear_pedido_empresa` se redefine tres veces: nace en `0006`, le agrega
`express` la `0010` y la bolsa la `0012`. Hay que aplicarlas en orden; en una
base nueva el orden numérico ya lo resuelve.

Nota sobre `0007`: si el catálogo heredado del Access ya trae nombres
repetidos en `productos_empresa`, el índice único no se crea y la migración lo
avisa por consola (`raise notice`). El resto sí se aplica, y la función valida
igual, así que no se generan duplicados nuevos. Para cerrar el tema hay que
unificar los repetidos a mano y volver a correr la migración.
