"use client";

import ExcelJS from "exceljs";
import type {
  ClienteEmpresa,
  PedidoEmpresa,
  PedidoEmpresaItem,
} from "@/lib/types";

interface PedidoConItems {
  pedido: PedidoEmpresa;
  items: PedidoEmpresaItem[];
}

interface Consolidado {
  lineas: Array<{
    key: string;
    nombre: string;
    cantidad: number;
    precio_unidad: number | null;
    importe: number;
    sinPrecio: boolean;
  }>;
  neto: number;
  iva: number;
  total: number;
}

interface Filtros {
  modo: "fecha" | "guia";
  desde: string;
  hasta: string;
  idDesde?: number;
  idHasta?: number;
}

// Paleta Easy Clean (hex sin #, ARGB para exceljs).
const BRAND_DARK = "FF1B3A8E";   // azul "EASY"
const BRAND_LIGHT = "FF5BC8F2";  // celeste "CLEAN"
const BRAND_PALE = "FFE0F4FF";   // celeste palido
const BG_ALT = "FFF6FBFE";       // alterna filas
const BORDER_LIGHT = "FFD0DEED";
const TEXT_WHITE = "FFFFFFFF";

const thinBorder: ExcelJS.Borders = {
  top:    { style: "thin", color: { argb: BORDER_LIGHT } },
  left:   { style: "thin", color: { argb: BORDER_LIGHT } },
  bottom: { style: "thin", color: { argb: BORDER_LIGHT } },
  right:  { style: "thin", color: { argb: BORDER_LIGHT } },
} as ExcelJS.Borders;

function styleHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: TEXT_WHITE }, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_DARK },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function styleSubHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: BRAND_DARK }, size: 10 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_PALE },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function styleDataCell(cell: ExcelJS.Cell, opts: { alt?: boolean; numeric?: boolean } = {}) {
  cell.font = { color: { argb: BRAND_DARK }, size: 10 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: opts.alt ? BG_ALT : "FFFFFFFF" },
  };
  cell.alignment = {
    horizontal: opts.numeric ? "right" : "left",
    vertical: "middle",
  };
  cell.border = thinBorder;
}

function styleTotalRow(cell: ExcelJS.Cell, big = false) {
  cell.font = {
    bold: true,
    color: { argb: TEXT_WHITE },
    size: big ? 13 : 11,
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_DARK },
  };
  cell.alignment = { horizontal: "right", vertical: "middle" };
  cell.border = thinBorder;
}

