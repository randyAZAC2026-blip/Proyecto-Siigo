import { Wallet } from "lucide-react";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOPCompacto } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import { LiquidacionCard } from "@/components/dashboard/LiquidacionCard";

export function LiquidacionPage({ onVolver: _onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.liquidacion(), []);

  // Mismo filtro que la tabla: solo socios con aportes o deudas.
  const filas = (data ?? []).filter((f) => f.total_aportes > 0 || f.deducc_prestamo > 0 || f.deducc_multas > 0);
  const s = (fn: (f: (typeof filas)[number]) => number) => filas.reduce((t, f) => t + fn(f), 0);
  const aportes = s((f) => f.total_aportes);
  const deducciones = s(
    (f) => f.deducc_prestamo + f.deducc_multas,
  );
  const neto = s((f) => f.neto_a_recibir);
  const enNegativo = filas.filter((f) => f.neto_a_recibir < 0).length;

  return (
    <InformeLayout
      titulo="Liquidación"
      descripcion="Si el ciclo se cerrara hoy: cada socio recibe lo que aportó (ahorro, actividades, rifa e intereses pagados) menos lo que debe (saldo de préstamo y multas)."
      Icon={Wallet}
      horizontal
      cargando={loading}
      error={error}
      listo={!!data}
      onActualizar={reload}
      resumen={[
        { label: "Socios a liquidar", valor: String(filas.length) },
        { label: "Aportes", valor: formatCOPCompacto(aportes) },
        { label: "Deducciones", valor: formatCOPCompacto(-deducciones) },
        {
          label: "Neto a pagar",
          valor: formatCOPCompacto(neto),
          detalle: enNegativo > 0 ? `${enNegativo} socios quedan debiendo` : "Ningún socio queda debiendo",
          tono: enNegativo > 0 ? "alerta" : "bueno",
        },
      ]}
      excel={() => [
        {
          nombre: "Liquidación",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Ahorro", tipo: "moneda" },
            { titulo: "Actividades", tipo: "moneda" },
            { titulo: "Rifa", tipo: "moneda" },
            { titulo: "Intereses pagados", tipo: "moneda" },
            { titulo: "Total aportes", tipo: "moneda" },
            { titulo: "Saldo préstamo", tipo: "moneda" },
            { titulo: "Multas", tipo: "moneda" },
            { titulo: "Neto a recibir", tipo: "moneda" },
          ],
          filas: filas.map((f) => [
            f.nombre,
            f.ahorro,
            f.actividades,
            f.rifa_chance,
            f.intereses_pagados,
            f.total_aportes,
            -f.deducc_prestamo,
            -f.deducc_multas,
            f.neto_a_recibir,
          ]),
          totales: [
            "TOTAL",
            s((f) => f.ahorro),
            s((f) => f.actividades),
            s((f) => f.rifa_chance),
            s((f) => f.intereses_pagados),
            aportes,
            -s((f) => f.deducc_prestamo),
            -s((f) => f.deducc_multas),
            neto,
          ],
        },
      ]}
    >
      {data && <LiquidacionCard filas={data} />}
    </InformeLayout>
  );
}
