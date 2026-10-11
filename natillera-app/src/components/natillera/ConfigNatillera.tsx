import { useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { parseCOP } from "@/lib/natillera/format";

type Props = {
  nombre: string;
  cuotaBase: number;
  anioActivo: number;
  onSave: (patch: { nombre: string; cuotaBase: number; anioActivo: number }) => void;
};

export function ConfigNatillera({ nombre, cuotaBase, anioActivo, onSave }: Props) {
  const [localNombre, setLocalNombre] = useState(nombre);
  const [localCuota, setLocalCuota] = useState(String(cuotaBase));
  const [localAnio, setLocalAnio] = useState(String(anioActivo));

  function handleSave() {
    onSave({
      nombre: localNombre.trim() || "Mi natillera",
      cuotaBase: parseCOP(localCuota),
      anioActivo: Math.max(2000, Math.min(2100, Number(localAnio) || anioActivo)),
    });
  }

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle>Configuración</CardTitle>
        <CardDescription>Nombre de la natillera, cuota base y año que estás gestionando.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="nat-nombre">Nombre</Label>
            <Input
              id="nat-nombre"
              value={localNombre}
              onChange={(e) => setLocalNombre(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nat-cuota">Cuota base mensual</Label>
            <Input
              id="nat-cuota"
              inputMode="numeric"
              value={localCuota}
              onChange={(e) => setLocalCuota(e.target.value)}
              placeholder="50000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nat-anio">Año activo</Label>
            <Input
              id="nat-anio"
              inputMode="numeric"
              value={localAnio}
              onChange={(e) => setLocalAnio(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={handleSave}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          <Save className="size-4" />
          Guardar configuración
        </Button>
      </CardContent>
    </Card>
  );
}
