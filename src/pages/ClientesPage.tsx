import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { deleteWhere } from "@/lib/supabase/mutations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClienteFormDialog } from "@/components/agenda/ClienteFormDialog";
import type { Cliente } from "@/lib/supabase/database.types";
import { RESPONSABILIDADES_CATALOGO } from "@/lib/agenda/helpers";

function responsabilidadLabel(codigo: string): string {
  return RESPONSABILIDADES_CATALOGO.find((r) => r.codigo === codigo)?.label ?? codigo;
}

export function ClientesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["clientes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("razon_social", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
    enabled: !!user,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWhere("clientes", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes"] }),
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>
              Empresas y personas cuya tributación gestionas. El último dígito del NIT permite calcular vencimientos automáticos.
            </CardDescription>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nuevo cliente
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !clientes || clientes.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Aún no tienes clientes registrados. Crea el primero para empezar a programar sus obligaciones.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razón social</TableHead>
                    <TableHead>NIT</TableHead>
                    <TableHead>Últ. dígito</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Responsabilidades</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.razon_social}</TableCell>
                      <TableCell>{c.nit ?? "—"}</TableCell>
                      <TableCell>{c.ultimo_digito_nit ?? "—"}</TableCell>
                      <TableCell className="capitalize">{c.tipo_persona}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.responsabilidades.slice(0, 3).map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">
                              {responsabilidadLabel(r)}
                            </Badge>
                          ))}
                          {c.responsabilidades.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{c.responsabilidades.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`¿Eliminar ${c.razon_social}? Sus tareas quedarán sin cliente.`)) {
                                deleteMut.mutate(c.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4 text-[var(--color-destructive)]" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <ClienteFormDialog open onOpenChange={setCreating} />}
      {editing && (
        <ClienteFormDialog
          open
          onOpenChange={(v) => !v && setEditing(null)}
          cliente={editing}
        />
      )}
    </div>
  );
}
