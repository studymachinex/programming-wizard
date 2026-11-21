#!/bin/sh
# Compila e roda o seu shell.
# Uso: ./your_program.sh
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/shell.jar" "$@"
