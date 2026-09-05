import { Link, NavLink, Outlet } from "react-router-dom";
import { Calculator, Settings, LogOut, CalendarCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { cn } from "@/lib/utils";

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
          isActive
            ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
            : "text-[var(--color-text)] hover:bg-[var(--color-background)]",
        )
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[1100px] px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--color-text)] shrink-0">
            <Calculator className="size-5 text-[var(--color-primary)]" />
            <span className="hidden sm:inline">Asesor Tributario IA</span>
          </Link>
          <nav className="flex items-center gap-1 flex-1 justify-center">
            <NavItem to="/" icon={<Calculator className="size-4" />} label="Calculadora" />
            <NavItem to="/agenda" icon={<CalendarCheck className="size-4" />} label="Agenda" />
            <NavItem to="/clientes" icon={<Users className="size-4" />} label="Clientes" />
          </nav>
          <div className="flex items-center gap-1 shrink-0">
            {profile?.role === "superuser" && (
              <Link to="/admin/tablas">
                <Button variant="ghost" size="sm">
                  <Settings className="size-4" />
                  <span className="hidden sm:inline">Tablas</span>
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
