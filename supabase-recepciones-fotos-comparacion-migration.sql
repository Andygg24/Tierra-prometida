-- Migración: fotos de comparación con el proveedor en Recepción
-- (evidencia del cuaderno físico del proveedor, para cruzar información con
-- lo registrado en el sistema)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE recepciones
  ADD COLUMN IF NOT EXISTS fotos_comparacion_proveedor jsonb NOT NULL DEFAULT '[]';

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recepciones'
ORDER BY ordinal_position;
