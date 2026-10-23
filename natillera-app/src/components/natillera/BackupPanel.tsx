import { useRef, useState } from "react";
import { Download, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onExport: () => string;
  onImport: (raw: string) => void;
  onReset: () => void;
};

export function BackupPanel({ onExport, onImport, onReset }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    const raw = onExport();
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `natillera-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const raw = await file.text();
      onImport(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleReset() {
    if (confirm("¿Borrar TODA la natillera (miembros y pagos)? Esta acción no se puede deshacer.")) {
      onReset();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="size-4" />
        Exportar JSON
      </Button>
      <Button variant="outline" size="sm" onClick={handleImportClick}>
        <Upload className="size-4" />
        Importar JSON
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReset}
        className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
      >
        <RotateCcw className="size-4" />
        Reiniciar
      </Button>
      {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
    </div>
  );
}
