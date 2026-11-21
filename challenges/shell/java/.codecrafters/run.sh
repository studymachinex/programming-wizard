#!/bin/sh
# Run script usado pela plataforma.
set -e

exec java -jar /tmp/codecrafters-build-shell-java/shell.jar "$@"
