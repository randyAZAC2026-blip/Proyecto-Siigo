import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertInto, updateWhere } from "@/lib/supabase/mutations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RESPONSABILIDADES_CATALOGO } from "@/lib/agenda/helpers";
import type { Cliente, TipoPersona } from "@/lib/supabase/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: Cliente;
}

export function ClienteFormDialog({ open, onOpenChange, cliente }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!cliente;

  const [razonSocial, setRazonSocial] = useState(cliente?.razon_social ?? "");
  const [nit, setNit] = useState(cliente?.nit ?? "");
  const [ultimoDigito, setUltimoDigito] = useState<string>(
    cliente?.ultimo_digito_nit != null ? String(cliente.ultimo_digito_nit) : "",
  );
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>(cliente?.tipo_persona ?? "juridica");
  const [regimen, setRegimen] = useState(cliente?.regimen ?? "");
  const [responsabilidades, setResponsabilidades] = useState<string[]>(cliente?.responsabilidades ?? []);
  const [notas, setNotas] = useState(cliente?.notas ?? "");

  function autoDigito(nitValue: string) {
    const clean = nitValue.replace(/[^\d]/g, "");
    if (clean.length === 0) return "";
    return clean.charAt(clean.length - 1);
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sin sesión");
      const payload = {
        owner_id: user.id,
        razon_social: razonSocial.trim(),
        nit: nit.trim() || null,
        ultimo_digito_nit: ultimoDigito === "" ? null : Number(ultimoDigito),
        tipo_persona: tipoPersona,
        regimen: regimen.trim() || null,
        responsabilidades,
        notas: notas.trim() || null,
      };
      if (isEdit) {
        await updateWhere("clientes", cliente!.id, payload);
      } else {
        await insertInto("clientes", payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onOpenChange(false);
    },
  });

  function toggleResp(codigo: string) {
    setResponsabilidades((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            Los datos son privados: solo tú los ves y editas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="razon">Razón social *</Label>
            <Input
              id="razon"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Comercializadora XYZ S.A.S."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                value={nit}
                onChange={(e) => {
                  setNit(e.target.value);
                  setUltimoDigito(autoDigito(e.target.value));
                }}
                placeholder="900123456-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digito">Último dígito NIT</Label>
              <Input
                id="digito"
                type="number"
                min={0}
                max={9}
                value={ultimoDigito}
                onChange={(e) => setUltimoDigito(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de persona</Label>
              <Select value={tipoPersona} onValueChange={(v) => setTipoPersona(v as TipoPersona)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="juridica">Jurídica</SelectItem>
                  <SelectItem value="natural">Natural</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regimen">Régimen</Label>
              <Input
                id="regimen"
                value={regimen}
                onChange={(e) => setRegimen(e.target.value)}
                placeholder="Ordinario, Simple, ..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsabilidades tributarias</Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
              {RESPONSABILIDADES_CATALOGO.map((r) => (
                <label
                  key={r.codigo}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--color-background)] rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={responsabilidades.includes(r.codigo)}
                    onChange={() => toggleResp(r.codigo)}
                    className="accent-[var(--color-primary)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Contacto, particularidades, actividad económica..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !razonSocial.trim()}
          >
            {mut.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cliente"}
          </Button>
        </DialogFooter>
        {mut.error instanceof Error && (
          <p className="text-sm text-[var(--color-destructive)]">{mut.error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
