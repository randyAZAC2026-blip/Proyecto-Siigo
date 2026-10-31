import { useState, type FormEvent } from "react";
import { AlertCircle, Landmark, LineChart, LogIn, ShieldCheck } from "lucide-react";
import { Marca } from "@/components/layout/Marca";
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
    const texto = cedula.trim();
    const esCorreo = texto.includes("@");
    if (!esCorreo && limpiarCedula(texto).length < 3) return setError("Escribe tu número de cédula o tu correo.");
    if (!/^\d{6}$/.test(pin.trim())) return setError("El PIN tiene 6 dígitos.");
    setEnviando(true);
    try {
      await entrar(texto, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-svh grid lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: solo en pantallas grandes. */}
      <aside className="relative hidden overflow-hidden bg-[var(--sidebar)] p-12 text-[var(--sidebar-fg)] lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-[#2f8f5b]/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <Marca />
          <span className="text-lg font-semibold text-white">Natillera</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Las cuentas de la natillera, claras y al día.
          </h2>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { Icon: ShieldCheck, t: "Acceso solo para tesorería, con permisos en la base de datos." },
              { Icon: Landmark, t: "Cada pago cruzado contra el extracto de Bancolombia." },
              { Icon: LineChart, t: "Ahorro, préstamos y rendimientos del ciclo en un solo panel." },
            ].map(({ Icon, t }) => (
              <li key={t} className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/8 text-[var(--sidebar-accent)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1.5">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-[var(--sidebar-muted)]">© {new Date().getFullYear()} Natillera · Tesorería</p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center lg:text-left">
          <div className="flex justify-center lg:hidden">
            <Marca />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Iniciar sesión</h1>
          <p className="text-sm text-[var(--color-muted)]">Entra con tu cédula (o correo) y tu PIN.</p>
        </div>
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] shadow-[var(--shadow-card)]">
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="cedula">Cédula o correo</Label>
                <Input
                  id="cedula"
                  autoComplete="username"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Cédula sin puntos, o tu correo"
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
        <p className="text-center text-xs text-[var(--color-muted)] lg:text-left">¿Olvidaste el PIN? Pídele uno nuevo a la administración.</p>
      </div>
      </div>
    </div>
  );
}
