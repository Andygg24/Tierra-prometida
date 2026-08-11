-- Migración: reduce Estado del Contenedor a 3 opciones (Posicionado, Lleno, Embarcado)
-- Ejecutar en Supabase SQL Editor

-- Remapear valores existentes:
--   Vacío, Puerto              -> Posicionado
--   Cargado, En tránsito       -> Lleno
--   Embarcado                  -> se queda igual
UPDATE logistica_bookings SET estado_contenedor = 'Posicionado' WHERE estado_contenedor IN ('Vacío', 'Puerto');
UPDATE logistica_bookings SET estado_contenedor = 'Lleno'       WHERE estado_contenedor IN ('Cargado', 'En tránsito');

-- Nuevo valor por defecto para operaciones futuras
ALTER TABLE logistica_bookings ALTER COLUMN estado_contenedor SET DEFAULT 'Posicionado';

-- Verificar: no debe quedar ningún valor fuera de las 3 opciones nuevas
SELECT estado_contenedor, count(*) FROM logistica_bookings GROUP BY estado_contenedor;
