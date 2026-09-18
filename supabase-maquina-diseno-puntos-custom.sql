-- Agrega la columna para los puntos personalizados que el usuario crea en
-- el plano de Máquina (ej. un punto para la armadora de cajas) — funcionan
-- como paradas reales a las que un trabajador puede caminar, además de las
-- 12 estaciones fijas.
-- Seguro de correr más de una vez. Ejecutar en Supabase SQL Editor.

ALTER TABLE maquina_diseno ADD COLUMN IF NOT EXISTS puntos_custom jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Verificar
SELECT id, puntos_custom FROM maquina_diseno WHERE id = 1;
