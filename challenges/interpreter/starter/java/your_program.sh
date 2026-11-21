#!/bin/sh
# Compila e roda o seu interpreter.
# Uso: ./your_program.sh <tokenize|parse|evaluate|run> <arquivo.lox>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/interpreter.jar" "$@"
