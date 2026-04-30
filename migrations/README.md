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
