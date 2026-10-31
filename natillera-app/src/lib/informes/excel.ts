/**
 * Exportación de informes a Excel (.xlsx) con el mismo formato en todos:
 * título, fecha de corte, encabezados, filas, fila de totales, anchos de
 * columna y formato de pesos.
 *
 * La librería xlsx se carga solo al exportar, para no engordar la app.
 * Aquí solo se ESCRIBEN archivos (no se leen archivos de terceros).
 */

export type TipoColumna = "texto" | "moneda" | "numero" | "fecha";

export interface ColumnaExcel {
  titulo: string;
  tipo?: TipoColumna;
  /** Ancho en caracteres. */
  ancho?: number;
}

export type Celda = string | number | null | undefined;

export interface HojaExcel {
  nombre: string;
  columnas: ColumnaExcel[];
  filas: Celda[][];
  /** Fila de totales al final (en negrilla en la mayoría de visores). */
  totales?: Celda[];
}

const FORMATO_PESOS = '"$"#,##0;[Red]-"$"#,##0';

/** Nombre de hoja válido para Excel: máximo 31 caracteres, sin : \ / ? * [ ] */
function nombreHoja(nombre: string): string {
  return nombre.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Hoja";
}

export function nombreArchivo(titulo: string, fecha = new Date()): string {
  const limpio = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `natillera-${limpio}-${fecha.toISOString().slice(0, 10)}.xlsx`;
}

export async function exportarExcel(
  titulo: string,
  corte: string,
  hojas: HojaExcel[],
): Promise<void> {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();

  for (const h of hojas) {
    const encabezado = [
      [`Natillera · ${titulo}`],
      [`Corte: ${corte} · Generado: ${new Date().toLocaleString("es-CO")}`],
      [],
      h.columnas.map((c) => c.titulo),
    ];
    const datos: Celda[][] = [...h.filas];
    if (h.totales) datos.push(h.totales);
    const hoja = XLSX.utils.aoa_to_sheet([...encabezado, ...datos]);

    // Formato de pesos en las columnas de dinero.
    const primeraFila = encabezado.length; // índice 0-based de la primera fila de datos
    h.columnas.forEach((c, ci) => {
      if (c.tipo !== "moneda" && c.tipo !== "numero") return;
      for (let r = 0; r < datos.length; r++) {
        const ref = XLSX.utils.encode_cell({ r: primeraFila + r, c: ci });
        const cel = hoja[ref];
        if (cel && typeof cel.v === "number") cel.z = c.tipo === "moneda" ? FORMATO_PESOS : "#,##0";
      }
    });

    hoja["!cols"] = h.columnas.map((c) => ({
      wch: c.ancho ?? (c.tipo === "moneda" ? 14 : c.tipo === "texto" ? 28 : 12),
    }));
    // El título ocupa todo el ancho de la tabla.
    hoja["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(h.columnas.length - 1, 0) } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(h.columnas.length - 1, 0) } },
    ];

    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(h.nombre));
  }

  XLSX.writeFile(libro, nombreArchivo(titulo));
}
