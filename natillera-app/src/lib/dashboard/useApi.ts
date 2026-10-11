import { useEffect, useState } from "react";

/** Hook simple para consumir el backend sin traer TanStack Query. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (!cancelado) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return {
    data,
    loading,
    error,
    reload: () => setTick((t) => t + 1),
  };
}
