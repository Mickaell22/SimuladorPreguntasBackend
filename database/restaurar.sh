#!/bin/bash
# Restaura la DB desde un archivo SQL.
# Los archivos ya incluyen schema, datos, permisos y usuario simulador_app.
#
# Uso:
#   ./restaurar.sh backup_20260320_115755.sql   <- con datos
#   ./restaurar.sh schema_only.sql              <- solo estructura
#
# Si la base de datos no existe todavia, crearla primero:
#   PGPASSWORD=<pass> createdb -U postgres -h 127.0.0.1 simulador_preguntas

set -e

DUMP=${1:-""}
DB="simulador_preguntas"
USER="postgres"
HOST="127.0.0.1"
PORT="5432"
DIR="$(dirname "$0")"

if [ -z "$DUMP" ]; then
  echo "ERROR: especifica el archivo SQL"
  echo "Uso: $0 <archivo.sql>"
  exit 1
fi

if [ ! -f "$DUMP" ]; then
  echo "ERROR: archivo no encontrado: $DUMP"
  exit 1
fi

read -s -p "Password de postgres: " PGPASSWORD
export PGPASSWORD
echo ""

echo "Eliminando schema anterior si existe..."
psql -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" -c "DROP SCHEMA IF EXISTS simulador CASCADE;" 2>/dev/null || true

echo "Restaurando $DUMP ..."
psql -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" -f "$DUMP"

echo ""
echo "OK — restauracion completada"
echo "Usuario de la app: simulador_app / Sim2024AppSecure9x"
