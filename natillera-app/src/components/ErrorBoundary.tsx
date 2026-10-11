import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[Natillera] Error atrapado:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[600px] p-6">
          <div className="rounded-[14px] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-4">
            <h2 className="font-semibold text-[var(--color-destructive)] mb-2">Algo falló</h2>
            <p className="text-sm text-[var(--color-text)] mb-3">
              {this.state.error.message || "Error desconocido"}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-sm underline text-[var(--color-primary)]"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
