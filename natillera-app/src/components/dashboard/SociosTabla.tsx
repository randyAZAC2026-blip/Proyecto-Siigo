import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import type { Socio } from "@/lib/dashboard/api";

type SortKey =
  | "nombre"
  | "ahorro"
  | "actividades"
  | "rifa_chance"
  | "total_aportado"
  | "saldo_prestamos";

export function SociosTabla({ socios }: { socios: Socio[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("total_aportado");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const filtrados = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtro = query
      ? socios.filter((s) => s.nombre.toLowerCase().includes(query))
      : socios;
    const ordenado = [...filtro].sort((a, b) => {
      const va = a[sort];
      const vb = b[sort];
      if (typeof va === "string" && typeof vb === "string") {
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return dir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });
    return ordenado;
  }, [socios, q, sort, dir]);

  function toggleSort(k: SortKey) {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir(k === "nombre" ? "asc" : "desc");
    }
  }

  const SortHead = ({ k, label, align }: { k: SortKey; label: string; align?: "right" }) => (
    <TableHead
      className={`cursor-pointer select-none ${align === "right" ? "text-right" : ""}`}
      onClick={() => toggleSort(k)}
    >
      {label}
      {sort === k && <span className="ml-1 text-[var(--color-muted)]">{dir === "asc" ? "▲" : "▼"}</span>}
    </TableHead>
  );

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Socios y aportes</CardTitle>
          <CardDescription>
            {filtrados.length} socios · clic en un encabezado para ordenar
          </CardDescription>
        </div>
        <div className="relative w-56 max-w-full">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-muted)]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar socio…"
            className="pl-7"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="nombre" label="Socio" />
              <SortHead k="ahorro" label="Ahorro" align="right" />
              <SortHead k="actividades" label="Actividades" align="right" />
              <SortHead k="rifa_chance" label="Rifa" align="right" />
              <SortHead k="total_aportado" label="Total aportado" align="right" />
              <SortHead k="saldo_prestamos" label="Deuda" align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCOP(s.ahorro)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCOP(s.actividades)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCOP(s.rifa_chance)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCOP(s.total_aportado)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    s.saldo_prestamos > 0 ? "text-[var(--color-warning)]" : ""
                  }`}
                >
                  {formatCOP(s.saldo_prestamos)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
