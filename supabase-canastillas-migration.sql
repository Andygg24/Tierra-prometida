-- Migración: módulo Canastillas (tracking QR de canastillas plásticas en préstamo)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS canastillas (
  id                        bigint PRIMARY KEY,   -- generado client-side (Date.now()+offset), sin DEFAULT
  codigo                    text UNIQUE NOT NULL, -- ej. TP-000001
  estado                    text NOT NULL DEFAULT 'disponible', -- disponible|prestada|perdida|baja
  proveedor_actual          text,                 -- null si no está prestada
  fecha_ultimo_movimiento   date,
  obs                       text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canastilla_movimientos (
  id             bigint PRIMARY KEY,
  canastilla_id  bigint NOT NULL REFERENCES canastillas(id) ON DELETE CASCADE,
  codigo         text NOT NULL,        -- denormalizado, para búsqueda rápida
  tipo           text NOT NULL,        -- alta|prestamo|devolucion|perdida|baja
  proveedor      text,
  fecha          date NOT NULL DEFAULT current_date,
  obs            text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canastillas_estado           ON canastillas(estado);
CREATE INDEX IF NOT EXISTS idx_canastillas_proveedor_actual  ON canastillas(proveedor_actual);
CREATE INDEX IF NOT EXISTS idx_canastilla_mov_canastilla_id  ON canastilla_movimientos(canastilla_id);
CREATE INDEX IF NOT EXISTS idx_canastilla_mov_codigo         ON canastilla_movimientos(codigo);
CREATE INDEX IF NOT EXISTS idx_canastilla_mov_fecha          ON canastilla_movimientos(fecha);

ALTER TABLE canastillas             DISABLE ROW LEVEL SECURITY;
ALTER TABLE canastilla_movimientos  DISABLE ROW LEVEL SECURITY;
ALTER TABLE canastillas             REPLICA IDENTITY FULL;
ALTER TABLE canastilla_movimientos  REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canastillas' ORDER BY ordinal_position;
