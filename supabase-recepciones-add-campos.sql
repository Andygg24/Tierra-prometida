-- Migración: agrega Origen, Cédula del conductor y Observaciones a recepciones
-- Ejecutar en Supabase SQL Editor

ALTER TABLE recepciones
  ADD COLUMN IF NOT EXISTS origen           text,
  ADD COLUMN IF NOT EXISTS cedula_conductor text,
  ADD COLUMN IF NOT EXISTS observaciones    text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recepciones'
ORDER BY ordinal_position;
