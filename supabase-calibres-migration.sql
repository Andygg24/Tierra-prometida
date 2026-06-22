-- Migración: agregar columna calibres a contenedor_rendimientos
ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS calibres jsonb DEFAULT '[]';

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
  AND column_name = 'calibres';
