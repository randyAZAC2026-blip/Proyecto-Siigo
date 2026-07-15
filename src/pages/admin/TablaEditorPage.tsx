import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DataTableEditor } from "@/components/admin/DataTableEditor";
import { getTablaConfig } from "@/lib/tablasConfig";

export function TablaEditorPage() {
  const { tabla } = useParams<{ tabla: string }>();
  const config = tabla ? getTablaConfig(tabla) : undefined;

  if (!config) return <Navigate to="/admin/tablas" replace />;

  return (
    <div className="space-y-4">
      <Link
        to="/admin/tablas"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="size-4" />
        Volver a tablas
      </Link>
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{config.label}</h1>
      <DataTableEditor
        table={config.table}
        primaryKey={config.primaryKey}
        columns={config.columns}
        orderBy={config.orderBy}
      />
    </div>
  );
}
