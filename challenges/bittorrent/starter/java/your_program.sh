#!/bin/sh
# Compila e roda o seu cliente BitTorrent.
# Uso: ./your_program.sh decode 5:hello
#      ./your_program.sh download -o arquivo.bin exemplo.torrent
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
(cd "$HERE" && mvn -q -B package)
exec java -jar "$HERE/target/bittorrent.jar" "$@"
