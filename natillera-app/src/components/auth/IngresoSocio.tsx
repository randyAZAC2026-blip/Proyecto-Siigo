import { useState, type FormEvent } from "react";
import { AlertCircle, LogIn, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { limpiarCedula, useSesion } from "@/lib/auth/useSesion";

export function IngresoSocio() {
  const { entrar } = useSesion();
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (limpiarCedula(cedula).length < 3) return setError("Escribe tu número de cédula.");
    if (!/^\d{6}$/.test(pin.trim())) return setError("El PIN tiene 6 dígitos.");
    setEnviando(true);
    try {
      await entrar(cedula, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <PiggyBank className="mx-auto size-10 text-[var(--color-primary)]" />
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Natillera</h1>
          <p className="text-sm text-[var(--color-muted)]">Entra con tu cédula y el PIN que te entregó la administración.</p>
        </div>
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="cedula">Cédula</Label>
                <Input
                  id="cedula"
                  inputMode="numeric"
                  autoComplete="username"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Sin puntos ni espacios"
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin">PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 dígitos"
                  className="h-11 text-base tracking-[0.4em]"
                />
              </div>
              {error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-[var(--color-destructive)]">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full h-11" disabled={enviando}>
                <LogIn className="size-4" />
                {enviando ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-[var(--color-muted)]">¿Olvidaste el PIN? Pídele uno nuevo a la administración.</p>
      </div>
    </div>
  );
}
