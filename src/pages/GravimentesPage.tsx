export function GravimentesPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gravimentes · Compras y Contai</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Importa XML y ZIP, revisa las cuentas y prepara archivos TXT para Contai
          desde el conversor instalado en este equipo.
        </p>
      </div>
      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Abrir el conversor local</h2>
        <p>Inicia el conversor desde la carpeta gravimentes-local del proyecto y luego abre la aplicación.</p>
        <a className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
          href="http://127.0.0.1:8765/" target="_blank" rel="noopener noreferrer">
          Abrir Gravimentes en este equipo
        </a>
        <p className="text-sm text-muted-foreground">
          Si no abre, ejecuta Iniciar conversor.cmd. El enlace requiere que el servidor local esté encendido.
        </p>
      </div>
      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Datos y alcance</h2>
        <p>Las empresas, facturas e historial del conversor permanecen en su base local.
          La sesión y las tablas del asesor tributario continúan en Supabase.
          Todavía no hay sincronización entre ambas aplicaciones.</p>
        <p>Contai recibe archivos TXT según su plantilla de importación; no se conecta mediante API.</p>
        <p>La conciliación bancaria del PR #3 aporta documentación y un esquema de base de datos.
          Su flujo operativo aún requiere implementación y validación.</p>
      </div>
    </section>
  );
}
