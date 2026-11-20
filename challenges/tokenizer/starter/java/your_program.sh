#!/bin/sh
# Compila e roda o seu tokenizer. A entrada vem pelo stdin.
# Uso: echo "hello" | ./your_program.sh bytes
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/tokenizer.jar" "$@"
