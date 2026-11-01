import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCategorias,
  useCrearCategoria,
  useEliminarCategoria,
} from "@/lib/billetera/hooks";
import type { CategoriaTipo } from "@/lib/supabase/database.types";

export function CategoriasPage() {
  const categorias = useCategorias();
  const crear = useCrearCategoria();
  const eliminar = useEliminarCategoria();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<CategoriaTipo>("egreso");
  const [error, setError] = useState<string | null>(null);

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    try {
      await crear.mutateAsync({ nombre: nombre.trim(), tipo });
      setNombre("");
      setAbierto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const ingresos = (categorias.data ?? []).filter((c) => c.tipo === "ingreso");
  const egresos = (categorias.data ?? []).filter((c) => c.tipo === "egreso");

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Categorías</h1>
        <div className="flex items-center gap-2">
          <Link to="/cuentas">
            <Button variant="outline" size="sm">
              <Wallet className="size-4" />
              Cuentas
            </Button>
          </Link>
          <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="size-4" />
              Nueva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva categoría</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCrear} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-nombre">Nombre</Label>
                <Input
                  id="cat-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Mercado, Gasolina, Honorarios..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as CategoriaTipo)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
              <Button
                type="submit"
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                Crear
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      {categorias.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader>
              <CardTitle className="text-sm text-[var(--color-success)]">Ingresos</CardTitle>
            </CardHeader>
            <CardContent>
              {ingresos.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">Sin categorías de ingreso.</p>
              ) : (
                ingresos.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border-b border-[var(--color-border)] py-2 last:border-b-0"
                  >
                    <p className="text-sm">{c.nombre}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar la categoría "${c.nombre}"?`)) eliminar.mutate(c.id);
                      }}
                      className="text-[var(--color-muted)] hover:text-[var(--color-destructive)]"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader>
              <CardTitle className="text-sm text-[var(--color-destructive)]">Egresos</CardTitle>
            </CardHeader>
            <CardContent>
              {egresos.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">Sin categorías de egreso.</p>
              ) : (
                egresos.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border-b border-[var(--color-border)] py-2 last:border-b-0"
                  >
                    <p className="text-sm">{c.nombre}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar la categoría "${c.nombre}"?`)) eliminar.mutate(c.id);
                      }}
                      className="text-[var(--color-muted)] hover:text-[var(--color-destructive)]"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
