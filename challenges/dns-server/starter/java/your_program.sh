#!/bin/sh
# Compila e roda o servidor DNS localmente.
# Uso: ./your_program.sh [--resolver <ip:porta>] [--port <porta>]
set -e

cd "$(dirname "$0")"
mvn -q -B package
exec java -jar target/dns-server.jar "$@"
