# Mi bolsillo

Billetera personal: cuentas (efectivo, banco, billetera digital), movimientos (ingreso, egreso, transferencia),
categorías, cuentas por cobrar y por pagar. App independiente del Asesor Tributario de la raíz del repo.

- **Stack:** React 19 + Vite 8 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query + Supabase.
- **Base:** proyecto Supabase «Billetera TwinsRHG» (`tuzdmlehcgxoiffixccv`, São Paulo). Migraciones en
  `supabase/migrations/` (0002 tablas y RLS, 0003 optimización de RLS), ya aplicadas.
- **Seguridad:** cada tabla tiene RLS `user_id = auth.uid()`: cada usuario ve solo lo suyo. Los saldos se calculan a
  partir de los movimientos (vista), nunca se guardan a mano.
- **Publicación:** Vercel, con `billetera-app` como carpeta raíz y `vercel.json` para las rutas de la SPA.

## Desarrollo

```bash
cp .env.example .env.local   # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (llave publicable)
npm install
npm run dev
npm run build
```
