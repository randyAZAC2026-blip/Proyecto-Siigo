import { Link, Outlet, useLocation } from "react-router-dom";
import { Wallet, Settings, LogOut, FolderCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { BottomNav } from "@/components/billetera/BottomNav";

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const esRutaAdmin = pathname.startsWith("/admin");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Wallet className="size-5 text-[var(--color-primary)]" />
            Mi billetera
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/cuentas">
              <Button variant="ghost" size="sm" aria-label="Cuentas y categorías">
                <Settings className="size-4" />
                <span className="hidden sm:inline">Ajustes</span>
              </Button>
            </Link>
            {profile?.role === "superuser" && (
              <Link to="/admin/tablas">
                <Button variant="ghost" size="sm" aria-label="Tablas fiscales">
                  <FolderCog className="size-4" />
                  <span className="hidden sm:inline">Tablas</span>
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()} aria-label="Cerrar sesión">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      {!esRutaAdmin && <BottomNav />}
    </div>
  );
}
