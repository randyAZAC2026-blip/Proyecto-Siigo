import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertTriangle className="size-8 text-[var(--color-destructive)]" />
          <p className="font-medium text-[var(--color-text)]">Algo salió mal.</p>
          <p className="text-sm text-[var(--color-muted)] max-w-sm">{this.state.error.message}</p>
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Reintentar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
