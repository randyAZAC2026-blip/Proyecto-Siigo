import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CircleCheck, AlertCircle, FileSpreadsheet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api } from "@/lib/dashboard/api";

interface Fila {
  fecha: string | null;
  descripcion: string | null;
  monto: number;
  saldo: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImportado?: (n: number) => void;
}

const KEYS_FECHA = ["fecha", "fecha valor", "date", "value date", "posted"];
const KEYS_DESCRIPCION = ["descripcion", "descripción", "detalle", "concepto", "description", "transaccion", "transacción"];
const KEYS_MONTO = ["monto", "valor", "amount", "importe", "movimiento"];
const KEYS_SALDO = ["saldo", "balance", "saldo cuenta"];

function normalizar(s: string) {
  return String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function encontrarColumna(headers: string[], candidatos: string[]) {
  for (const c of candidatos) {
    const idx = headers.findIndex((h) => normalizar(h) === c);
    if (idx >= 0) return headers[idx];
  }
  for (const c of candidatos) {
    const idx = headers.findIndex((h) => normalizar(h).includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function toIsoDate(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    // Serial Excel
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // dd/mm/yyyy o yyyy-mm-dd
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const [_, d, m, y] = dmy;
    const anio = y.length === 2 ? "20" + y : y;
    return `${anio}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Math.round(raw);
  const s = String(raw).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function ImportarExtractoModal({ open, onClose, onImportado }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [banco, setBanco] = useState<"Bancolombia" | "Nequi">("Bancolombia");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [archivoNombre, setArchivoNombre] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    insertados: number;
    duplicados: number;
    errores: { fila: number; motivo: string }[];
  } | null>(null);

  function reset() {
    setFilas([]);
    setArchivoNombre("");
    setError(null);
    setResultado(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      // Primera hoja con datos
      const hoja = wb.SheetNames[0];
      const ws = wb.Sheets[hoja];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: true,
      });
      if (rows.length === 0) {
        setError("El archivo no tiene filas de datos");
        return;
      }
      const headers = Object.keys(rows[0]);
      const colFecha = encontrarColumna(headers, KEYS_FECHA);
      const colDesc = encontrarColumna(headers, KEYS_DESCRIPCION);
      const colMonto = encontrarColumna(headers, KEYS_MONTO);
      const colSaldo = encontrarColumna(headers, KEYS_SALDO);

      if (!colFecha || !colMonto) {
        setError(
          `No se detectaron columnas necesarias. Encontré: ${headers.join(", ")}. Necesito al menos una columna Fecha y una Monto.`,
        );
        return;
      }

      const nuevas: Fila[] = [];
      for (const row of rows) {
        const fecha = toIsoDate(row[colFecha]);
        const monto = toNumber(row[colMonto]);
        if (!fecha || monto === 0) continue;
        nuevas.push({
          fecha,
          descripcion: colDesc ? String(row[colDesc] ?? "").trim() || null : null,
          monto,
          saldo: colSaldo ? toNumber(row[colSaldo]) : null,
        });
      }
      setFilas(nuevas);
      setArchivoNombre(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }

  async function importar() {
    setCargando(true);
    setError(null);
    try {
      const r = await api.importarExtracto(
        banco,
        filas.map((f) => ({
          fecha: f.fecha,
          descripcion: f.descripcion,
          monto: f.monto,
          saldo_cuenta: f.saldo,
        })),
      );
      setResultado(r);
      onImportado?.(r.insertados);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-[var(--color-primary)]" />
            Importar extracto bancario
          </DialogTitle>
          <DialogDescription>
            Descarga tu extracto de Bancolombia o Nequi en Excel/CSV y súbelo aquí. Se
            detectan las columnas Fecha, Descripción, Monto y Saldo automáticamente.
            Duplicados (mismo banco+fecha+monto+descripción) se omiten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Banco *</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={banco}
                onChange={(e) => setBanco(e.target.value as "Bancolombia" | "Nequi")}
              >
                <option value="Bancolombia">Bancolombia</option>
                <option value="Nequi">Nequi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Archivo</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-white file:cursor-pointer"
              />
              {archivoNombre && (
                <p className="text-xs text-[var(--color-muted)] mt-1">{archivoNombre}</p>
              )}
            </div>
          </div>

          {cargando && <p className="text-sm text-[var(--color-muted)]">Procesando…</p>}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
              <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-destructive)]">{error}</p>
            </div>
          )}

          {resultado && (
            <div className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <CircleCheck className="size-4 text-[var(--color-success)]" />
                <strong className="text-[var(--color-success)]">Importación completa</strong>
              </div>
              <p>• Insertados: <strong>{resultado.insertados}</strong></p>
              <p>• Duplicados (omitidos): <strong>{resultado.duplicados}</strong></p>
              {resultado.errores.length > 0 && (
                <p className="text-[var(--color-warning)]">
                  • Errores: {resultado.errores.length}
                </p>
              )}
            </div>
          )}

          {filas.length > 0 && !resultado && (
            <>
              <div className="text-xs text-[var(--color-muted)]">
                Previsualizando <strong>{filas.length}</strong> filas del archivo.
              </div>
              <div className="max-h-[300px] overflow-auto rounded-md border border-[var(--color-border)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.slice(0, 100).map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{f.fecha}</TableCell>
                        <TableCell className="text-xs truncate max-w-[280px]">
                          {f.descripcion ?? "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums text-xs ${
                            f.monto < 0
                              ? "text-[var(--color-destructive)]"
                              : "text-[var(--color-success)]"
                          }`}
                        >
                          {f.monto < 0 ? "-" : "+"}
                          {formatCOP(Math.abs(f.monto))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {f.saldo != null ? formatCOP(f.saldo) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filas.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-[var(--color-muted)]">
                          … y {filas.length - 100} filas más
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            disabled={filas.length === 0 || cargando || !!resultado}
            onClick={importar}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            {cargando ? "Importando…" : `Importar ${filas.length} movimientos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
