-- Migración: Operaciones — Incidentes Inusuales (formato NUOCA TP-DOP-REG-021,
-- PrimusGFS v3.2 Módulo 1). Una fila por incidente reportado.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS operaciones_incidentes (
  id                      bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,

  -- 1. Datos generales
  fecha                   date NOT NULL,
  hora                    text,     -- 'HH:MM'
  lugar                   text,     -- lugar / área específica
  reporta_nombre          text,
  reporta_cargo           text,
  lote_afectado           text,     -- lote de fruta o proceso afectado
  linea_maquinaria        text,     -- línea / maquinaria involucrada

  -- 2. Tipo de incidencia (se puede marcar más de una)
  tipos                   text[] NOT NULL DEFAULT '{}',
  tipo_otro               text,     -- detalle cuando se marca 'Otro'

  -- 3, 4, 5. Texto libre
  descripcion             text,     -- descripción del evento y evaluación de inocuidad
  acciones_correctivas    text,     -- acciones inmediatas / disposición del producto
  acciones_preventivas    text,     -- acciones preventivas y seguimiento

  -- 6. Verificación, liberación y cierre (la firma física va en el formato impreso)
  supervision_nombre      text,     -- Supervisión de Planta / Mantenimiento
  supervision_cargo       text,
  supervision_fecha       date,
  verificacion_nombre     text,     -- Verificación e Inocuidad (Líder HACCP)
  verificacion_cargo      text,
  verificacion_fecha      date,     -- con fecha = incidente cerrado

  registrado_por          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operaciones_incidentes_fecha ON operaciones_incidentes(fecha);

ALTER TABLE operaciones_incidentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE operaciones_incidentes REPLICA IDENTITY FULL;

-- Tiempo real (para que la lista se actualice sola en todos los equipos)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE operaciones_incidentes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'operaciones_incidentes'
ORDER BY ordinal_position;
