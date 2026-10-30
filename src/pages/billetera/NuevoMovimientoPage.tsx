import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovimientoForm } from "@/components/billetera/MovimientoForm";
import { EmptyState } from "@/components/billetera/EmptyState";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useCuentas, useCategorias, useCrearMovimiento } from "@/lib/billetera/hooks";

export function NuevoMovimientoPage() {
  const navigate = useNavigate();
  const cuentas = useCuentas();
  const categorias = useCategorias();
  const crear = useCrearMovimiento();

  if (cuentas.isLoading) return null;

  if (!cuentas.data || cuentas.data.filter((c) => !c.archivada).length === 0) {
    return (
      <EmptyState
        title="Necesitas al menos una cuenta activa"
        description="Crea tu primera cuenta (efectivo, banco, Nequi, etc.) para empezar a registrar movimientos."
        action={
          <Link to="/cuentas">
            <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">
              Crear cuenta
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader>
          <CardTitle className="text-base">Registrar movimiento</CardTitle>
        </CardHeader>
        <CardContent>
          <MovimientoForm
            cuentas={cuentas.data}
            categorias={categorias.data ?? []}
            onSubmit={async (input) => {
              await crear.mutateAsync(input);
              navigate("/movimientos");
            }}
            onCancel={() => navigate(-1)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
