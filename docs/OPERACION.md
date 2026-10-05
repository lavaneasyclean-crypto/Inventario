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

### Guías express

Una guía puede venir apurada y pagar un recargo. El porcentaje lo negocia cada
empresa y se carga **una sola vez**, en su ficha (campo *Recargo express*).
Hoy: Hotel Acacias, 60%.

En la planilla la marca va pegada al número, en la fila `Guias`:

```
Guias | g1457 | g1458 Express | ... | g1475 Express |
```

`05_cargar_guias_excel.py` la lee y deja la guía marcada. Las que se cargan a
mano se marcan con la casilla *Servicio express* del formulario, o después
desde la ficha de la guía —que es el caso normal, porque uno se entera al
rato—.

**Cómo se cobra**, que es lo que suele confundir:

| Documento | Qué guías | A qué precio |
|---|---|---|
| Factura normal | Todas las del período, express incluidas | Precio base |
| Factura express | Solo las express | Solo el recargo (base × 60%) |

O sea que una guía express se cobra en dos documentos: el precio base en la
factura del mes y el 60% adicional en la de recargo. Son dos porque Haulmer
—donde se emite la factura electrónica— no acepta tantos items juntos.

El neto del período es la **suma de los dos**. La planilla vieja hacía lo
mismo: su `Total Neto` sumaba el bloque principal y el bloque
*Servicio express*.

## Facturar el mes

En la ficha de la empresa, **Facturar período**. Se elige el rango (por fechas
o por número de guía), se revisa el consolidado y de ahí salen dos cosas:

- **Descargar Excel** — la planilla, igual que siempre.
- **Registrar factura** — la guarda en Finanzas con un snapshot de las líneas
  y de qué guías cubre.

Registrarla es lo que hace que el sistema después avise *"la guía #1458 ya está
en la factura #12"* si se intenta facturar el mismo período dos veces. Si la
empresa tiene guías express, abajo aparece un segundo consolidado con su propio
botón para el documento de recargo.

El folio se puede dejar vacío y completar después, cuando vuelve del SII.

## Cobros y gastos

En **Finanzas**:

- *Por cobrar*: las facturas emitidas. Las vencidas salen en rojo.
- *Por pagar*: los gastos —luz, agua, gas, insumos, remuneraciones, arriendo,
  internet, teléfono, impuestos, mantención—. Se anotan al recibir la boleta y
  se marcan pagados al pagarla.
- *Resumen*: cuánto nos deben, cuánto debemos, y el movimiento del mes.

El **período** de un gasto es el mes del consumo, no el de la boleta: la luz de
septiembre llega en octubre y para comparar meses importa septiembre.

### Cobrar una factura, entera o de a poco

Las empresas no siempre pagan todo junto: abonan una parte a fin de mes y el
resto cuando pueden. Por eso en la ficha de cada factura hay una sección
**Pagos recibidos** donde se registra cada pago con su fecha, monto y forma.

El botón trae **el saldo precargado**, así que cobrar todo de una vez es
apretar *Registrar pago* sin tocar nada. Si pagaron una parte, se escribe ese
monto encima y la factura queda con saldo, mostrando *"Falta $X"* en el
listado.

El estado **no se marca a mano**: lo calcula la base sumando los pagos. Cuando
la suma llega al total, la factura pasa a *Pagada* sola. Si un pago se cargó
mal, se borra de esa misma lista y el estado vuelve atrás.

Dos cosas que conviene saber:

- No se puede abonar más que el saldo. La app lo rechaza antes de escribir.
- En el resumen, **"Por cobrar" es el saldo**, no el total: una factura de
  $119.000 con $80.000 abonados figura como $39.000 de deuda. Y lo abonado
  cuenta como cobrado aunque la factura siga abierta, para que un mes de
  muchos pagos parciales no aparezca como si no hubiera entrado nada.

Una factura **no se borra**: se anula. Queda en el historial y sus guías
vuelven a quedar disponibles para facturar, que es lo que hace falta cuando se
emite una nota de crédito. Un gasto sí se borra, porque es una anotación
nuestra y no un documento emitido.

## Empresas que trabajan por bolsas

Termomín y Termochemical no mandan un bulto de ropa: mandan **la bolsa de cada
trabajador**, numerada, y hay que devolverla tal cual. La bolsa 3 vuelve con
las mismas 6 poleras y el mismo pantalón con que entró.

Para esas empresas la guía deja de ser una lista de items y pasa a ser una
grilla: **una fila por bolsa, una columna por prenda**, igual que la planilla
que vienen llenando a mano.

La bolsa es **logística, no comercial**: no cambia el precio. La facturación
sigue consolidando por producto y la ignora.

### Alta de una empresa de estas

Tres cosas, en este orden:

1. **La empresa**, con la casilla *Trabaja por bolsas* prendida en su ficha.
2. **Su catálogo** de prendas con el precio acordado.
3. **El padrón de bolsas**, que son las filas de la grilla.

Para Termomín y Termochemical eso ya está automatizado:

