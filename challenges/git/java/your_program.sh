#!/bin/sh
# Compila e roda o seu git no diretório atual.
# Uso: ./your_program.sh <comando> [<args>...]   (ex.: ./your_program.sh init)
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/git.jar" "$@"
