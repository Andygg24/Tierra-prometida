-- Migración: Asociar Contenedor — asignación de canastillas de una estiba
-- (de una recepción) a un contenedor ya registrado en Logística. Una misma
-- estiba puede repartirse entre varios contenedores (varias filas).
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS recepciones_asignaciones (
  id                   bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  recepcion_id         bigint NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  numero_estiba        integer NOT NULL,
  contenedor_id        bigint NOT NULL REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  cantidad_canastillas numeric NOT NULL DEFAULT 0,
  obs                  text,
  registrado_por       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recepciones_asignaciones_recepcion  ON recepciones_asignaciones(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_asignaciones_contenedor ON recepciones_asignaciones(contenedor_id);

ALTER TABLE recepciones_asignaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE recepciones_asignaciones REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recepciones_asignaciones'
ORDER BY ordinal_position;
