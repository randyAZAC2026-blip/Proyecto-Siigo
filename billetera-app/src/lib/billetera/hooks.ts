import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import * as api from "@/lib/billetera/queries";

const keys = {
  cuentas: (userId: string) => ["billetera", "cuentas", userId] as const,
  saldos: (userId: string) => ["billetera", "saldos", userId] as const,
  categorias: (userId: string) => ["billetera", "categorias", userId] as const,
  movimientos: (userId: string, opts?: api.ListMovimientosOpts) =>
    ["billetera", "movimientos", userId, opts ?? {}] as const,
  cxp: (userId: string) => ["billetera", "cxp", userId] as const,
  cxc: (userId: string) => ["billetera", "cxc", userId] as const,
};

export function useCuentas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.cuentas(user?.id ?? ""),
    queryFn: () => api.listCuentas(user!.id),
    enabled: !!user,
  });
}

export function useSaldos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.saldos(user?.id ?? ""),
    queryFn: () => api.listSaldos(user!.id),
    enabled: !!user,
  });
}

export function useCategorias() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.categorias(user?.id ?? ""),
    queryFn: () => api.listCategorias(user!.id),
    enabled: !!user,
  });
}

export function useMovimientos(opts: api.ListMovimientosOpts = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.movimientos(user?.id ?? "", opts),
    queryFn: () => api.listMovimientos(user!.id, opts),
    enabled: !!user,
  });
}

export function useCxP() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.cxp(user?.id ?? ""),
    queryFn: () => api.listCxP(user!.id),
    enabled: !!user,
  });
}

export function useCxC() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.cxc(user?.id ?? ""),
    queryFn: () => api.listCxC(user!.id),
    enabled: !!user,
  });
}

// Invalidar todo el namespace "billetera" tras una mutación — menos propenso a
// desincronizaciones que invalidar key por key. En apps con mucho tráfico se
// afinaría; para una billetera personal es irrelevante.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["billetera"] });
}

export function useCrearCuenta() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CrearCuentaInput) => api.crearCuenta(user!.id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useActualizarCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.actualizarCuenta>[1] }) =>
      api.actualizarCuenta(id, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEliminarCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarCuenta(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCrearCategoria() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.crearCategoria>[1]) =>
      api.crearCategoria(user!.id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEliminarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarCategoria(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCrearMovimiento() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CrearMovimientoInput) => api.crearMovimiento(user!.id, input),
    onSuccess: (mov) => {
      invalidateAll(qc);
      if (mov.reciboError) alert(`El movimiento se guardó, pero el recibo no se pudo subir (${mov.reciboError}). Adjúntalo con el clip en Movimientos.`);
    },
  });
}

export function useSubirRecibo() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ movimientoId, archivo, rutaAnterior }: { movimientoId: string; archivo: File; rutaAnterior: string | null }) =>
      api.subirRecibo(user!.id, movimientoId, archivo, rutaAnterior),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useQuitarRecibo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ movimientoId, ruta }: { movimientoId: string; ruta: string }) => api.quitarRecibo(movimientoId, ruta),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEliminarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarMovimiento(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCrearCxP() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CrearCxPInput) => api.crearCxP(user!.id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCrearCxC() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CrearCxCInput) => api.crearCxC(user!.id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEliminarCxP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarCxP(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEliminarCxC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarCxC(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSembrarCategoriasPorDefecto() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sembrarCategoriasPorDefecto(user!.id),
    onSuccess: () => invalidateAll(qc),
  });
}
