-- Migración: módulo "Máquina" — línea de proceso en tiempo real
-- Actualizado con el proceso real de 12 fases descrito por el usuario:
-- Recepción -> Alimentación -> Selección -> [Lavado -> Encerado -> Secado ->
-- Fotoselección, automáticos] -> Empaque y Calibración -> Pesaje ->
-- Paletizado -> [Patio de Pallets] -> Cargue de Camión.
-- Solo las fases con personal asignable son filas de `maquina_areas`; las
-- fases 100% automáticas (lavado, encerado, secado, fotoselección) se
-- dibujan en el plano pero no son estaciones donde se ubique gente.
--
-- - `maquina_areas`: estaciones reales donde se ubica personal, con la
--   capacidad esperada de personas (según lo descrito) para comparar
--   contra la ocupación real del día.
-- - `maquina_movimientos`: bitácora de "esta persona entró a esta área a
--   esta hora" (mismo patrón que asistencia_eventos).
-- Ejecutar en Supabase SQL Editor (seguro de correr más de una vez)

CREATE TABLE IF NOT EXISTS maquina_areas (
  id        bigint PRIMARY KEY DEFAULT (extract(epoch from now())*1000)::bigint,
  nombre    text NOT NULL,
  orden     integer NOT NULL DEFAULT 0,
  icono     text NOT NULL DEFAULT '⚙️',
  color     text NOT NULL DEFAULT '#00C9A7',
  foto      text,
  capacidad integer,
  activo    boolean NOT NULL DEFAULT true
);

ALTER TABLE maquina_areas ADD COLUMN IF NOT EXISTS foto text;
ALTER TABLE maquina_areas ADD COLUMN IF NOT EXISTS capacidad integer;

-- Reemplaza cualquier semilla anterior por las 7 estaciones reales con
-- personal, en el orden real del proceso.
INSERT INTO maquina_areas (id, nombre, orden, icono, color, capacidad) VALUES
  (1, 'Recepción',                1, '🚚', '#00C9A7', 4),
  (2, 'Alimentación',             2, '🍋', '#4ECDC4', 2),
  (3, 'Selección',                3, '🔍', '#0EA5E9', 2),
  (4, 'Empaque y Calibración',    4, '📦', '#845EF7', 8),
  (5, 'Pesaje',                   5, '⚖️', '#6366F1', 2),
  (6, 'Paletizado',               6, '🏗️', '#A78BFA', 4),
  (7, 'Cargue de Camión',         7, '🚛', '#22D3EE', 3)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, icono = EXCLUDED.icono,
  color = EXCLUDED.color, capacidad = EXCLUDED.capacidad, foto = NULL, activo = true;

-- Cualquier área vieja de una versión anterior (id fuera de 1-7) se
-- desactiva en vez de borrarse (por si ya hay movimientos apuntando a ella).
UPDATE maquina_areas SET activo = false WHERE id NOT IN (1,2,3,4,5,6,7);

CREATE TABLE IF NOT EXISTS maquina_movimientos (
  id             bigint PRIMARY KEY,
  emp_num        text NOT NULL REFERENCES empleados(num),
  area_id        bigint NOT NULL REFERENCES maquina_areas(id),
  fecha          date NOT NULL DEFAULT CURRENT_DATE,
  hora           timestamptz NOT NULL DEFAULT now(),
  origen         text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','auto')),
  registrado_por text
);

CREATE INDEX IF NOT EXISTS idx_maquina_movimientos_fecha ON maquina_movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_maquina_movimientos_emp   ON maquina_movimientos(emp_num, fecha);

-- Nota de seguridad: igual que el resto de tablas del proyecto, estas dos
-- quedan sin RLS explícito (Postgres las crea sin RLS activado por defecto).
-- Esto se resuelve junto con el resto de tablas en la migración de
-- seguridad (RLS + login real) ya planeada aparte.

ALTER TABLE maquina_areas       REPLICA IDENTITY FULL;
ALTER TABLE maquina_movimientos REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'maquina_areas'       ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'maquina_movimientos'  ORDER BY ordinal_position;
SELECT id, nombre, orden, icono, color, capacidad FROM maquina_areas WHERE activo ORDER BY orden;
