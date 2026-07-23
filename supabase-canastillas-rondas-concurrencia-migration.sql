-- Migración: blindar el conteo de canastillas para que varias personas puedan
-- rondear la MISMA bodega al mismo tiempo sin corromper los datos.
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-canastillas-rondas-migration.sql

-- 1) Solo puede existir UNA ronda activa (no cerrada) a la vez. Si dos
--    personas presionan "Iniciar ronda" casi al mismo tiempo, la base de
--    datos rechaza la segunda inserción en vez de crear dos rondas activas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_una_ronda_activa
  ON canastilla_rondas (cerrada)
  WHERE cerrada = false;

-- 2) Una misma canastilla no puede quedar contada dos veces en la misma
--    ronda. Si dos personas escanean el mismo código, la base de datos
--    rechaza el segundo "conteo" en vez de dejar un registro duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conteo_unico_por_ronda
  ON canastilla_movimientos (canastilla_id, ronda_id)
  WHERE tipo = 'conteo' AND ronda_id IS NOT NULL;

-- Verificar
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('canastilla_rondas','canastilla_movimientos')
  AND indexname IN ('idx_una_ronda_activa','idx_conteo_unico_por_ronda');
