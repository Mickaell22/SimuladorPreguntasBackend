#!/bin/bash
# Restaura un backup en una maquina nueva o existente.
# Uso: ./restaurar.sh <archivo.dump|archivo.sql>
#
# Si la base de datos no existe todavia, crearla primero:
#   PGPASSWORD=<pass> createdb -U postgres -h localhost simulador_preguntas

set -e

DUMP=${1:-""}
DB="simulador_preguntas"
USER="postgres"
HOST="localhost"
PORT="5432"
DIR="$(dirname "$0")"

if [ -z "$DUMP" ]; then
  echo "ERROR: especifica el archivo dump"
  echo "Uso: $0 <archivo.dump|archivo.sql>"
  exit 1
fi

if [ ! -f "$DUMP" ]; then
  echo "ERROR: archivo no encontrado: $DUMP"
  exit 1
fi

read -s -p "Password de postgres: " PGPASSWORD
export PGPASSWORD
echo ""

echo "1/3 Aplicando init (schema + usuario simulador_app + permisos default)..."
psql -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" -f "$DIR/00_init.sql"

echo "2/3 Restaurando dump..."
if [[ "$DUMP" == *.dump ]]; then
  pg_restore -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" --no-owner -F c "$DUMP"
else
  psql -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" -f "$DUMP"
fi

echo "3/3 Aplicando grants sobre tablas restauradas..."
psql -U "$USER" -h "$HOST" -p "$PORT" -d "$DB" -f "$DIR/02_grants.sql"

echo ""
echo "OK — restauracion completada"
echo "Usuario de la app: simulador_app / Sim2024AppSecure9x"
