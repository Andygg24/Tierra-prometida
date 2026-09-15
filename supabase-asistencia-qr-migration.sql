-- Migración: Asistencia por QR + cálculo de pago por contenedor
-- - Marca empleados temporales (un solo proceso) para poder auto-expirarlos
-- - Enriquece `asistencia` con hora exacta y origen del registro (QR vs manual)
-- - `asistencia_sesiones`: sesión de escaneo (contenedor + turno abiertos ahora)
-- - `contenedor_ajustes`: bonos/descuentos de pago, a nivel de contenedor
--   (emp_num nulo, se reparte entre todos) o individual (emp_num específico)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS es_temporal boolean NOT NULL DEFAULT false;

ALTER TABLE asistencia
  ADD COLUMN IF NOT EXISTS hora_registro timestamptz,
  ADD COLUMN IF NOT EXISTS sesion_id     bigint,
  ADD COLUMN IF NOT EXISTS via_qr        boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS asistencia_sesiones (
  id               bigint PRIMARY KEY,
  contenedor_id    bigint NOT NULL REFERENCES contenedores(id) ON DELETE CASCADE,
  turno            text NOT NULL CHECK (turno IN ('Día','Noche')),
  grupo_trabajo_id bigint NOT NULL REFERENCES grupos_trabajo(id) ON DELETE CASCADE,
  fecha            date NOT NULL DEFAULT CURRENT_DATE,
  valor_base       numeric NOT NULL DEFAULT 180000,
  -- Lista "planeada": personas asignadas a este contenedor (num de empleados),
  -- independiente de quién realmente escaneó — así el informe final puede
  -- comparar asignados vs. asistencia real confirmada por QR.
  asignados        jsonb NOT NULL DEFAULT '[]',
  fotos            jsonb NOT NULL DEFAULT '[]',
  abierta_por      text,
  abierta_en       timestamptz NOT NULL DEFAULT now(),
  cerrada_en       timestamptz,
  activa           boolean NOT NULL DEFAULT true
);

ALTER TABLE asistencia_sesiones ADD COLUMN IF NOT EXISTS asignados jsonb NOT NULL DEFAULT '[]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'asistencia_sesion_fk' AND table_name = 'asistencia'
  ) THEN
    ALTER TABLE asistencia ADD CONSTRAINT asistencia_sesion_fk
      FOREIGN KEY (sesion_id) REFERENCES asistencia_sesiones(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contenedor_ajustes (
  id            bigint PRIMARY KEY,
  contenedor_id bigint NOT NULL REFERENCES contenedores(id) ON DELETE CASCADE,
  emp_num       text REFERENCES empleados(num),
  concepto      text NOT NULL,
  monto         numeric NOT NULL,
  creado_por    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Registro de cada entrada y salida (no solo la primera llegada) — el mismo
-- QR alterna: si la persona está afuera el escaneo cuenta como entrada, si
-- está adentro cuenta como salida. Así se puede reconstruir quién salió
-- durante el proceso y cuándo volvió a entrar.
CREATE TABLE IF NOT EXISTS asistencia_eventos (
  id        bigint PRIMARY KEY,
  sesion_id bigint NOT NULL REFERENCES asistencia_sesiones(id) ON DELETE CASCADE,
  emp_num   text NOT NULL REFERENCES empleados(num),
  tipo      text NOT NULL CHECK (tipo IN ('entrada','salida')),
  hora      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistencia_sesiones_contenedor ON asistencia_sesiones(contenedor_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_sesiones_activa     ON asistencia_sesiones(activa) WHERE activa = true;
CREATE INDEX IF NOT EXISTS idx_contenedor_ajustes_contenedor  ON contenedor_ajustes(contenedor_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_eventos_sesion      ON asistencia_eventos(sesion_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_eventos_emp         ON asistencia_eventos(sesion_id, emp_num);

ALTER TABLE asistencia_sesiones DISABLE ROW LEVEL SECURITY;
ALTER TABLE contenedor_ajustes  DISABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_eventos  DISABLE ROW LEVEL SECURITY;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'asistencia_sesiones' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contenedor_ajustes'  ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'asistencia_eventos'  ORDER BY ordinal_position;
