-- Migración: tabla configuracion (key-value store para cfg_*)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS configuracion (
  clave        text PRIMARY KEY,
  valor        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz DEFAULT now()
);

-- Deshabilitar RLS durante desarrollo
ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;

-- Habilitar replica identity para real-time (DELETE events)
ALTER TABLE configuracion REPLICA IDENTITY FULL;

-- Verificar resultado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'configuracion'
ORDER BY ordinal_position;
