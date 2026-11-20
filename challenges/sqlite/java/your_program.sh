#!/bin/sh
# Compila e roda o seu SQLite.
# Uso: ./your_program.sh <banco.db> .dbinfo
#      ./your_program.sh <banco.db> "SELECT name FROM apples"
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/sqlite.jar" "$@"