export async function exportFacturacionExcel({
  empresa,
  pedidos,
  consolidado,
  filtros,
}: {
  empresa: ClienteEmpresa;
  pedidos: PedidoConItems[];
  consolidado: Consolidado;
  filtros: Filtros;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Easy Clean — Inventario";
  wb.created = new Date();

  const ws = wb.addWorksheet("Facturación", {
    views: [{ showGridLines: false }],
  });

  // ============================================================
  // 1. Título grande
  // ============================================================
  ws.mergeCells("A1:D2");
  const titleCell = ws.getCell("A1");
  titleCell.value = "FACTURACIÓN";
  titleCell.font = {
    bold: true,
    color: { argb: TEXT_WHITE },
    size: 22,
    name: "Calibri",
  };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_DARK },
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Subtitulo Easy Clean en col R..(o donde toque)
  ws.mergeCells("E1:R2");
  const sub = ws.getCell("E1");
  sub.value = "Easy Clean — Lavandería";
  sub.font = {
    italic: true,
    color: { argb: TEXT_WHITE },
    size: 12,
    name: "Calibri",
  };
  sub.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_LIGHT },
  };
  sub.alignment = { horizontal: "center", vertical: "middle" };

  // Filas 1 y 2 mas altas
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 22;

  // ============================================================
  // 2. Datos del cliente (filas 4..8)
  // ============================================================
  const clienteRows: Array<[string, string]> = [
    ["Cliente", empresa.nombre],
    ["RUT", empresa.rut],
    ["Dirección", [empresa.calle, empresa.comuna].filter(Boolean).join(", ")],
    ["Teléfono", empresa.contacto_1 ?? ""],
    [
      filtros.modo === "fecha" ? "Período" : "Guías",
      filtros.modo === "fecha"
        ? `${filtros.desde} al ${filtros.hasta}`
        : `${filtros.idDesde ?? ""} al ${filtros.idHasta ?? ""}`,
    ],
  ];
  let row = 4;
  for (const [label, value] of clienteRows) {
    const labelCell = ws.getCell(`A${row}`);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: BRAND_DARK }, size: 10 };
    labelCell.alignment = { vertical: "middle" };

    ws.mergeCells(`B${row}:F${row}`);
    const valCell = ws.getCell(`B${row}`);
    valCell.value = value;
    valCell.font = { color: { argb: BRAND_DARK }, size: 10 };
    valCell.alignment = { vertical: "middle" };
    row++;
  }

  // ============================================================
  // 3. Grid de items por día
  // ============================================================
  const dayOfPedido = new Map<number, number>();
  let minDay = 32;
  let maxDay = 0;
  for (const { pedido } of pedidos) {
    const d = new Date(pedido.fecha).getDate();
    dayOfPedido.set(pedido.id, d);
    if (d < minDay) minDay = d;
    if (d > maxDay) maxDay = d;
  }
  const startDay = pedidos.length === 0 ? 1 : minDay;
  const endDay = pedidos.length === 0 ? 31 : maxDay;

  const productNames = consolidado.lineas.map((l) => l.nombre);
  const productIndex = new Map(productNames.map((n, i) => [n, i]));
  const grid: number[][] = productNames.map(() =>
    Array.from({ length: endDay - startDay + 1 }, () => 0),
  );
  for (const { pedido, items } of pedidos) {
    const day = dayOfPedido.get(pedido.id);
    if (day === undefined) continue;
    const col = day - startDay;
    for (const it of items) {
      const idx = productIndex.get(it.producto_empresa_nombre);
      if (idx === undefined) continue;
      grid[idx][col] += it.cantidad;
    }
  }

  const gridStartRow = row + 1; // dejar un espacio
  const totalCol = 2 + (endDay - startDay) + 1;

  // Header del grid
  const headerRow = ws.getRow(gridStartRow);
  ws.getCell(gridStartRow, 1).value = "Mantelería";
  styleHeader(ws.getCell(gridStartRow, 1));
  for (let d = startDay; d <= endDay; d++) {
    const col = 2 + (d - startDay);
    ws.getCell(gridStartRow, col).value = d;
    styleSubHeader(ws.getCell(gridStartRow, col));
  }
  ws.getCell(gridStartRow, totalCol).value = "TOTAL";
  styleHeader(ws.getCell(gridStartRow, totalCol));
  headerRow.height = 22;

  // Filas de productos
  for (let i = 0; i < productNames.length; i++) {
    const r = gridStartRow + 1 + i;
    const altRow = i % 2 === 1;
    ws.getCell(r, 1).value = productNames[i];
    styleDataCell(ws.getCell(r, 1), { alt: altRow });
    ws.getCell(r, 1).font = {
      color: { argb: BRAND_DARK },
      size: 10,
      bold: true,
    };

    let total = 0;
    for (let d = startDay; d <= endDay; d++) {
      const col = 2 + (d - startDay);
      const val = grid[i][d - startDay];
      const cell = ws.getCell(r, col);
      if (val > 0) cell.value = val;
      styleDataCell(cell, { alt: altRow, numeric: true });
      cell.alignment = { horizontal: "center", vertical: "middle" };
      total += val;
    }
    const totalCell = ws.getCell(r, totalCol);
    totalCell.value = total;
    styleDataCell(totalCell, { alt: altRow, numeric: true });
    totalCell.font = { bold: true, color: { argb: BRAND_DARK }, size: 11 };
    totalCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_PALE },
    };
  }

  // Fila Guías
  const guiasRow = gridStartRow + 1 + productNames.length + 1;
  ws.getCell(guiasRow, 1).value = "Guías";
  styleHeader(ws.getCell(guiasRow, 1));
  for (let d = startDay; d <= endDay; d++) {
    const col = 2 + (d - startDay);
    const cell = ws.getCell(guiasRow, col);
    let val = "";
    for (const { pedido } of pedidos) {
      if (dayOfPedido.get(pedido.id) === d) {
        val = val ? `${val}, #${pedido.id}` : `#${pedido.id}`;
      }
    }
    if (val) cell.value = val;
    cell.font = { color: { argb: BRAND_DARK }, size: 8, italic: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_PALE },
    };
  }
  ws.getCell(guiasRow, totalCol).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_PALE },
  };
  ws.getCell(guiasRow, totalCol).border = thinBorder;

  // ============================================================
  // 4. Tabla de facturación
  // ============================================================
  let r = guiasRow + 3;

  // Header de seccion
  ws.mergeCells(`A${r}:D${r}`);
  const facturaHeader = ws.getCell(`A${r}`);
  facturaHeader.value = "FACTURACIÓN";
  facturaHeader.font = {
    bold: true,
    color: { argb: TEXT_WHITE },
    size: 14,
  };
  facturaHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_DARK },
  };
  facturaHeader.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 22;
  r++;

  // Header columnas
  ws.getCell(`A${r}`).value = "Producto";
  ws.getCell(`B${r}`).value = "CANTIDAD";
  ws.getCell(`C${r}`).value = "PRECIO UNITARIO";
  ws.getCell(`D${r}`).value = "PRECIO TOTAL";
  for (const col of ["A", "B", "C", "D"]) {
    styleHeader(ws.getCell(`${col}${r}`));
  }
  ws.getRow(r).height = 22;
  r++;

  // Filas
  consolidado.lineas.forEach((linea, i) => {
    const altRow = i % 2 === 1;
    ws.getCell(`A${r}`).value = linea.nombre;
    styleDataCell(ws.getCell(`A${r}`), { alt: altRow });
    ws.getCell(`A${r}`).font = {
      color: { argb: BRAND_DARK },
      size: 10,
      bold: true,
    };

    ws.getCell(`B${r}`).value = linea.cantidad;
    styleDataCell(ws.getCell(`B${r}`), { alt: altRow, numeric: true });

    if (linea.precio_unidad !== null) {
      ws.getCell(`C${r}`).value = linea.precio_unidad;
      ws.getCell(`C${r}`).numFmt = '"$"#,##0';
    }
    styleDataCell(ws.getCell(`C${r}`), { alt: altRow, numeric: true });

    ws.getCell(`D${r}`).value = linea.importe;
    ws.getCell(`D${r}`).numFmt = '"$"#,##0';
    styleDataCell(ws.getCell(`D${r}`), { alt: altRow, numeric: true });
    ws.getCell(`D${r}`).font = {
      bold: true,
      color: { argb: BRAND_DARK },
      size: 10,
    };
    r++;
  });

  // Espacio
  r++;

  // TOTAL NETO
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = "TOTAL NETO";
  styleHeader(ws.getCell(`A${r}`));
  ws.getCell(`A${r}`).alignment = { horizontal: "right", vertical: "middle" };
  ws.getCell(`D${r}`).value = consolidado.neto;
  ws.getCell(`D${r}`).numFmt = '"$"#,##0';
  styleHeader(ws.getCell(`D${r}`));
  r++;

  // IVA
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = "IVA 19%";
  styleHeader(ws.getCell(`A${r}`));
  ws.getCell(`A${r}`).alignment = { horizontal: "right", vertical: "middle" };
  ws.getCell(`D${r}`).value = consolidado.iva;
  ws.getCell(`D${r}`).numFmt = '"$"#,##0';
  styleHeader(ws.getCell(`D${r}`));
  r++;

  // TOTAL FINAL grande
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = "TOTAL";
  styleTotalRow(ws.getCell(`A${r}`), true);
  ws.getCell(`D${r}`).value = consolidado.total;
  ws.getCell(`D${r}`).numFmt = '"$"#,##0';
  styleTotalRow(ws.getCell(`D${r}`), true);
  ws.getRow(r).height = 28;

  // ============================================================
  // Anchos de columna
  // ============================================================
  ws.getColumn(1).width = 32; // producto
  for (let c = 2; c <= totalCol - 1; c++) {
    ws.getColumn(c).width = 6; // dias
  }
  ws.getColumn(totalCol).width = 11; // TOTAL del grid

  // Para la facturacion: B=cantidad, C=precio unit, D=total
  // necesitamos que sean anchas (sino sale ####)
  if (totalCol < 4) {
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 18;
  } else {
    // Si el grid usa esas columnas, las ensanchamos solo si no hay conflicto
    if (ws.getColumn(2).width! < 12) ws.getColumn(2).width = 12;
    if (ws.getColumn(3).width! < 18) ws.getColumn(3).width = 18;
    if (ws.getColumn(4).width! < 18) ws.getColumn(4).width = 18;
  }

  // ============================================================
  // Generar y descargar
  // ============================================================
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileLabel = (empresa.alias || empresa.nombre).replace(/\W+/g, "_");
  const periodoLabel =
    filtros.modo === "fecha"
      ? `${filtros.desde}_a_${filtros.hasta}`
      : `guias_${filtros.idDesde ?? ""}-${filtros.idHasta ?? ""}`;
  const filename = `Facturacion_${fileLabel}_${periodoLabel}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
