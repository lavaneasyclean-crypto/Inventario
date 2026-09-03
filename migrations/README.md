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

⚠️ **`0006` hay que aplicarla antes de desplegar el código que la usa.** La
app crea los pedidos llamando a esas funciones; si no existen todavía, el
botón "Guardar pedido" falla.
