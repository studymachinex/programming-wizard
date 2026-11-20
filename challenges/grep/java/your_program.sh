#!/bin/sh
# Compila e roda o seu grep.
# Uso: echo "apple" | ./your_program.sh -E "a"
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/grep.jar" "$@"
