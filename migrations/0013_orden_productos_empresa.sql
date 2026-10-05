-- Inventario / Lavandería — orden de las prendas de cada empresa
--
-- Las prendas de una empresa se listaban alfabéticas. Para la ficha da igual,
-- pero la grilla de bolsas usa ese mismo orden para sus columnas, y ahí
-- importa: se carga copiando de una planilla de papel, y si las columnas no
-- están en el mismo orden que el papel se termina anotando la cantidad en la
-- prenda de al lado.
--
-- Termomín, por ejemplo, tiene su planilla en este orden:
--
--     Polera | Pantalón | Pantalón térmico | Cotona | Polerón | Overol | Gorro
--
-- y alfabético arranca con Cotona. Cada fila de 7 celdas es una oportunidad de
-- equivocarse.
--
-- El orden es por empresa y no por producto porque el catálogo es compartido:
-- la misma "Polera" la usan varias y cada una la tiene en otro lugar de su
-- planilla.
--
-- `orden` queda NULL por defecto a propósito. Las empresas que nunca lo tocan
-- siguen viendo sus prendas alfabéticas, igual que hasta ahora; las que lo
-- acomodan pasan a tener uno explícito. Sin esto habría que inventar un orden
-- inicial para todas y el cambio se notaría donde nadie lo pidió.
--
-- Idempotente.

alter table empresa_productos
  add column if not exists orden integer;

comment on column empresa_productos.orden is
  'Posición de la prenda en la ficha y en las columnas de la grilla. NULL = al final, alfabético.';

-- Las consultas piden las prendas de una empresa ordenadas; el índice las
-- entrega ya ordenadas en vez de hacer un sort por cada carga de la grilla.
create index if not exists empresa_productos_orden_idx
  on empresa_productos (rut_empresa, orden);
