# Inventario

Sistema de gestión de pedidos para lavandería. Reemplaza la base de datos Access histórica (`Datos Lavanderia.accdb`) por una app web Next.js + Supabase.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui** + **lucide-react**
- **Supabase** (Postgres + Auth + Storage)
- **react-hook-form** + **zod** para formularios
- Deploy: **Vercel**

## Cómo se usa

Para el día a día —cargar las planillas de las empresas, sincronizar los
pedidos de mostrador desde el Access, facturar el mes y llevar las cuentas— ver
**[docs/OPERACION.md](docs/OPERACION.md)**.

## Qué hace

- **Pedidos de mostrador** y **pedidos de empresa** (guías), con su catálogo y
  precios por empresa.
- **Facturación** de un período: consolida las guías y baja la planilla.
- **Finanzas**: registra cada factura emitida con las guías que cubre y lleva
  su cobranza —incluidos los pagos parciales, con el saldo siempre a la
  vista—, y anota los gastos (luz, agua, insumos, remuneraciones) con su
  estado de pago.
- **Servicio express**: una guía puede venir apurada y pagar un recargo
  —el porcentaje lo fija cada empresa— que se factura como documento aparte.
- **Bolsas por trabajador**: algunas empresas mandan la ropa separada por
  bolsa numerada y hay que devolverla igual. Esas guías se cargan en una
  grilla (fila por bolsa, columna por prenda) y tienen su hoja de devolución
  imprimible.

## Estructura

```
Inventario/
├── src/
│   ├── app/             # Rutas (App Router)
│   ├── components/ui/   # shadcn/ui components
│   ├── lib/supabase/    # Clientes Supabase (browser, server, admin)
│   └── middleware.ts    # Protección de rutas (auth)
├── migrations/          # SQL de Postgres (ejecutar una vez en Supabase SQL Editor)
├── scripts/etl/         # Carga de datos: Access y planillas de facturación
├── docs/OPERACION.md    # Cómo entran los datos día a día
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

Producción es **Vercel**: <https://inventario-dusky.vercel.app>

El repo está conectado, así que cada push a `main` despliega solo. El plan
gratis no cobra por minutos de build.

- **Variables de entorno** (Settings → Environment Variables):
  `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, las dos como
  *config* y no como secreto. La anon key es pública por diseño —viaja en el
  bundle del navegador— y quien cuida los datos es RLS, no esconderla.
- **No** están cargadas `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` ni
  `OPENFACTURA_API_KEY`: el ETL corre en el PC, no en producción, y la service
  role key saltea RLS. No tiene nada que hacer en un servidor web.
- El framework y el build los detecta solo. No hace falta `vercel.json`.
- El dominio tiene que estar en Supabase → Authentication → URL Configuration
  → Redirect URLs como `https://inventario-dusky.vercel.app/**`. Sin eso el
  login anda, pero el correo de "olvidé mi contraseña" no vuelve a la app.

### Netlify (dado de baja)

Vivió en `starlit-centaur-269e84.netlify.app`. Se cayó con 502 al agotar los
créditos del plan gratis, y al renovarse volvió sirviendo un build viejo
contra la misma base de producción. Esa es la peor combinación posible: la app
se veía sana pero le faltaban columnas y arreglos, y nadie podía saber desde
qué versión estaba escribiendo. Por eso quedó una sola dirección.
