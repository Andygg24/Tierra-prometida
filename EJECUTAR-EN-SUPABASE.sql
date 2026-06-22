-- ═══════════════════════════════════════════════════════════════════════════
-- TIERRA PROMETIDA TRADING — MIGRACIÓN COMPLETA
-- Ejecutar TODO esto en: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 1: FIX columnas de pedidos
-- (la tabla schema original tenía cantidad/precio/notas, el código usa cantidad_kg/precio_usd/obs)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS cantidad TO cantidad_kg;

ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS precio TO precio_usd;

ALTER TABLE pedidos
  RENAME COLUMN IF EXISTS notas TO obs;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cantidad_kg numeric,
  ADD COLUMN IF NOT EXISTS precio_usd  numeric,
  ADD COLUMN IF NOT EXISTS obs         text,
  ADD COLUMN IF NOT EXISTS contenedor  text;

ALTER TABLE pedidos
  DROP COLUMN IF EXISTS data;


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 2: FIX contenedor_insumos
-- (schema original tenía nombre/unidad/cantidad/costo_unit; el código usa items/extras/cont_num/total)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE contenedor_insumos
  ADD COLUMN IF NOT EXISTS cont_num   text,
  ADD COLUMN IF NOT EXISTS items      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extras     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS total      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha      date;

ALTER TABLE contenedor_insumos
  DROP COLUMN IF EXISTS nombre,
  DROP COLUMN IF EXISTS unidad,
  DROP COLUMN IF EXISTS cantidad,
  DROP COLUMN IF EXISTS costo_unit;


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 3: FIX inventario_movimientos
-- (schema original tenía inv_id/nombre/cantidad/fecha; el código usa item_nombre/cant/antes/despues/created_at)
-- ─────────────────────────────────────────────────────────────────────────

-- Recrear la tabla con las columnas correctas (si ya existe y está vacía)
-- Si tiene datos, primero los borramos (historial de movimientos es regenerable)
DROP TABLE IF EXISTS inventario_movimientos;

CREATE TABLE inventario_movimientos (
  id          bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  item_nombre text NOT NULL,
  tipo        text NOT NULL,
  cant        numeric NOT NULL,
  obs         text,
  antes       numeric NOT NULL DEFAULT 0,
  despues     numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventario_movimientos DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos REPLICA IDENTITY FULL;


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 4: CREAR tabla contenedor_rendimientos (si no existe)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contenedor_rendimientos (
  id               bigint PRIMARY KEY,
  cont_id          bigint REFERENCES contenedores(id) ON DELETE CASCADE,
  cont_num         text,
  fecha            date NOT NULL DEFAULT CURRENT_DATE,
  proveedor        text,
  kilos_procesados numeric(10,2) NOT NULL DEFAULT 0,
  kilos_devueltos  numeric(10,2) DEFAULT 0,
  cajas_del_monte  integer DEFAULT 0,
  cajas_princess   integer DEFAULT 0,
  observaciones    text[] DEFAULT '{}',
  obs_detalle      text,
  created_at       timestamptz DEFAULT now()
);

-- Si la tabla ya existía sin la columna proveedor, la agregamos
ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS proveedor text;

ALTER TABLE contenedor_rendimientos DISABLE ROW LEVEL SECURITY;
ALTER TABLE contenedor_rendimientos REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_rendimientos_cont_id ON contenedor_rendimientos(cont_id);
CREATE INDEX IF NOT EXISTS idx_rendimientos_fecha   ON contenedor_rendimientos(fecha);


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 5: CREAR tabla packing_lists (si no existe)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packing_lists (
  id             bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  contenedor_id  bigint NOT NULL,
  fase           int    NOT NULL DEFAULT 1,
  total_cajas    int    NOT NULL DEFAULT 1400,
  cajas_input    text   NOT NULL DEFAULT '1400',
  pallets        jsonb  NOT NULL DEFAULT '[]',
  layout_camion  jsonb  NOT NULL DEFAULT '{"left":[],"right":[]}',
  layout_cont    jsonb  NOT NULL DEFAULT '{"left":[],"right":[]}',
  admin_data     jsonb  NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE packing_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_packing_lists_contenedor
  ON packing_lists (contenedor_id);


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 6: CREAR tabla configuracion (si no existe) + Replica Identity
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS configuracion (
  clave      text PRIMARY KEY,
  valor      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion REPLICA IDENTITY FULL;


-- ─────────────────────────────────────────────────────────────────────────
-- BLOQUE 7: FIX constraints — contratos unique + asistencia estado nullable
-- ─────────────────────────────────────────────────────────────────────────

-- Eliminar duplicados en contratos (si el bug de upsert creó filas extra)
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

-- asistencia.estado puede ser null (empleado sin marcar pero con obs/contenedor)
ALTER TABLE asistencia
  ALTER COLUMN estado DROP NOT NULL;

ALTER TABLE asistencia
  ALTER COLUMN estado DROP DEFAULT;


-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────────────────

SELECT 'pedidos' AS tabla, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pedidos'
  AND column_name IN ('cantidad_kg','precio_usd','obs','contenedor')
UNION ALL
SELECT 'cont_insumos', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_insumos'
  AND column_name IN ('items','extras','cont_num','total')
UNION ALL
SELECT 'inv_mov', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inventario_movimientos'
  AND column_name IN ('item_nombre','cant','antes','despues')
UNION ALL
SELECT 'rendimientos', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
  AND column_name IN ('proveedor','kilos_procesados')
UNION ALL
SELECT 'packing_lists', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'packing_lists'
  AND column_name IN ('pallets','admin_data')
ORDER BY tabla, column_name;
