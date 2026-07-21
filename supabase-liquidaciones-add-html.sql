-- Migración: guardar el documento HTML generado (colilla/comprobante) junto
-- con el registro de liquidación, para poder volver a descargarlo desde el
-- Historial sin tener que reconstruirlo.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS html text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'liquidaciones'
ORDER BY ordinal_position;
