#!/bin/sh
# Run script usado pela plataforma.
set -e

exec java -jar /tmp/codecrafters-build-git-java/git.jar "$@"
