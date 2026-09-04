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
   - Después, aplicar en orden el resto de `migrations/` (ver
     `migrations/README.md`)

4. **Migrar datos del Access** (una sola vez)
   ```bash
   pwsh ./scripts/etl/01_export_access.ps1
   python ./scripts/etl/02_load_to_supabase.py
   ```
   El ETL inserta ids explícitos sin avanzar las secuencias, así que después
   hay que resincronizarlas. Eso lo hace `migrations/0006_crear_pedido_atomico.sql`,
   que conviene aplicar al final.

5. **Crear cuenta de usuario** en Supabase Auth
   - Authentication → Users → Add user
   - Email: `lavaneasyclean@gmail.com`, password fija
   - Authentication → Settings: desactivar "Enable email confirmations"

6. **Correr en local**
   ```bash
   npm run dev
   ```

## Deploy

Producción es **Netlify**. El repo también estuvo conectado a Vercel, que
buildeaba en paralelo detrás de su propio SSO sin que nadie lo usara; `vercel.json`
desactiva esos deploys. Para desconectarlo del todo hay que sacar el proyecto
desde el dashboard de Vercel.

### Netlify

- Conectar el repo en Netlify
- Variables de entorno: copiar las de `.env.local` (sin `SUPABASE_DB_URL`, no hace falta en runtime)
- Build command: `npm run build`
- Publish directory: `.next`
- Plugin: `@netlify/plugin-nextjs` (se detecta automáticamente)
