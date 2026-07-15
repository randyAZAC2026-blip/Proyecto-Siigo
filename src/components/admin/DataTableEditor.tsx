import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Check, X, Search } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ColumnType = "text" | "number" | "select";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  editableOnCreateOnly?: boolean; // ej. la clave primaria de uvt_rates (year)
  nullable?: boolean;
}

interface DataTableEditorProps {
  table: string;
  primaryKey: string;
  columns: ColumnDef[];
  orderBy?: string;
}

// Cliente Supabase con el nombre de tabla relajado a `string` — este editor
// opera sobre tablas heterogéneas resueltas en runtime vía tablasConfig.ts,
// así que el tipado estricto por tabla (Database["public"]["Tables"]) no aplica.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

type RowRecord = Record<string, string | number | null>;

function emptyRow(columns: ColumnDef[]): RowRecord {
  const row: RowRecord = {};
  for (const c of columns) row[c.key] = c.type === "number" ? 0 : "";
  return row;
}

function parseValue(col: ColumnDef, raw: string): string | number | null {
  if (col.type === "number") {
    if (raw === "") return col.nullable ? null : 0;
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  if (raw === "" && col.nullable) return null;
  return raw;
}

export function DataTableEditor({ table, primaryKey, columns, orderBy }: DataTableEditorProps) {
  // El cliente Supabase tipado exige tablas conocidas en tiempo de compilación;
  // este editor es genérico y opera sobre el nombre de tabla en runtime, así
  // que se relaja el tipo aquí (único punto de `any` del componente).
  const db = supabase as unknown as SupabaseAny;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState<string | number | null>(null);
  const [draft, setDraft] = useState<RowRecord>({});
  const [creating, setCreating] = useState(false);
  const [newRow, setNewRow] = useState<RowRecord>(() => emptyRow(columns));

  const { data: rows, isLoading, error } = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const query = db.from(table).select("*");
      const { data, error } = orderBy ? await query.order(orderBy) : await query;
      if (error) throw error;
      return (data ?? []) as RowRecord[];
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search, columns]);

  const updateMutation = useMutation({
    mutationFn: async (row: RowRecord) => {
      const { [primaryKey]: pk, ...rest } = row;
      const { error } = await db.from(table).update(rest).eq(primaryKey, pk);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      setEditingKey(null);
    },
  });

  const insertMutation = useMutation({
    mutationFn: async (row: RowRecord) => {
      const { error } = await db.from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      setCreating(false);
      setNewRow(emptyRow(columns));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pk: string | number) => {
      const { error } = await db.from(table).delete().eq(primaryKey, pk);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });

  function startEdit(row: RowRecord) {
    setEditingKey(row[primaryKey] as string | number);
    setDraft({ ...row });
  }

  function renderCellInput(col: ColumnDef, record: RowRecord, setRecord: (r: RowRecord) => void) {
    const value = record[col.key];
    if (col.type === "select" && col.options) {
      return (
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => setRecord({ ...record, [col.key]: v })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {col.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={col.type === "number" ? "number" : "text"}
        step={col.type === "number" ? "any" : undefined}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) =>
          setRecord({ ...record, [col.key]: parseValue(col, e.target.value) })
        }
        className="h-8"
      />
    );
  }

  if (isLoading) return <p className="text-sm text-[var(--color-muted)]">Cargando...</p>;
  if (error) return <p className="text-sm text-[var(--color-destructive)]">Error: {(error as Error).message}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-[var(--color-muted)]" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          size="sm"
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" />
          Agregar fila
        </Button>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creating && (
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key}>{renderCellInput(c, newRow, setNewRow)}</TableCell>
                ))}
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => insertMutation.mutate(newRow)}>
                    <Check className="size-4 text-[var(--color-success)]" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setCreating(false)}>
                    <X className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}

            {filtered.map((row) => {
              const pk = row[primaryKey] as string | number;
              const isEditing = editingKey === pk;
              return (
                <TableRow key={String(pk)}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      {isEditing && !(c.editableOnCreateOnly)
                        ? renderCellInput(c, draft, setDraft)
                        : String(row[c.key] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right space-x-1">
                    {isEditing ? (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => updateMutation.mutate(draft)}>
                          <Check className="size-4 text-[var(--color-success)]" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingKey(null)}>
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(row)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`¿Eliminar esta fila de ${table}?`)) deleteMutation.mutate(pk);
                          }}
                        >
                          <Trash2 className="size-4 text-[var(--color-destructive)]" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {filtered.length === 0 && !creating && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center text-[var(--color-muted)] py-8">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
