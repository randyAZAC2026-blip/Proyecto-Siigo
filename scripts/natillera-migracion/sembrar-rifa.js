// scripts/natillera-migracion/sembrar-rifa.js
// Siembra la "Rifa 30 de octubre" + 100 boletas en la BD local SQLite.
// Idempotente: si la actividad y las boletas ya existen, no hace nada.
//
// Uso:
//   node sembrar-rifa.js
//
// Variables de entorno opcionales:
//   NAT_DB → ruta al archivo natillera.db (default: ./natillera.db)

process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  console.warn(`(node) ${w.name}: ${w.message}`);
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { inicializarDB, cerrarDB } from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(
  process.env.NAT_DB || path.join(__dirname, "natillera.db"),
);

const BOLETAS = [
  ["1396","Ana Garavito"],["5146","Ana Garavito"],["8536","Ana Garavito"],
  ["0176","Ana Sofia Garavito"],["8764","Ana Sofia Garavito"],
  ["3531","Andres Arango (Robin)"],["7473","Andres Arango (Robin)"],
  ["5908","Andres Rico"],["7357","Andres Rico"],
  ["2344","Camilo Higuita"],["6472","Camilo Higuita"],
  ["0699","Carlos FAFA"],["3267","Carlos FAFA"],
  ["5213","Carlos Mario Julio"],["8047","Carlos Mario Julio"],
  ["0543","Cristian Ortiz"],["8297","Cristian Ortiz"],
  ["0371","Cristina Cossio"],["1277","Cristina Cossio"],
  ["9553","Daniel Jaramillo"],["9788","Daniel Jaramillo"],
  ["5656","Danissa TAT"],["9618","Danissa TAT"],
  ["4434","Dario Hernandez"],["9351","Dario Hernandez"],
  ["5404","Dennis Petro"],["8825","Dennis Petro"],
  ["3032","Dioselina Zapata"],["3654","Dioselina Zapata"],
  ["0409","Dylan Zumara"],["5068","Dylan Zumara"],
  ["0050","Edison TAT"],["4527","Edison TAT"],
  ["0880","Gladis Patiño"],["2010","Gladis Patiño"],
  ["1885","Jair Marin"],["5755","Jair Marin"],
  ["6279","Jairo Zumara"],["9891","Jairo Zumara"],
  ["7559","James Lopez"],["8981","James Lopez"],
  ["2995","Jose Alfredo Zumara"],["7775","Jose Alfredo Zumara"],
  ["4805","Juan Jaramillo"],["8303","Juan Jaramillo"],
  ["4158","Juliana TAT"],["9011","Juliana TAT"],
  ["3193","Julieta Nails"],["7261","Julieta Nails"],
  ["2687","Keila Mejia"],["4249","Keila Mejia"],
  ["1006","Kelly Garavito"],["3920","Kelly Garavito"],
  ["4338","Lina Argumedo"],["6916","Lina Argumedo"],["7652","Lina Argumedo"],
  ["0960","Lis Navarro"],["7007","Lis Navarro"],
  ["1712","Lisdany Quintero"],["6198","Lisdany Quintero"],
  ["2742","Martha Lucía - Juliana TAT"],["9489","Martha Lucía - Juliana TAT"],
  ["2865","Mateo"],["3328","Mateo"],
  ["4019","Nancy Milena Foronda"],["9162","Nancy Milena Foronda"],
  ["2169","Natalia TAT"],["7100","Natalia TAT"],
  ["0702","Natalia Zapata"],["4930","Natalia Zapata"],
  ["3429","Nayibe Navarro"],["8463","Nayibe Navarro"],
  ["4726","Nayibe Yanez"],["6633","Nayibe Yanez"],
  ["5322","Nilson Garavito"],["5886","Nilson Garavito"],
  ["4617","Niños - Stefanny Cossio"],["8623","Niños - Stefanny Cossio"],
  ["1141","Randy Hernandez"],["2415","Randy Hernandez"],
  ["3714","Robinson TAT"],["9292","Robinson TAT"],
  ["6324","Ronald TAT"],["7866","Ronald TAT"],
  ["0201","Ronny"],["6748","Ronny"],
  ["1539","Sara TAT"],["7974","Sara TAT"],
  ["2594","Stefanny Cossio"],["6540","Stefanny Cossio"],
  ["5584","Valeria Argumedo"],["6890","Valeria Argumedo"],
  ["1621","Yarley Landero"],["3837","Yarley Landero"],
  ["1982","Yesenia TAT"],["9978","Yesenia TAT"],
  ["2235","Yulieth"],["6045","Yulieth"],
  ["1483","Zumara Pardo"],["8170","Zumara Pardo"],
];

const db = inicializarDB(DB_PATH);
console.log(`🗄️  BD: ${DB_PATH}`);

try {
  // 1) Actividad
  let act = db
    .prepare(`SELECT id FROM actividades WHERE nombre = ?`)
    .get("Rifa 30 de octubre");

  if (!act) {
    const info = db
      .prepare(
        `INSERT INTO actividades
          (nombre, tipo, descripcion, fecha_evento, valor_boleta, total_boletas, premios, estado, notas)
         VALUES (?, 'rifa', ?, ?, ?, ?, ?, 'activa', ?)`,
      )
      .run(
        "Rifa 30 de octubre",
        "Rifa de dos premios con el número ganador de la Lotería de Medellín.",
        "2026-10-30",
        30000,
        100,
        JSON.stringify({ mayor: 1000000, segundo: 500000 }),
        "47 socios compran 2 boletas; Lina Argumedo y Ana Garavito compran 3; Ronny externo con 2.",
      );
    act = { id: Number(info.lastInsertRowid) };
    console.log(`✅ Actividad creada (id=${act.id})`);
  } else {
    console.log(`• Actividad ya existía (id=${act.id})`);
  }

  // 2) Boletas (resolviendo socio_id por nombre)
  const buscarSocio = db.prepare(`SELECT id FROM socios WHERE nombre = ? LIMIT 1`);
  const insertar = db.prepare(
    `INSERT OR IGNORE INTO actividad_boletas
       (actividad_id, numero, socio_id, nombre_externo)
     VALUES (?, ?, ?, ?)`,
  );

  let insertadas = 0;
  let yaExistian = 0;
  for (const [numero, nombre] of BOLETAS) {
    const s = buscarSocio.get(nombre);
    const r = insertar.run(
      act.id,
      numero,
      s?.id ?? null,
      s?.id ? null : nombre,
    );
    if (r.changes > 0) insertadas++;
    else yaExistian++;
  }
  console.log(`✅ Boletas insertadas: ${insertadas}  (ya existían: ${yaExistian})`);

  // 3) Verificación
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM actividad_boletas WHERE actividad_id = ?`)
    .get(act.id);
  const sinSocio = db
    .prepare(
      `SELECT COUNT(*) AS n FROM actividad_boletas
        WHERE actividad_id = ? AND socio_id IS NULL AND nombre_externo IS NOT NULL`,
    )
    .get(act.id);
  console.log(`\n📊 Total boletas en la actividad: ${total.n}`);
  if (sinSocio.n > 0) {
    console.log(`⚠️  ${sinSocio.n} boletas sin socio_id (persona externa o nombre no coincide).`);
  }
} finally {
  cerrarDB(db);
}
