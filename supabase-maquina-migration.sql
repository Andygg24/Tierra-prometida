-- Migración: módulo "Máquina" — línea de proceso en tiempo real
-- - `maquina_areas`: estaciones reales de la línea (según las fotos de la
--   planta), en el orden en que la fruta las recorre. Incluye una foto de
--   referencia de cada zona (carpeta /maquina) para que el módulo se vea
--   como la planta real, no como un diagrama genérico.
-- - `maquina_movimientos`: bitácora de "esta persona entró a esta área a
--   esta hora" (mismo patrón que asistencia_eventos). La ubicación actual
--   de alguien y su "tiempo en esta área" salen del último registro del día;
--   el histórico completo sirve para el resumen de tiempo acumulado por área.
-- Ejecutar en Supabase SQL Editor (seguro de correr más de una vez)

CREATE TABLE IF NOT EXISTS maquina_areas (
  id     bigint PRIMARY KEY DEFAULT (extract(epoch from now())*1000)::bigint,
  nombre text NOT NULL,
  orden  integer NOT NULL DEFAULT 0,
  icono  text NOT NULL DEFAULT '⚙️',
  color  text NOT NULL DEFAULT '#00C9A7',
  foto   text,
  activo boolean NOT NULL DEFAULT true
);

ALTER TABLE maquina_areas ADD COLUMN IF NOT EXISTS foto text;

-- Reemplaza cualquier semilla anterior (4 áreas genéricas) por las 6 zonas
-- reales de la planta, en el orden real del proceso.
INSERT INTO maquina_areas (id, nombre, orden, icono, color, foto) VALUES
  (1, 'Recepción',                 1, '🚚', '#00C9A7', '/maquina/recepcion.jpg'),
  (2, 'Selección',                 2, '🍋', '#4ECDC4', '/maquina/seleccion.jpg'),
  (3, 'Lavado y Encerado',         3, '💧', '#0EA5E9', '/maquina/lavado.jpg'),
  (4, 'Armado de Cajas',           4, '📦', '#845EF7', '/maquina/armado-cajas.jpg'),
  (5, 'Calibración y Paletizado',  5, '⚖️', '#6366F1', '/maquina/calibracion-paletizado.jpg'),
  (6, 'Cuarto Frío',               6, '❄️', '#38BDF8', '/maquina/cuarto-frio.jpg')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, icono = EXCLUDED.icono,
  color = EXCLUDED.color, foto = EXCLUDED.foto, activo = true;

-- Si quedó alguna área vieja (id fuera de 1-6) de una versión anterior, se
-- desactiva en vez de borrarla (por si ya hay movimientos apuntando a ella).
UPDATE maquina_areas SET activo = false WHERE id NOT IN (1,2,3,4,5,6);

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
SELECT id, nombre, orden, icono, color, foto FROM maquina_areas ORDER BY orden;
