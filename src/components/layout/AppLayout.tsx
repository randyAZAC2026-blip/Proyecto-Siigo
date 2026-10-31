import { Link, Outlet } from "react-router-dom";
import { Calculator, Settings, LogOut, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[960px] px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Calculator className="size-5 text-[var(--color-primary)]" />
            Asesor Tributario IA
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/natillera">
              <Button variant="ghost" size="sm">
                <PiggyBank className="size-4" />
                Natillera
              </Button>
            </Link>
            {profile?.role === "superuser" && (
              <Link to="/admin/tablas">
                <Button variant="ghost" size="sm">
                  <Settings className="size-4" />
                  Tablas
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="size-4" />
              Salir
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
