#!/bin/sh
# Compile script usado pelo CodeCrafters/plataforma.
set -e

cd "$(dirname "$0")/.."
mvn -B package -Ddir=/tmp/codecrafters-build-http-server-java
