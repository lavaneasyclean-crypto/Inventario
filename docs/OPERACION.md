# Operación día a día

Cómo entran los datos a la app, qué comandos se usan y qué hay que tener
cuidado. El README cubre la instalación; esto cubre el uso.

## De dónde sale cada dato

Hay **dos fuentes distintas** y no se pisan:

| Qué | Fuente | Cómo entra |
|---|---|---|
| Pedidos de **empresa** | La planilla mensual de facturación (`.xlsx`) | `05_cargar_guias_excel.py`, o a mano en la app |
| Pedidos de **mostrador** | El Access (`Datos Lavanderia.accdb`) | `01_export_access.ps1` + `03_sync_desde_access.py` |

Desde septiembre 2026 el Access **dejó de mandar en los pedidos de empresa**.
`03_sync_desde_access.py` no escribe `pedidos_empresa` ni sus líneas: si lo
hiciera, la próxima corrida se llevaría puesto lo cargado desde las planillas.

## Cargar la planilla de una empresa

La planilla es una grilla —fila por prenda, columna por día— con una fila
`Guias` debajo que trae el número de cada día (`g1562`, `g1563`...). **Ese
número es el ID del pedido**, y se respeta en vez de generar uno nuevo, así la
numeración sigue siendo la que la empresa ya conoce.

Más abajo hay un bloque `Prendas | Cantidad | Precio | Total` de donde salen
los precios acordados. Por eso cada carga es autocontenida.

```bash
# simulación: no escribe nada, solo informa qué haría
python scripts/etl/05_cargar_guias_excel.py "C:/ruta/planilla.xlsx" --periodo 2026-09

# escribe
python scripts/etl/05_cargar_guias_excel.py "C:/ruta/planilla.xlsx" --periodo 2026-09 --apply

# solo el catálogo y los precios, sin las guías
# (para cuando los pedidos se van a cargar a mano en la app)
python scripts/etl/05_cargar_guias_excel.py "C:/ruta/planilla.xlsx" --solo-catalogo --apply
```

Reemplaza, no acumula: las guías que aparecen en la planilla se borran y se
recrean. Una guía que esté en la base y **no** en el Excel no se toca.

Se niega a cargar si alguna prenda no tiene código o no tiene precio para esa
empresa. Una guía a medias es peor que ninguna.

### Verificación

La planilla trae su propio `Total Neto`. Al terminar, el script imprime el
neto que cargó: **tienen que coincidir**. Si no coinciden, algo se leyó mal.

## Sincronizar los pedidos de mostrador

```bash
pwsh ./scripts/etl/01_export_access.ps1 -DbPath "C:/ruta/export.accdb"
python scripts/etl/03_sync_desde_access.py            # simulación
python scripts/etl/03_sync_desde_access.py --apply    # escribe
```

Hace UPSERT de lo que viene del Access y no toca nada más. Sobreviven los
precios por empresa y la unidad de cobro de los productos, que no existen en
el Access.

## Nombres de producto: el problema de fondo

En el Access el nombre del producto es **texto libre** y no se valida contra el
código, así que con los años se despegaron: 278 nombres distintos para 143
productos en mostrador, y 1.193 líneas de empresa sin código ninguno.

Para ver el trabajo pendiente:

```bash
python scripts/etl/04_guia_correcciones.py --desde 2026-08-01
```

Sale un CSV por canal con una columna `accion` que separa dos cosas muy
distintas:

- **asignar código existente** — el producto ya está en el catálogo y solo
  cambia el plural o una tilde. Se resuelve con un alias.
- **crear producto en el catálogo** — el producto no existe. Hay que crearlo.

El script propone el producto del catálogo más parecido, pero **la sugerencia
no es la respuesta**. El parecido de texto acierta la familia y se pierde justo
en lo que define el precio:

| escrito | sugerido | por qué NO |
|---|---|---|
| `mantel blanco circular` | Mantel Blanco **cuadrado** 77% | otra forma |
| `piecera` | **Pechera** 86% | pie de cama vs babero, ambos existen |
| `toallones` | Toalla **Mano** 60% | tamaño opuesto |
| `toalla baño` | Toalla **Mano** 91% | difieren en una letra |
| `Cobertor **Chiporro**` | Cobertor **Sherpa** 81% | otro material |

Los alias confirmados viven en `ALIAS_PRODUCTO_EMPRESA` (en `03_sync`) y
`EQUIVALENCIAS` (en `05_cargar_guias`). Cada empresa usa su propio vocabulario
para el mismo producto: el Excel dice `lisa` donde el catálogo dice `S/E`,
`Toalla grande` es `Toalla Cuerpo`, `Tablero 2,5x6` es `Tablero Blanco 2,5x6`.

## Cuidados

**Cruzar siempre contra el catálogo de Supabase, no contra el export de
Access.** El Access va atrasado: por confiar en él se creó un duplicado de
`Piecera` que después hubo que borrar. `05_cargar_guias` ya lo hace bien y
avisa si el nombre nuevo se parece demasiado a uno existente.

**Los precios son un snapshot.** Cambiar el precio en la ficha de la empresa
afecta solo a los pedidos **futuros**; las guías ya cargadas conservan el suyo.
Si el precio equivocado ya quedó en una guía, hay que editar esa guía.

**Las secuencias.** Las guías cargadas desde las planillas usan números altos
(1500+) mientras la secuencia de la app iba por 1181. Cada vez que se carguen
guías con número propio, hay que empujar la secuencia:

```sql
select setval('pedidos_empresa_id_seq', (select max(id) from pedidos_empresa) + 1, false);
```

**Supabase se pausa.** El plan gratuito pausa el proyecto tras unos días sin
actividad y la app deja de andar (el login también pega contra Supabase). Se
reactiva desde el dashboard con *Restore*. Ya pasó dos veces.

**`SUPABASE_DB_URL` no la usa nadie.** Ni la app ni el ETL abren una conexión
Postgres directa: todo va por el REST API. Solo sirve para conectarse por
terminal, y la que está en `.env.local` está vencida.

## Migraciones

Se aplican a mano en el SQL Editor de Supabase, en orden. Ver
`migrations/README.md`. Las `0006`, `0007` y `0008` hay que aplicarlas **antes**
de desplegar el código que las usa: la app llama a funciones que se crean ahí.
