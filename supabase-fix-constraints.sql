-- ═══════════════════════════════════════════════════════════════════
-- FIX: Correcciones de constraints
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. CONTRATOS: eliminar posibles duplicados y agregar UNIQUE en emp_num
--    Sin unique constraint, upsert({ onConflict:"emp_num" }) inserta duplicados

-- Primero eliminamos duplicados (si existen), conservando el más reciente
DELETE FROM contratos
WHERE id NOT IN (
  SELECT DISTINCT ON (emp_num) id
  FROM contratos
  ORDER BY emp_num, created_at DESC
);

ALTER TABLE contratos
  DROP CONSTRAINT IF EXISTS contratos_emp_num_key;

ALTER TABLE contratos
  ADD CONSTRAINT contratos_emp_num_key UNIQUE (emp_num);

-- 2. ASISTENCIA: hacer estado nullable
--    El hook puede eliminar estado cuando sólo hay contenedor/obs
ALTER TABLE asistencia
  ALTER COLUMN estado DROP NOT NULL;

ALTER TABLE asistencia
  ALTER COLUMN estado DROP DEFAULT;

-- 3. Verificar
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'contratos';

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'asistencia' AND column_name = 'estado';
