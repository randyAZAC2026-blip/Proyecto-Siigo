import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClarifyingQuestion } from "@/lib/types/tax";

interface Props {
  preguntas: ClarifyingQuestion[];
  onSubmit: (respuestas: Record<string, string>) => void;
  submitting: boolean;
}

export function ClarifyingQuestions({ preguntas, onSubmit, submitting }: Props) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});

  const allAnswered = preguntas.every((p) => respuestas[p.campo]?.trim());

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="size-5 text-[var(--color-warning)]" />
          Necesito un par de datos más
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {preguntas.map((p) => (
          <div key={p.campo} className="space-y-1.5">
            <Label>{p.pregunta}</Label>
            {p.opciones && p.opciones.length > 0 ? (
              <Select
                value={respuestas[p.campo] ?? ""}
                onValueChange={(v) => setRespuestas((prev) => ({ ...prev, [p.campo]: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {p.opciones.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={respuestas[p.campo] ?? ""}
                onChange={(e) => setRespuestas((prev) => ({ ...prev, [p.campo]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <Button
          disabled={!allAnswered || submitting}
          onClick={() => onSubmit(respuestas)}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
        >
          {submitting ? "Calculando..." : "Continuar"}
        </Button>
      </CardContent>
    </Card>
  );
}
