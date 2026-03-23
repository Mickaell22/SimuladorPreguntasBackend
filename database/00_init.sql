-- =============================================
-- INIT: schema y usuario de aplicacion
-- Ejecutar como superusuario (postgres) contra
-- la base de datos simulador_preguntas
-- =============================================

-- Crear schema si no existe
CREATE SCHEMA IF NOT EXISTS simulador;

-- Crear usuario de aplicacion (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'simulador_app') THEN
    CREATE USER simulador_app WITH PASSWORD 'Sim2024AppSecure9x';
  ELSE
    ALTER USER simulador_app WITH PASSWORD 'Sim2024AppSecure9x';
  END IF;
END$$;

-- Permiso de conexion a la base de datos
GRANT CONNECT ON DATABASE simulador_preguntas TO simulador_app;

-- Permiso de uso del schema
GRANT USAGE ON SCHEMA simulador TO simulador_app;

-- Privilegios por defecto para objetos creados en el schema simulador
ALTER DEFAULT PRIVILEGES IN SCHEMA simulador GRANT ALL ON TABLES    TO simulador_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA simulador GRANT ALL ON SEQUENCES TO simulador_app;
