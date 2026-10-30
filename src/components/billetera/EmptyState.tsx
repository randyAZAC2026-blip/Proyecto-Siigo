import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <Card className="rounded-[var(--radius-card)] border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {icon && <div className="text-[var(--color-primary)]">{icon}</div>}
        <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        {description && <p className="max-w-xs text-sm text-[var(--color-muted)]">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
