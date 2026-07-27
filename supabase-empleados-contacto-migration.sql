-- Migración: agrega dirección, contacto de emergencia y titular de cuenta a empleados
-- Ejecutar en Supabase SQL Editor

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS direccion           text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia text,
  ADD COLUMN IF NOT EXISTS tel_emergencia      text,
  ADD COLUMN IF NOT EXISTS titular_nombre      text,
  ADD COLUMN IF NOT EXISTS titular_doc         text,
  ADD COLUMN IF NOT EXISTS titular_doc_num     text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'empleados'
ORDER BY ordinal_position;
