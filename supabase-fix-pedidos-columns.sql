-- ═══════════════════════════════════════════════════════════════════
-- FIX: Renombrar columnas de pedidos para alinear con usePedidos.js
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Renombrar columnas si existen con el nombre viejo
ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS cantidad TO cantidad_kg;

ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS precio TO precio_usd;

ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS notas TO obs;

-- 2. Agregar columnas si no existen (caso tabla nueva sin seed viejo)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cantidad_kg numeric,
  ADD COLUMN IF NOT EXISTS precio_usd  numeric,
  ADD COLUMN IF NOT EXISTS obs         text;

-- 3. Eliminar columna data (no usada por el hook)
ALTER TABLE pedidos
  DROP COLUMN IF EXISTS data;

-- 4. Agregar contenedor si no existe (ya cubierto por supabase-pedidos-migration.sql)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS contenedor text;

-- 5. Verificar resultado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pedidos'
ORDER BY ordinal_position;
