#!/bin/sh
# Run script usado pelo CodeCrafters/plataforma.
set -e

exec java -jar /tmp/codecrafters-build-http-server-java/http-server.jar "$@"
