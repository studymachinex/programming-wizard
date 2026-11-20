#!/bin/sh
# Compila e roda o HTTP server localmente.
# Uso: ./your_program.sh [--directory <pasta>] [--port <porta>]
set -e

cd "$(dirname "$0")"
mvn -q -B package
exec java -jar target/http-server.jar "$@"
