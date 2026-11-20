#!/bin/sh
# Compile script usado pela plataforma.
set -e

cd "$(dirname "$0")/.."
mvn -B package -Ddir=/tmp/codecrafters-build-grep-java
