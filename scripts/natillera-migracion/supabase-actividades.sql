-- ============================================================
-- Supabase — Módulo Actividades (rifas, bazares, etc.)
--
-- Ejecutar en Supabase → SQL Editor → New query.
-- Crea 2 tablas nuevas + 1 vista + RLS. No toca nada existente.
-- ============================================================

-- Catálogo de actividades (rifas, bazares, otras)
CREATE TABLE IF NOT EXISTS actividades (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'rifa'
                  CHECK (tipo IN ('rifa','bazar','otra')),
  descripcion   TEXT,
  fecha_evento  DATE,
  valor_boleta  INTEGER NOT NULL DEFAULT 0 CHECK (valor_boleta >= 0),
  total_boletas INTEGER,
  premios       JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado        TEXT NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','cerrada','cancelada')),
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Boletas / participaciones de cada actividad
CREATE TABLE IF NOT EXISTS actividad_boletas (
  id              SERIAL PRIMARY KEY,
  actividad_id    INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  numero          TEXT NOT NULL,
  socio_id        INTEGER REFERENCES socios(id) ON DELETE SET NULL,
  nombre_externo  TEXT,
  pagada          BOOLEAN NOT NULL DEFAULT false,
  fecha_pago      DATE,
  transaccion_id  INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  es_ganadora     BOOLEAN NOT NULL DEFAULT false,
  premio_tipo     TEXT CHECK (premio_tipo IN ('mayor','segundo')),
  notas           TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actividad_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_act_bol_actividad ON actividad_boletas(actividad_id);
CREATE INDEX IF NOT EXISTS idx_act_bol_socio     ON actividad_boletas(socio_id);

-- RLS igual que el resto del esquema de la natillera
ALTER TABLE actividades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividad_boletas  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura publica actividades"   ON actividades;
CREATE POLICY        "lectura publica actividades"   ON actividades FOR SELECT USING (true);
DROP POLICY IF EXISTS "escritura publica actividades" ON actividades;
CREATE POLICY        "escritura publica actividades" ON actividades FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update publica actividades"    ON actividades;
CREATE POLICY        "update publica actividades"    ON actividades FOR UPDATE USING (true);

DROP POLICY IF EXISTS "lectura publica act_boletas"   ON actividad_boletas;
CREATE POLICY        "lectura publica act_boletas"   ON actividad_boletas FOR SELECT USING (true);
DROP POLICY IF EXISTS "escritura publica act_boletas" ON actividad_boletas;
CREATE POLICY        "escritura publica act_boletas" ON actividad_boletas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update publica act_boletas"    ON actividad_boletas;
CREATE POLICY        "update publica act_boletas"    ON actividad_boletas FOR UPDATE USING (true);

-- Resumen agregado por actividad
DROP VIEW IF EXISTS vw_actividades_resumen;
CREATE VIEW vw_actividades_resumen AS
SELECT
  a.id, a.nombre, a.tipo, a.fecha_evento, a.valor_boleta, a.premios,
  a.estado, a.total_boletas, a.descripcion, a.notas, a.creado_en,
  COUNT(b.id)                                                 AS boletas_asignadas,
  COUNT(b.id) FILTER (WHERE b.pagada)                         AS boletas_pagadas,
  COUNT(b.id) FILTER (WHERE NOT b.pagada)                     AS boletas_pendientes,
  COUNT(DISTINCT COALESCE(b.socio_id::text, b.nombre_externo))AS participantes,
  COALESCE(SUM(a.valor_boleta) FILTER (WHERE b.pagada), 0)    AS recaudado,
  COALESCE(SUM(a.valor_boleta) FILTER (WHERE NOT b.pagada), 0)AS por_cobrar
FROM actividades a
LEFT JOIN actividad_boletas b ON b.actividad_id = a.id
GROUP BY a.id;

-- ============================================================
-- Semilla: Rifa del 30 de octubre
-- ============================================================

INSERT INTO actividades
  (nombre, tipo, descripcion, fecha_evento, valor_boleta, total_boletas, premios, estado, notas)
VALUES
  ('Rifa 30 de octubre',
   'rifa',
   'Rifa de dos premios con el número ganador de la Lotería de Medellín.',
   '2026-10-30',
   30000,
   100,
   '{"mayor": 1000000, "segundo": 500000, "mecanica": "2 primeras cifras ganan mayor, 2 últimas ganan segundo"}'::jsonb,
   'activa',
   '47 socios compran 2 boletas; Lina Argumedo y Ana Garavito compran 3.')
ON CONFLICT DO NOTHING;

-- Boletas asignadas (100 números de 4 cifras)
-- Se asume que la actividad recién creada es la última (MAX(id))
WITH act AS (SELECT id FROM actividades WHERE nombre = 'Rifa 30 de octubre' ORDER BY id DESC LIMIT 1),
     s AS (SELECT id, nombre FROM socios)
INSERT INTO actividad_boletas (actividad_id, numero, socio_id, nombre_externo)
SELECT
  (SELECT id FROM act),
  v.numero,
  s.id,
  CASE WHEN s.id IS NULL THEN v.nombre END
FROM (VALUES
  ('1396', 'Ana Garavito'),      ('5146', 'Ana Garavito'),      ('8536', 'Ana Garavito'),
  ('0176', 'Ana Sofia Garavito'),('8764', 'Ana Sofia Garavito'),
  ('3531', 'Andres Arango (Robin)'), ('7473', 'Andres Arango (Robin)'),
  ('5908', 'Andres Rico'),       ('7357', 'Andres Rico'),
  ('2344', 'Camilo Higuita'),    ('6472', 'Camilo Higuita'),
  ('0699', 'Carlos FAFA'),       ('3267', 'Carlos FAFA'),
  ('5213', 'Carlos Mario Julio'),('8047', 'Carlos Mario Julio'),
  ('0543', 'Cristian Ortiz'),    ('8297', 'Cristian Ortiz'),
  ('0371', 'Cristina Cossio'),   ('1277', 'Cristina Cossio'),
  ('9553', 'Daniel Jaramillo'),  ('9788', 'Daniel Jaramillo'),
  ('5656', 'Danissa TAT'),       ('9618', 'Danissa TAT'),
  ('4434', 'Dario Hernandez'),   ('9351', 'Dario Hernandez'),
  ('5404', 'Dennis Petro'),      ('8825', 'Dennis Petro'),
  ('3032', 'Dioselina Zapata'),  ('3654', 'Dioselina Zapata'),
  ('0409', 'Dylan Zumara'),      ('5068', 'Dylan Zumara'),
  ('0050', 'Edison TAT'),        ('4527', 'Edison TAT'),
  ('0880', 'Gladis Patiño'),     ('2010', 'Gladis Patiño'),
  ('1885', 'Jair Marin'),        ('5755', 'Jair Marin'),
  ('6279', 'Jairo Zumara'),      ('9891', 'Jairo Zumara'),
  ('7559', 'James Lopez'),       ('8981', 'James Lopez'),
  ('2995', 'Jose Alfredo Zumara'),('7775', 'Jose Alfredo Zumara'),
  ('4805', 'Juan Jaramillo'),    ('8303', 'Juan Jaramillo'),
  ('4158', 'Juliana TAT'),       ('9011', 'Juliana TAT'),
  ('3193', 'Julieta Nails'),     ('7261', 'Julieta Nails'),
  ('2687', 'Keila Mejia'),       ('4249', 'Keila Mejia'),
  ('1006', 'Kelly Garavito'),    ('3920', 'Kelly Garavito'),
  ('4338', 'Lina Argumedo'),     ('6916', 'Lina Argumedo'),     ('7652', 'Lina Argumedo'),
  ('0960', 'Lis Navarro'),       ('7007', 'Lis Navarro'),
  ('1712', 'Lisdany Quintero'),  ('6198', 'Lisdany Quintero'),
  ('2742', 'Martha Lucía - Juliana TAT'), ('9489', 'Martha Lucía - Juliana TAT'),
  ('2865', 'Mateo'),             ('3328', 'Mateo'),
  ('4019', 'Nancy Milena Foronda'),('9162', 'Nancy Milena Foronda'),
  ('2169', 'Natalia TAT'),       ('7100', 'Natalia TAT'),
  ('0702', 'Natalia Zapata'),    ('4930', 'Natalia Zapata'),
  ('3429', 'Nayibe Navarro'),    ('8463', 'Nayibe Navarro'),
  ('4726', 'Nayibe Yanez'),      ('6633', 'Nayibe Yanez'),
  ('5322', 'Nilson Garavito'),   ('5886', 'Nilson Garavito'),
  ('4617', 'Niños - Stefanny Cossio'),('8623', 'Niños - Stefanny Cossio'),
  ('1141', 'Randy Hernandez'),   ('2415', 'Randy Hernandez'),
  ('3714', 'Robinson TAT'),      ('9292', 'Robinson TAT'),
  ('6324', 'Ronald TAT'),        ('7866', 'Ronald TAT'),
  ('0201', 'Ronny'),             ('6748', 'Ronny'),
  ('1539', 'Sara TAT'),          ('7974', 'Sara TAT'),
  ('2594', 'Stefanny Cossio'),   ('6540', 'Stefanny Cossio'),
  ('5584', 'Valeria Argumedo'),  ('6890', 'Valeria Argumedo'),
  ('1621', 'Yarley Landero'),    ('3837', 'Yarley Landero'),
  ('1982', 'Yesenia TAT'),       ('9978', 'Yesenia TAT'),
  ('2235', 'Yulieth'),           ('6045', 'Yulieth'),
  ('1483', 'Zumara Pardo'),      ('8170', 'Zumara Pardo')
) AS v(numero, nombre)
LEFT JOIN s ON s.nombre = v.nombre
ON CONFLICT (actividad_id, numero) DO NOTHING;

-- Verificación: debe mostrar 100
SELECT COUNT(*) AS boletas_insertadas FROM actividad_boletas;
