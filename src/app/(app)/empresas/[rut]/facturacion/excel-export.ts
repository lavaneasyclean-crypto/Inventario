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
  // Día → pedidos
  // Cada columna del grid representa un día del mes (1..31)
  // Si hay más de un pedido por día, sumamos cantidades.
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inventario Lavandería";
  wb.created = new Date();

  const ws = wb.addWorksheet("Facturación");

  // ---------- Header de cliente ----------
  ws.mergeCells("A1:R1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "FACTURACIÓN";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center" };

  ws.getCell("A3").value = "Cliente";
  ws.getCell("B3").value = empresa.nombre;
  ws.getCell("A4").value = "Rut";
  ws.getCell("B4").value = empresa.rut;
  ws.getCell("A5").value = "Dirección";
  ws.getCell("B5").value = [empresa.calle, empresa.comuna]
    .filter(Boolean)
    .join(", ");
  ws.getCell("A6").value = "Teléfono";
  ws.getCell("B6").value = empresa.contacto_1 ?? "";

  if (filtros.modo === "fecha") {
    ws.getCell("A7").value = "Período";
    ws.getCell("B7").value = `${filtros.desde} al ${filtros.hasta}`;
  } else {
    ws.getCell("A7").value = "Guías";
    ws.getCell("B7").value = `${filtros.idDesde ?? ""} al ${filtros.idHasta ?? ""}`;
  }
  for (const r of [3, 4, 5, 6, 7]) {
    ws.getCell(`A${r}`).font = { bold: true };
  }

  // ---------- Grid de items por día ----------
  // Días del mes: derivamos de las fechas de los pedidos
  const dayOfPedido = new Map<number, number>(); // pedido_id -> día del mes
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

  // Productos únicos en orden alfabético (basado en consolidado.lineas)
  const productNames = consolidado.lineas.map((l) => l.nombre);
  const productIndex = new Map(productNames.map((n, i) => [n, i]));

  // Matriz [producto][día] = cantidad
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

  // Encabezado del grid
  const gridStartRow = 9;
  ws.getCell(`A${gridStartRow}`).value = "Mantelería";
  ws.getCell(`A${gridStartRow}`).font = { bold: true };
  for (let d = startDay; d <= endDay; d++) {
    const col = 2 + (d - startDay); // B=2, C=3, ...
    ws.getCell(gridStartRow, col).value = d;
    ws.getCell(gridStartRow, col).font = { bold: true };
    ws.getCell(gridStartRow, col).alignment = { horizontal: "center" };
  }
  const totalCol = 2 + (endDay - startDay) + 1;
  ws.getCell(gridStartRow, totalCol).value = "TOTAL";
  ws.getCell(gridStartRow, totalCol).font = { bold: true };
  ws.getCell(gridStartRow, totalCol).alignment = { horizontal: "right" };

  // Filas del grid
  for (let i = 0; i < productNames.length; i++) {
    const row = gridStartRow + 1 + i;
    ws.getCell(`A${row}`).value = productNames[i];
    let total = 0;
    for (let d = startDay; d <= endDay; d++) {
      const col = 2 + (d - startDay);
      const val = grid[i][d - startDay];
      if (val > 0) {
        ws.getCell(row, col).value = val;
        ws.getCell(row, col).alignment = { horizontal: "center" };
      }
      total += val;
    }
    ws.getCell(row, totalCol).value = total;
    ws.getCell(row, totalCol).font = { bold: true };
    ws.getCell(row, totalCol).alignment = { horizontal: "right" };
  }

  // Fila de "Guías" con los IDs
  const guiasRow = gridStartRow + 1 + productNames.length + 1;
  ws.getCell(`A${guiasRow}`).value = "Guías";
  ws.getCell(`A${guiasRow}`).font = { bold: true };
  for (const { pedido } of pedidos) {
    const day = dayOfPedido.get(pedido.id);
    if (day === undefined) continue;
    const col = 2 + (day - startDay);
    const cur = ws.getCell(guiasRow, col).value;
    const nuevo = `#${pedido.id}`;
    ws.getCell(guiasRow, col).value = cur ? `${cur}, ${nuevo}` : nuevo;
    ws.getCell(guiasRow, col).alignment = { horizontal: "center" };
    ws.getCell(guiasRow, col).font = { size: 9 };
  }

  // ---------- Tabla de facturación ----------
  let row = guiasRow + 3;
  ws.getCell(`A${row}`).value = "Facturación";
  ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;

  ws.getCell(`A${row}`).value = "Producto";
  ws.getCell(`B${row}`).value = "CANTIDAD";
  ws.getCell(`C${row}`).value = "PRECIO UNITARIO";
  ws.getCell(`D${row}`).value = "PRECIO TOTAL";
  for (const c of ["A", "B", "C", "D"]) {
    ws.getCell(`${c}${row}`).font = { bold: true };
    ws.getCell(`${c}${row}`).alignment = { horizontal: c === "A" ? "left" : "right" };
  }
  row += 1;

  for (const linea of consolidado.lineas) {
    ws.getCell(`A${row}`).value = linea.nombre;
    ws.getCell(`B${row}`).value = linea.cantidad;
    ws.getCell(`B${row}`).alignment = { horizontal: "right" };
    if (linea.precio_unidad !== null) {
      ws.getCell(`C${row}`).value = linea.precio_unidad;
      ws.getCell(`C${row}`).numFmt = '"$"#,##0';
    }
    ws.getCell(`D${row}`).value = linea.importe;
    ws.getCell(`D${row}`).numFmt = '"$"#,##0';
    row += 1;
  }

  row += 1;
  ws.getCell(`C${row}`).value = "TOTAL NETO";
  ws.getCell(`C${row}`).font = { bold: true };
  ws.getCell(`C${row}`).alignment = { horizontal: "right" };
  ws.getCell(`D${row}`).value = consolidado.neto;
  ws.getCell(`D${row}`).numFmt = '"$"#,##0';
  ws.getCell(`D${row}`).font = { bold: true };
  row += 1;

  ws.getCell(`C${row}`).value = "IVA 19%";
  ws.getCell(`C${row}`).font = { bold: true };
  ws.getCell(`C${row}`).alignment = { horizontal: "right" };
  ws.getCell(`D${row}`).value = consolidado.iva;
  ws.getCell(`D${row}`).numFmt = '"$"#,##0';
  ws.getCell(`D${row}`).font = { bold: true };
  row += 1;

  ws.getCell(`C${row}`).value = "TOTAL";
  ws.getCell(`C${row}`).font = { bold: true, size: 12 };
  ws.getCell(`C${row}`).alignment = { horizontal: "right" };
  ws.getCell(`D${row}`).value = consolidado.total;
  ws.getCell(`D${row}`).numFmt = '"$"#,##0';
  ws.getCell(`D${row}`).font = { bold: true, size: 12 };

  // Anchos
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= totalCol; c++) {
    ws.getColumn(c).width = 6;
  }
  ws.getColumn(totalCol).width = 10;

  // Generar y descargar
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
