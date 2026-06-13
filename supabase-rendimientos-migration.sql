-- Migración: Módulo Rendimientos del Contenedor
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contenedor_rendimientos (
  id              bigint PRIMARY KEY,
  cont_id         bigint REFERENCES contenedores(id) ON DELETE CASCADE,
  cont_num        text,
  fecha           date NOT NULL DEFAULT CURRENT_DATE,
  kilos_procesados numeric(10,2) NOT NULL,
  kilos_devueltos  numeric(10,2) DEFAULT 0,
  cajas_del_monte  integer DEFAULT 0,
  cajas_princess   integer DEFAULT 0,
  observaciones    text[] DEFAULT '{}',
  obs_detalle      text,
  created_at       timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_rendimientos_cont_id ON contenedor_rendimientos(cont_id);
CREATE INDEX IF NOT EXISTS idx_rendimientos_fecha   ON contenedor_rendimientos(fecha);

-- RLS (misma política que las otras tablas del módulo)
ALTER TABLE contenedor_rendimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON contenedor_rendimientos
  FOR ALL USING (true) WITH CHECK (true);
