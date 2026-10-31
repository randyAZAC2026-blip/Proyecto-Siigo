import { useEffect, useRef, useState } from "react";

/** Mide el ancho de un contenedor (para dibujar SVG nítidos sin deformar). */
// El ancho inicial es pequeño a propósito: si arrancara ancho, el SVG estiraría
// su contenedor (en el celular) y el observador mediría ese ancho inflado.
export function useAncho<T extends HTMLElement>(inicial = 300) {
  const ref = useRef<T | null>(null);
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setAncho(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}
