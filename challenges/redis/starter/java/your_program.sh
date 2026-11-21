#!/bin/sh
# Compila e roda o seu redis.
# Uso: ./your_program.sh [--port 6379] [--replicaof "host porta"] [--dir d --dbfilename f] [--appendonly yes]
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/redis.jar" "$@"
