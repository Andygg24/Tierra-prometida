-- Migración: Verificación de Estibas — guarda el resumen de cada sesión de
-- verificación (escaneando o marcando manual varias estibas seguidas), para
-- llevar seguimiento histórico y poder editarlo después.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS verificaciones_estibas (
  id                    bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  fecha                 date NOT NULL,
  nota                  text,     -- ej. contenedor o comentario libre para identificar la sesión
  estibas_marcadas      integer NOT NULL DEFAULT 0,
  canastillas_usadas    numeric NOT NULL DEFAULT 0,
  canastillas_faltantes numeric NOT NULL DEFAULT 0,
  kg_usados             numeric NOT NULL DEFAULT 0,
  kg_faltantes          numeric NOT NULL DEFAULT 0,
  registrado_por        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_estibas_fecha ON verificaciones_estibas(fecha);

ALTER TABLE verificaciones_estibas DISABLE ROW LEVEL SECURITY;
ALTER TABLE verificaciones_estibas REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'verificaciones_estibas'
ORDER BY ordinal_position;
