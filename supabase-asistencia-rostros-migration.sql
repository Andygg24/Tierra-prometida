-- Migración: Asistencia por reconocimiento de rostro
-- - `empleados_rostros`: huellas faciales de cada empleado (vector de 128
--   números que calcula el modelo en el navegador). NO se guarda la foto —
--   solo el vector, que no permite reconstruir la cara.
--   Cada empleado tiene varias muestras (distintos ángulos/luz) para que el
--   reconocimiento sea más confiable.
-- - `asistencia_eventos.via`: cómo se marcó cada entrada/salida (qr | rostro).
-- - `asistencia_eventos.sesion_id` pasa a ser opcional: el Biométrico registra
--   entradas/salidas del día aunque no haya un proceso (contenedor) abierto.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS empleados_rostros (
  id          bigint PRIMARY KEY,
  emp_num     text NOT NULL REFERENCES empleados(num) ON DELETE CASCADE,
  descriptor  jsonb NOT NULL,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleados_rostros_emp ON empleados_rostros(emp_num);

ALTER TABLE asistencia_eventos
  ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'qr';

ALTER TABLE asistencia_eventos ALTER COLUMN sesion_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asistencia_eventos_hora ON asistencia_eventos(hora);

-- Igual que las demás tablas de Asistencia mientras no se active el RLS
-- (supabase-seguridad-rls-migration.sql ya incluye esta tabla).
ALTER TABLE empleados_rostros DISABLE ROW LEVEL SECURITY;

-- Tiempo real: que los movimientos y los rostros nuevos se vean al instante
-- en todos los dispositivos (si ya estaban en la publicación, no hace nada).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empleados_rostros','asistencia_eventos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'empleados_rostros' ORDER BY ordinal_position;
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'asistencia_eventos' AND column_name IN ('via','sesion_id');
