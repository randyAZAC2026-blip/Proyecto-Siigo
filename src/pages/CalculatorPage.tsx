import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calculator as CalculatorIcon, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DescripcionActividadInput } from "@/components/calculator/DescripcionActividadInput";
import { ContextExtrasForm } from "@/components/calculator/ContextExtrasForm";
import { ClarifyingQuestions } from "@/components/calculator/ClarifyingQuestions";
import { ResultadoDetallado } from "@/components/calculator/ResultadoDetallado";
import { classifyTax } from "@/lib/api/classifyTax";
import { classificationRequestSchema, type ClassificationResponse } from "@/lib/types/tax";

export function CalculatorPage() {
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [ciudad, setCiudad] = useState("Medellín");
  const [tipoPersona, setTipoPersona] = useState("");
  const [regimen, setRegimen] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResponse | null>(null);

  const mutation = useMutation({
    mutationFn: classifyTax,
    onSuccess: (data) => setResult(data),
  });

  function buildBasePayload() {
    return {
      descripcion_actividad: descripcion,
      valor_servicio: Number(valor),
      ciudad: ciudad || "Medellín",
      tipo_persona: (tipoPersona || undefined) as "natural" | "juridica" | undefined,
      regimen_tributario: regimen || undefined,
    };
  }

  function handleSubmit() {
    setFormError(null);
    const parsed = classificationRequestSchema.safeParse(buildBasePayload());
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisa los datos ingresados.");
      return;
    }
    setResult(null);
    mutation.mutate(parsed.data);
  }

  function handleClarification(respuestas: Record<string, string>) {
    mutation.mutate({ ...buildBasePayload(), respuestas_aclaracion: respuestas });
  }

  function handleReset() {
    setResult(null);
    mutation.reset();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
          <CalculatorIcon className="size-6 text-[var(--color-primary)]" />
          Calculadora tributaria
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Describe tu actividad y el valor a cobrar — te decimos qué impuestos aplican.
        </p>
      </div>

      {!result && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader>
            <CardTitle>Cuéntame sobre tu venta</CardTitle>
            <CardDescription>Ciudad y régimen son opcionales, pero ayudan a afinar el resultado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <DescripcionActividadInput
              descripcion={descripcion}
              onDescripcionChange={setDescripcion}
              valor={valor}
              onValorChange={setValor}
            />
            <ContextExtrasForm
              ciudad={ciudad}
              onCiudadChange={setCiudad}
              tipoPersona={tipoPersona}
              onTipoPersonaChange={setTipoPersona}
              regimen={regimen}
              onRegimenChange={setRegimen}
            />

            {formError && (
              <p className="flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
                <AlertCircle className="size-4" />
                {formError}
              </p>
            )}
            {mutation.isError && (
              <p className="flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
                <AlertCircle className="size-4" />
                {(mutation.error as Error).message}
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              {mutation.isPending ? "Calculando..." : "Calcular"}
            </Button>
          </CardContent>
        </Card>
      )}

      {mutation.isPending && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-40 rounded-[var(--radius-card)]" />
          <Skeleton className="h-40 rounded-[var(--radius-card)]" />
          <Skeleton className="h-40 rounded-[var(--radius-card)]" />
        </div>
      )}

      {result?.status === "needs_clarification" && (
        <ClarifyingQuestions
          preguntas={result.preguntas}
          onSubmit={handleClarification}
          submitting={mutation.isPending}
        />
      )}

      {result?.status === "resolved" && (
        <div className="space-y-4">
          <ResultadoDetallado result={result} />
          <Button variant="outline" onClick={handleReset}>
            Calcular otro
          </Button>
        </div>
      )}
    </div>
  );
}
