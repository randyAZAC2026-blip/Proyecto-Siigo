import { useCallback, useRef, useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

export function XmlDropzone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = Array.from(fileList).filter((f) => {
        const name = f.name.toLowerCase();
        return name.endsWith(".xml") || name.endsWith(".zip");
      });
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      } ${disabled ? "opacity-60" : ""}`}
    >
      {disabled ? (
        <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
      ) : (
        <Upload className="size-8 text-[var(--color-primary)]" />
      )}
      <div className="space-y-1">
        <p className="font-medium text-[var(--color-text)]">
          Arrastra tus archivos XML o ZIP aquí
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          Admite facturas electrónicas, notas crédito/débito, documento soporte y nómina DIAN.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <FileText className="size-4" />
        Seleccionar archivos
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.zip,application/xml,text/xml,application/zip"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
