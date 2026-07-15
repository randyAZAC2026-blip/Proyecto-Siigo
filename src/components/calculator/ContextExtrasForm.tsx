import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import type { TaxRegime } from "@/lib/supabase/database.types";

interface Props {
  ciudad: string;
  onCiudadChange: (v: string) => void;
  tipoPersona: string;
  onTipoPersonaChange: (v: string) => void;
  regimen: string;
  onRegimenChange: (v: string) => void;
}

export function ContextExtrasForm({
  ciudad,
  onCiudadChange,
  tipoPersona,
  onTipoPersonaChange,
  regimen,
  onRegimenChange,
}: Props) {
  const { data: regimenes } = useQuery({
    queryKey: ["tax_regimes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tax_regimes").select("*").order("code");
      if (error) throw error;
      return (data ?? []) as TaxRegime[];
    },
  });

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="ciudad">Ciudad</Label>
        <Input id="ciudad" value={ciudad} onChange={(e) => onCiudadChange(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de persona</Label>
        <Select value={tipoPersona} onValueChange={onTipoPersonaChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="natural">Persona natural</SelectItem>
            <SelectItem value="juridica">Persona jurídica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Régimen tributario</Label>
        <Select value={regimen} onValueChange={onRegimenChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            {regimenes?.map((r) => (
              <SelectItem key={r.code} value={r.code}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
