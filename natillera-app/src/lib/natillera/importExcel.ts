import * as XLSX from "xlsx";

export interface FilaImportada {
  nombre: string;
  cuota: number;
  notas?: string;
}

export interface ResultadoLectura {
  hojas: string[];
  filas: FilaImportada[];
  hojaSeleccionada: string;
  columnas: { nombre: string; cuota: string | null; notas: string | null };
}

const KEYS_NOMBRE = ["nombre", "nombres", "socio", "socios", "cliente", "clientes", "miembro", "miembros"];
const KEYS_CUOTA = ["cuota", "cuota mensual", "valor", "aporte", "monto"];
const KEYS_NOTAS = ["notas", "observaciones", "detalle", "detalles", "comentario"];

function normalizar(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function encontrarColumna(headers: string[], candidatos: string[]): string | null {
  for (const c of candidatos) {
    const idx = headers.findIndex((h) => normalizar(h) === c);
    if (idx >= 0) return headers[idx];
  }
  // Match parcial
  for (const c of candidatos) {
    const idx = headers.findIndex((h) => normalizar(h).includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function limpiarNumero(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Math.abs(Math.round(raw));
  const s = String(raw).replace(/[^\d.-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0;
}

/**
 * Lee un archivo XLS/XLSX/XLSM y devuelve la lista de miembros detectados.
 * Estrategia:
 * - Si la hoja tiene una columna llamada como "Nombre / Socios / Cliente / Miembro",
 *   se usa como fuente. Si no, se toma la 1ra columna con texto.
 * - Cuota: se busca "Cuota / Valor / Aporte / Monto". Si no aparece, queda 0
 *   (usará la cuota base al importar).
 * - Notas: se busca "Notas / Observaciones / Detalle".
 */
export async function leerExcel(file: File, hojaPreferida?: string): Promise<ResultadoLectura> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const hojas = wb.SheetNames;

  // Elegir hoja: la preferida si existe, si no la primera que tenga datos.
  let hoja = hojaPreferida && hojas.includes(hojaPreferida) ? hojaPreferida : hojas[0];
  // Prioriza hojas con nombres típicos de bases de datos de socios
  const preferencia = ["BD", "SOCIOS", "MIEMBROS", "CLIENTES", "BASE"];
  if (!hojaPreferida) {
    for (const p of preferencia) {
      const encontrada = hojas.find((h) => normalizar(h).includes(normalizar(p)));
      if (encontrada) {
        hoja = encontrada;
        break;
      }
    }
  }

  const ws = wb.Sheets[hoja];
  if (!ws) throw new Error(`La hoja "${hoja}" está vacía.`);

  // Leer como matriz de objetos usando la primera fila como header.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  });
  if (rows.length === 0) {
    return {
      hojas,
      filas: [],
      hojaSeleccionada: hoja,
      columnas: { nombre: "", cuota: null, notas: null },
    };
  }

  const headers = Object.keys(rows[0]);
  const colNombre = encontrarColumna(headers, KEYS_NOMBRE) ?? headers[0];
  const colCuota = encontrarColumna(headers, KEYS_CUOTA);
  const colNotas = encontrarColumna(headers, KEYS_NOTAS);

  const filas: FilaImportada[] = [];
  for (const row of rows) {
    const nombreRaw = row[colNombre];
    if (!nombreRaw) continue;
    const nombre = String(nombreRaw).trim();
    if (!nombre) continue;
    // Descarta filas que claramente son totales/separadores
    if (/^total|^suma|^promedio|^#REF/i.test(nombre)) continue;

    const cuota = colCuota ? limpiarNumero(row[colCuota]) : 0;
    const notas = colNotas ? String(row[colNotas] ?? "").trim() : "";

    filas.push({
      nombre,
      cuota,
      notas: notas || undefined,
    });
  }

  return {
    hojas,
    filas,
    hojaSeleccionada: hoja,
    columnas: {
      nombre: colNombre,
      cuota: colCuota,
      notas: colNotas,
    },
  };
}
