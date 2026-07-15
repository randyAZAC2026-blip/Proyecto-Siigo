import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { TABLAS } from "@/lib/tablasConfig";

function useRowCount(table: string) {
  return useQuery({
    queryKey: [table, "count"],
    queryFn: async () => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function TablaCard({ slug, table, label }: { slug: string; table: string; label: string }) {
  const { data: count, isLoading } = useRowCount(table);
  return (
    <Link to={`/admin/tablas/${slug}`}>
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium text-[var(--color-text)]">{label}</p>
            <p className="text-sm text-[var(--color-muted)]">
              {isLoading ? "Cargando..." : `${count} filas`}
            </p>
          </div>
          <ChevronRight className="size-5 text-[var(--color-muted)]" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function TablasAdminPage() {
  return (
    <div className="space-y-6">
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader>
          <CardTitle>Tablas fiscales</CardTitle>
          <CardDescription>
            Edita las tarifas y bases que usa la calculadora. Los cambios aplican de inmediato al siguiente cálculo.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {TABLAS.map((t) => (
          <TablaCard key={t.slug} slug={t.slug} table={t.table} label={t.label} />
        ))}
      </div>
    </div>
  );
}
