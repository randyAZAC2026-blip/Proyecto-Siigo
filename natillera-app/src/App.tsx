import { PiggyBank } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NatilleraPage } from "@/pages/NatilleraPage";

export function App() {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[960px] px-4 py-3 flex items-center gap-2 font-semibold text-[var(--color-text)]">
          <PiggyBank className="size-5 text-[var(--color-primary)]" />
          Natillera
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-8">
        <ErrorBoundary>
          <NatilleraPage />
        </ErrorBoundary>
      </main>
    </div>
  );
}