```bash
python scripts/etl/06_alta_empresa_bolsas.py --empresa todas          # simulación
python scripts/etl/06_alta_empresa_bolsas.py --empresa todas --apply  # escribe
```

Es idempotente: lo que ya existe no se duplica, y se puede volver a correr
para agregar bolsas nuevas o corregir un precio.

Para otra empresa, a mano: en su ficha, **Padrón de bolsas** → *Cargar rango*
crea de la 1 a la N de una vez, y *Agregar* suma las que van por nombre. En la
planilla de Termomín conviven las numeradas con `Nicolás`, `DV` y `Maxis`, que
son personas sin bolsa asignada — por eso el código es texto y no un número.

### Lo que se factura pero no es una prenda

El traslado se cobra como una línea más, pero no viene en ninguna bolsa. Está
en el catálogo de la empresa con la casilla **"Es una prenda de bolsa"
destildada**: se factura igual —entra al consolidado y a la factura— pero no
ocupa una columna en la grilla ni sale en la hoja de devolución.

Sin eso, agregarlo al catálogo le mete una columna vacía a la grilla, en la
pantalla donde más molesta.

### El orden de las columnas

Las columnas de la grilla salen del orden de las prendas de la empresa, y
conviene que **sigan el mismo orden que la planilla de papel**. Cargar la
grilla es copiar del papel: si las columnas están en otro orden, cada fila de
siete celdas es una oportunidad de anotar la cantidad en la prenda de al lado.

Se acomoda en la ficha de la empresa, con las flechitas de cada producto. El
número a la izquierda del nombre es su posición.

`06_alta_empresa_bolsas.py` ya lo deja puesto para Termomín y Termochemical,
en el orden de su planilla:

```
Polera | Pantalón | Pantalón térmico | Cotona | Polerón | Overol térmico | Gorro
```

Una prenda que se agregue después entra sin posición y va al final; se sube
con las flechas si hace falta.

### Cargar la semana

Desde la ficha de la empresa, **Nuevo pedido**. Si trabaja por bolsas aparece
la grilla en vez del buscador de items. Se tipean las cantidades y listo:
Enter y las flechas bajan a la fila siguiente, como en Excel.

**El pie de la grilla tiene que coincidir con el de la planilla.** Si no
coincide, algo se tipeó mal. Es la misma verificación que ya se hace con las
planillas de Acacias.

**Una guía por entrega**, con su fecha. No hay nada semanal en el sistema: si
retiran dos veces en la semana van dos guías, y si en una semana no retiran no
va ninguna. La planilla las agrupa por semana porque así la vienen llevando,
pero la facturación suma el rango que elijas igual que con cualquier empresa.

### Importar una planilla ya llena

Para no retipear un mes que ya está en Excel:

```bash
python scripts/etl/07_cargar_planilla_bolsas.py "C:/ruta/planilla.xlsx" --periodo 2026-09
python scripts/etl/07_cargar_planilla_bolsas.py "C:/ruta/planilla.xlsx" --periodo 2026-09 --apply
```

Lee cada bloque `Semana N` y crea una guía por (semana, empresa) con la fecha
de la semana.

**Se niega a cargar si no cuadra.** Al final la planilla trae el resumen del
mes —cantidad por prenda y neto por empresa— y el script reconstruye esos
números desde las grillas antes de escribir. Si no coinciden, no carga nada y
muestra prenda por prenda dónde está la diferencia. Lo mismo si alguna bolsa
no está en el padrón o alguna prenda no está en el catálogo.

Es idempotente: una guía que ya existe para esa empresa y esa fecha se saltea.

**El `Traslado`** del resumen mensual se carga como una **guía aparte**, con
el último día del período y una sola línea sin bolsa. No sale de ninguna
grilla: es un cargo del mes, no se reparte entre los trabajadores y no se
devuelve, pero sin él la factura sale $80.000 corta.

### Devolver

En la ficha de la guía, **Devolución por bolsa** muestra qué lleva cada una, y
*Ver para imprimir* abre la hoja lista para mandar con la ropa.

Es la vista opuesta a la de facturación: para cobrar importa el producto (52
poleras en total), para devolver importa la bolsa (la 3 lleva 6 poleras, 1
pantalón y 1 polerón) y el precio no aparece.

Si alguna línea sale bajo *Sin bolsa asignada*, es una guía que se cargó antes
de armar el padrón. Se arregla editándola.

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

**El recargo express no es un snapshot.** Al revés que el precio, se toma de la
ficha de la empresa en el momento de facturar. Lo que sí queda congelado es la
factura: una vez registrada, sus líneas guardan el recargo ya calculado. Si el
porcentaje cambia, hay que rehacer las facturas del período anterior que
todavía no se emitieron.

**Los montos de una factura los calcula el servidor.** El botón "Registrar
factura" no manda el total que muestra la pantalla: manda qué guías incluir, y
el servidor vuelve a leerlas y rehace la suma. Si la pantalla quedó abierta
media hora y alguien editó una guía, se factura lo que dice la base.

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
`migrations/README.md`. Las `0006` a `0014` hay que aplicarlas **antes** de
desplegar el código que las usa: la app llama a funciones que se crean ahí.
