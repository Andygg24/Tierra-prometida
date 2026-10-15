-- Migración: Registro de rostro en línea (página pública /registro)
-- El trabajador entra desde su celular, busca su documento y registra su
-- rostro. Si no está en Personal, llena sus datos y queda como solicitud de
-- ingreso. Nada de esto cuenta hasta que alguien lo aprueba en Personal.
-- - `empleados_rostros.aprobado`: false = rostro registrado desde la página
--   pública, pendiente de aprobación (el Biométrico todavía no lo usa).
--   Los rostros que ya existen quedan aprobados.
-- - `empleados_rostros.foto`: foto pequeña de la cara (solo mientras la
--   solicitud está pendiente, para que quien aprueba vea quién es; al aprobar
--   se borra).
-- - `empleados.solicitud_registro`: 'nuevo' (no existía) o 'reingreso'
--   (existía inactivo). La persona queda inactiva hasta que se apruebe.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE empleados_rostros
  ADD COLUMN IF NOT EXISTS aprobado boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS foto     text;

CREATE INDEX IF NOT EXISTS idx_empleados_rostros_pendientes
  ON empleados_rostros(emp_num) WHERE aprobado = false;

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS solicitud_registro text,
  ADD COLUMN IF NOT EXISTS solicitud_fecha    timestamptz;

-- Tiempo real de `empleados` (las solicitudes nuevas aparecen solas en Personal).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'empleados'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE empleados;
  END IF;
END $$;

-- Verificar
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE (table_name = 'empleados_rostros' AND column_name IN ('aprobado','foto'))
   OR (table_name = 'empleados' AND column_name IN ('solicitud_registro','solicitud_fecha'));
