import { Link, Outlet } from "react-router-dom";
import { PiggyBank, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { supabaseConfigured } from "@/lib/supabase/client";

export function NatilleraStandaloneLayout() {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[960px] px-4 py-3 flex items-center justify-between">
          <Link to="/natillera" className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-5 text-[var(--color-primary)]" />
            Natillera
          </Link>
          {supabaseConfigured && (
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" />
                Asesor tributario
              </Button>
            </Link>
          )}
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
