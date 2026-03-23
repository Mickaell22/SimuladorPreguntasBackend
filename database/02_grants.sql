-- =============================================
-- GRANTS: permisos sobre tablas ya existentes
-- Ejecutar despues de restaurar el dump
-- =============================================

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA simulador TO simulador_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA simulador TO simulador_app;
