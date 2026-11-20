#!/bin/sh
# Compila e roda o seu agente no diretório atual.
# Uso: ./your_program.sh -p "<prompt>"
# Variáveis: OPENAI_BASE_URL, OPENAI_API_KEY e MODEL.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/agent.jar" "$@"
