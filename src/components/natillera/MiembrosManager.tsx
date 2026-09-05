import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP, parseCOP } from "@/lib/natillera/format";
import type { Miembro } from "@/lib/natillera/types";

type Props = {
  miembros: Miembro[];
  cuotaBase: number;
  onAdd: (input: { nombre: string; cuotaMensual: number; notas?: string }) => void;
  onUpdate: (id: string, patch: Partial<Omit<Miembro, "id" | "creadoEn">>) => void;
  onRemove: (id: string) => void;
};

export function MiembrosManager({ miembros, cuotaBase, onAdd, onUpdate, onRemove }: Props) {
  const [nombre, setNombre] = useState("");
  const [cuota, setCuota] = useState("");
  const [notas, setNotas] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editCuota, setEditCuota] = useState("");

  function handleAdd() {
    if (!nombre.trim()) return;
    const cuotaMensual = cuota.trim() ? parseCOP(cuota) : cuotaBase;
    onAdd({ nombre, cuotaMensual, notas: notas.trim() || undefined });
    setNombre("");
    setCuota("");
    setNotas("");
  }

  function startEdit(m: Miembro) {
    setEditingId(m.id);
    setEditNombre(m.nombre);
    setEditCuota(String(m.cuotaMensual));
  }

  function saveEdit(id: string) {
    onUpdate(id, {
      nombre: editNombre.trim() || undefined,
      cuotaMensual: parseCOP(editCuota),
    });
    setEditingId(null);
  }

  function handleRemove(m: Miembro) {
    if (confirm(`¿Eliminar a ${m.nombre}? También se borran sus pagos registrados.`)) {
      onRemove(m.id);
    }
  }

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Miembros</CardTitle>
        <CardDescription>
          Cada miembro puede tener su propia cuota mensual. Si dejas la cuota vacía se usa la cuota base
          ({formatCOP(cuotaBase)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="miembro-nombre">Nombre</Label>
            <Input
              id="miembro-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="miembro-cuota">Cuota (opcional)</Label>
            <Input
              id="miembro-cuota"
              inputMode="numeric"
              value={cuota}
              onChange={(e) => setCuota(e.target.value)}
              placeholder={String(cuotaBase)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="miembro-notas">Notas</Label>
            <Input
              id="miembro-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
              maxLength={300}
            />
          </div>
          <Button
            onClick={handleAdd}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            <Plus className="size-4" />
            Agregar
          </Button>
        </div>

        {miembros.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Aún no has agregado miembros. Empieza registrando al primero arriba.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Cuota mensual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {miembros.map((m) => {
                const isEditing = editingId === m.id;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          className="h-8"
                        />
                      ) : (
                        <span className="font-medium">{m.nombre}</span>
                      )}
                      {m.notas && !isEditing && (
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">{m.notas}</p>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {isEditing ? (
                        <Input
                          inputMode="numeric"
                          value={editCuota}
                          onChange={(e) => setEditCuota(e.target.value)}
                          className="h-8 w-32"
                        />
                      ) : (
                        formatCOP(m.cuotaMensual)
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.activo ? "default" : "secondary"}
                        className={
                          m.activo
                            ? "bg-[var(--color-success)]/15 text-[var(--color-success)] hover:bg-[var(--color-success)]/20"
                            : ""
                        }
                      >
                        {m.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(m.id)}>
                              <Check className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onUpdate(m.id, { activo: !m.activo })}
                              title={m.activo ? "Marcar inactivo" : "Marcar activo"}
                            >
                              {m.activo ? "Pausar" : "Reactivar"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemove(m)}
                              className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
