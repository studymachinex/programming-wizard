#!/bin/sh
# Run script usado pela plataforma.
set -e

exec java -jar /tmp/codecrafters-build-kafka-java/kafka.jar "$@"
