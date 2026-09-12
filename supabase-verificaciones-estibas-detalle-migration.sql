-- Migración: guarda el detalle (qué estibas exactas) de cada verificación
-- guardada, para poder revertir su estado "usada" si se elimina la
-- verificación más adelante.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE verificaciones_estibas
  ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '[]';

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'verificaciones_estibas'
ORDER BY ordinal_position;
