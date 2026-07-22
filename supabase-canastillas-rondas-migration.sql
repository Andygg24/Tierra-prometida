-- Migración: rondas de conteo mensual de canastillas (reemplaza el enfoque de
-- préstamo/devolución por proveedor — control interno de bodega).
-- Ejecutar en Supabase SQL Editor DESPUÉS de supabase-canastillas-migration.sql

CREATE TABLE IF NOT EXISTS canastilla_rondas (
  id                 bigint PRIMARY KEY,
  fecha              date NOT NULL DEFAULT current_date,
  obs                text,
  total_esperadas    integer NOT NULL DEFAULT 0,
  total_encontradas  integer NOT NULL DEFAULT 0,
  cerrada            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);

ALTER TABLE canastilla_movimientos
  ADD COLUMN IF NOT EXISTS ronda_id bigint REFERENCES canastilla_rondas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canastilla_rondas_fecha  ON canastilla_rondas(fecha);
CREATE INDEX IF NOT EXISTS idx_canastilla_mov_ronda_id  ON canastilla_movimientos(ronda_id);

ALTER TABLE canastilla_rondas DISABLE ROW LEVEL SECURITY;
ALTER TABLE canastilla_rondas REPLICA IDENTITY FULL;

-- Nota: la columna canastillas.proveedor_actual queda sin uso a partir de esta
-- versión (ya no se rastrea préstamo por proveedor) — se deja intacta, no se
-- elimina, para no romper nada; simplemente el código deja de escribirla.

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canastilla_rondas' ORDER BY ordinal_position;
