import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const { session, signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signUp(email, password);
    setSubmitting(false);
    if (error) setError(error);
    else setRegistered(true);
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-[var(--color-background)] px-4">
      <Card className="w-full max-w-sm rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
            <Calculator className="size-5 text-[var(--color-primary)]" />
          </div>
          <CardTitle>Asesor Tributario IA</CardTitle>
          <CardDescription>Calcula IVA, retención en la fuente e ICA de tu actividad.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
                <Button type="submit" disabled={submitting} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">
                  {submitting ? "Ingresando..." : "Ingresar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {registered ? (
                <p className="pt-4 text-sm text-[var(--color-success)]">
                  Cuenta creada. Revisa tu correo si tu proyecto Supabase requiere confirmación, o inicia sesión directamente.
                </p>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Correo</Label>
                    <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Contraseña</Label>
                    <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
                  <Button type="submit" disabled={submitting} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">
                    {submitting ? "Creando cuenta..." : "Crear cuenta"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
