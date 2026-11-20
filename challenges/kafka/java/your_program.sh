#!/bin/sh
# Compila e roda o seu broker Kafka.
# Uso: ./your_program.sh <server.properties>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/kafka.jar" "$@"
