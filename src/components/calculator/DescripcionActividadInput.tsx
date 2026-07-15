import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface Props {
  descripcion: string;
  onDescripcionChange: (v: string) => void;
  valor: string;
  onValorChange: (v: string) => void;
}

export function DescripcionActividadInput({ descripcion, onDescripcionChange, valor, onValorChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="descripcion">¿Qué vendes o a qué te dedicas?</Label>
        <Textarea
          id="descripcion"
          placeholder="Ej: vendo arepas y empanadas en un puesto callejero, o hago consultoría de software para empresas..."
          rows={3}
          value={descripcion}
          onChange={(e) => onDescripcionChange(e.target.value)}
        />
        <p className="text-xs text-[var(--color-muted)]">
          Descríbelo con tus palabras, no necesitas términos contables.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="valor">Valor del servicio o producto (COP)</Label>
        <Input
          id="valor"
          type="number"
          min="0"
          placeholder="Ej: 150000"
          value={valor}
          onChange={(e) => onValorChange(e.target.value)}
        />
      </div>
    </div>
  );
}
