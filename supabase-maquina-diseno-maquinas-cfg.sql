-- Agrega la columna para guardar la dirección (normal/invertida) de las
-- máquinas que se orientan automáticamente según la posición de las
-- estaciones vecinas (Alimentación, Selección) — así se puede corregir a
-- mano si la máquina queda apuntando al revés.
-- Seguro de correr más de una vez. Ejecutar en Supabase SQL Editor.

ALTER TABLE maquina_diseno ADD COLUMN IF NOT EXISTS maquinas_cfg jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Verificar
SELECT id, maquinas_cfg FROM maquina_diseno WHERE id = 1;
