import { useRef, useState } from "react";
import { FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { leerExcel, type ResultadoLectura } from "@/lib/natillera/importExcel";

type Props = {
  open: boolean;
  onClose: () => void;
  cuotaBase: number;
  onImportar: (filas: { nombre: string; cuotaMensual: number; notas?: string }[]) => void;
};

export function ImportarExcelDialog({ open, onClose, cuotaBase, onImportar }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined, hojaPreferida?: string) {
    if (!file) return;
    setCargando(true);
    setError(null);
    try {
      const res = await leerExcel(file, hojaPreferida);
      setResultado(res);
      setArchivoNombre(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      setResultado(null);
    } finally {
      setCargando(false);
    }
  }

  function reset() {
    setResultado(null);
    setArchivoNombre("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function confirmar() {
    if (!resultado) return;
    onImportar(
      resultado.filas.map((f) => ({
        nombre: f.nombre,
        cuotaMensual: f.cuota > 0 ? f.cuota : cuotaBase,
        notas: f.notas,
      })),
    );
    reset();
    onClose();
  }

  async function cambiarHoja(hoja: string) {
    const f = fileRef.current?.files?.[0];
    if (f) await handleFile(f, hoja);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-[var(--color-primary)]" />
            Importar miembros desde Excel
          </DialogTitle>
          <DialogDescription>
            Sube un archivo .xlsx / .xlsm. Detectaremos las columnas de Nombre, Cuota y Notas
            automáticamente. Si tu Excel tiene varias hojas, podrás elegir cuál usar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="excel-file">Archivo Excel</Label>
            <input
              ref={fileRef}
              id="excel-file"
              type="file"
              accept=".xlsx,.xlsm,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="mt-1 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-white file:cursor-pointer"
            />
            {archivoNombre && (
              <p className="text-xs text-[var(--color-muted)] mt-1">{archivoNombre}</p>
            )}
          </div>

          {cargando && <p className="text-sm text-[var(--color-muted)]">Leyendo archivo…</p>}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
              <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-destructive)]">{error}</p>
            </div>
          )}

          {resultado && (
            <>
              {resultado.hojas.length > 1 && (
                <div>
                  <Label>Hoja</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {resultado.hojas.map((h) => (
                      <button
                        key={h}
                        onClick={() => cambiarHoja(h)}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          h === resultado.hojaSeleccionada
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/10 p-3 text-xs text-[var(--color-muted)]">
                <p>
                  <strong className="text-[var(--color-text)]">Columnas detectadas:</strong>{" "}
                  Nombre = "{resultado.columnas.nombre}"
                  {resultado.columnas.cuota && `, Cuota = "${resultado.columnas.cuota}"`}
                  {resultado.columnas.notas && `, Notas = "${resultado.columnas.notas}"`}
                </p>
                {!resultado.columnas.cuota && (
                  <p className="mt-1">
                    No se encontró columna de cuota. Todos los miembros se importarán con la cuota
                    base ({formatCOP(cuotaBase)}).
                  </p>
                )}
              </div>

              {resultado.filas.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  No se encontraron filas con nombre válido en la hoja "{resultado.hojaSeleccionada}".
                </p>
              ) : (
                <div className="max-h-[300px] overflow-auto rounded-md border border-[var(--color-border)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Cuota mensual</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultado.filas.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{f.nombre}</TableCell>
                          <TableCell className="tabular-nums">
                            {formatCOP(f.cuota > 0 ? f.cuota : cuotaBase)}
                          </TableCell>
                          <TableCell className="text-xs text-[var(--color-muted)]">
                            {f.notas ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!resultado || resultado.filas.length === 0}
            onClick={confirmar}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            <CheckCircle2 className="size-4" />
            Importar {resultado?.filas.length ?? 0} miembros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
