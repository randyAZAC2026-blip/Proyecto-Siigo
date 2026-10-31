import { BarChart3 } from "lucide-react";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOPCompacto } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import { MatrizAhorros } from "@/components/dashboard/MatrizAhorros";

const mesLargo = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();

export function MatrizAhorrosPage({ onVolver: _onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.matrizAhorro(), []);

  const socios = (data?.socios ?? []).filter((s) => s.total > 0);
  const meses = data?.meses ?? [];
  const porMes = meses.map((m) => ({
    nombre: m.nombre,
    total: socios.reduce((t, s) => t + (s.celdas[m.nombre] || 0), 0),
    pagaron: socios.filter((s) => (s.celdas[m.nombre] || 0) > 0).length,
  }));
  const total = porMes.reduce((t, m) => t + m.total, 0);
  const conPagos = porMes.filter((m) => m.total > 0);
  const mejor = conPagos.reduce<(typeof porMes)[number] | null>((b, m) => (!b || m.total > b.total ? m : b), null);

  return (
    <InformeLayout
      titulo="Matriz de ahorros"
      descripcion="Ahorro recaudado de cada socio en cada mes del ciclo. Para registrar o corregir pagos, usa Control de pagos."
      Icon={BarChart3}
      horizontal
      cargando={loading}
      error={error}
      listo={!!data}
      onActualizar={reload}
      resumen={[
        { label: "Total ahorrado", valor: formatCOPCompacto(total) },
        { label: "Socios con ahorro", valor: String(socios.length) },
        {
          label: "Promedio por mes",
          valor: formatCOPCompacto(conPagos.length ? total / conPagos.length : 0),
          detalle: `${conPagos.length} meses con pagos`,
        },
        {
          label: "Mejor mes",
          valor: mejor ? mesLargo(mejor.nombre) : "—",
          detalle: mejor ? `${formatCOPCompacto(mejor.total)} · ${mejor.pagaron} socios` : undefined,
        },
      ]}
      excel={() => [
        {
          nombre: "Matriz de ahorros",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            ...meses.map((m) => ({ titulo: mesLargo(m.nombre), tipo: "moneda" as const, ancho: 12 })),
            { titulo: "Total", tipo: "moneda" as const },
          ],
          filas: socios.map((s) => [s.nombre, ...meses.map((m) => s.celdas[m.nombre] || null), s.total]),
          totales: ["TOTAL", ...porMes.map((m) => m.total), total],
        },
      ]}
    >
      {data && <MatrizAhorros matriz={data} />}
    </InformeLayout>
  );
}
