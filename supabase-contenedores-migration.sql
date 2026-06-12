-- Migración: actualizar contenedor_insumos para almacenar arrays jsonb
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir columnas nuevas
ALTER TABLE contenedor_insumos
  ADD COLUMN IF NOT EXISTS cont_num   text,
  ADD COLUMN IF NOT EXISTS items      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extras     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS total      numeric DEFAULT 0;

-- 2. La columna fecha ya puede existir como timestamptz; aseguramos que sea date
-- Si la tabla es nueva (sin datos) se puede recrear; si tiene datos, ajustar manualmente.
-- Si la columna fecha no existe:
ALTER TABLE contenedor_insumos
  ADD COLUMN IF NOT EXISTS fecha      date;

-- 3. Eliminar columnas del esquema original que ya no aplican
ALTER TABLE contenedor_insumos
  DROP COLUMN IF EXISTS nombre,
  DROP COLUMN IF EXISTS unidad,
  DROP COLUMN IF EXISTS cantidad,
  DROP COLUMN IF EXISTS costo_unit;

-- 4. Asegurarse de que cont_id tiene ON DELETE CASCADE hacia contenedores
-- (ya configurado en el esquema original)

-- 5. Verificar resultado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_insumos'
ORDER BY ordinal_position;
