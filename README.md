# Inventario

Sistema de gestión de pedidos para lavandería. Reemplaza la base de datos Access histórica (`Datos Lavanderia.accdb`) por una app web Next.js + Supabase.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui** + **lucide-react**
- **Supabase** (Postgres + Auth + Storage)
- **react-hook-form** + **zod** para formularios
- Deploy: **Netlify**

## Estructura

```
Inventario/
├── src/
│   ├── app/             # Rutas (App Router)
│   ├── components/ui/   # shadcn/ui components
│   ├── lib/supabase/    # Clientes Supabase (browser, server, admin)
│   └── middleware.ts    # Protección de rutas (auth)
├── migrations/          # SQL de Postgres (ejecutar una vez en Supabase SQL Editor)
├── scripts/etl/         # Migración de datos desde Access
└── _legacy/             # .accdb original (no commiteado)
```

## Setup local

1. **Dependencias**
   ```bash
   npm install
   ```

2. **Variables de entorno**
   ```bash
   cp .env.example .env.local
   # Llenar con credenciales reales de Supabase
   ```

3. **Aplicar esquema en Supabase** (una sola vez, manual)
   - Abrir SQL Editor en el dashboard de Supabase
   - Pegar todo el contenido de `migrations/0001_init.sql`
   - Ejecutar

4. **Migrar datos del Access** (una sola vez)
   ```bash
   pwsh ./scripts/etl/01_export_access.ps1
   python ./scripts/etl/02_load_to_supabase.py
   ```
   Después, ejecutar en SQL Editor:
   ```sql
   select setval('pedidos_id_seq', (select max(id) from pedidos));
   select setval('pedidos_empresa_id_seq', (select max(id) from pedidos_empresa));
   ```

5. **Crear cuenta de usuario** en Supabase Auth
   - Authentication → Users → Add user
   - Email: `lavaneasyclean@gmail.com`, password fija
   - Authentication → Settings: desactivar "Enable email confirmations"

6. **Correr en local**
   ```bash
   npm run dev
   ```

## Deploy (Netlify)

- Conectar el repo en Netlify
- Variables de entorno: copiar las de `.env.local` (sin `SUPABASE_DB_URL`, no hace falta en runtime)
- Build command: `npm run build`
- Publish directory: `.next`
- Plugin: `@netlify/plugin-nextjs` (se detecta automáticamente)
