-- Migración: historial dedicado de Entradas y Salidas de canastillas.
--
-- Hasta ahora cada canastilla escaneada en un préstamo/devolución quedaba
-- como un movimiento suelto en canastilla_movimientos, sin nada que
-- agrupe "estas 40 canastillas salieron juntas el mismo día, en el mismo
-- camión, con el mismo conductor". Esta tabla nueva (canastilla_lotes)
-- representa esa salida o entrada como un solo evento, con los datos de
-- quién transporta (conductor, cédula, placa) — para poder ver un
-- historial de entradas/salidas y generar un informe por cada una.
--
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS canastilla_lotes (
  id                bigint PRIMARY KEY,
  tipo              text NOT NULL,          -- 'prestamo' (salida) | 'devolucion' (entrada)
  proveedor         text,
  conductor         text,
  cedula_conductor  text,
  placa             text,
  fecha             date NOT NULL DEFAULT current_date,
  obs               text,
  cantidad          integer NOT NULL DEFAULT 0,
  registrado_por    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE canastilla_movimientos
  ADD COLUMN IF NOT EXISTS lote_id bigint REFERENCES canastilla_lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canastilla_lotes_fecha ON canastilla_lotes(fecha);
CREATE INDEX IF NOT EXISTS idx_canastilla_lotes_tipo  ON canastilla_lotes(tipo);
CREATE INDEX IF NOT EXISTS idx_canastilla_mov_lote_id ON canastilla_movimientos(lote_id);

ALTER TABLE canastilla_lotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE canastilla_lotes REPLICA IDENTITY FULL;

-- Nota: los préstamos/devoluciones registrados ANTES de esta migración no
-- tienen lote_id (quedan sin agrupar) — el historial de Entradas y Salidas
-- solo mostrará lotes nuevos a partir de que se aplique este cambio.

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'canastilla_lotes' ORDER BY ordinal_position;
