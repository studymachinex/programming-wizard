@echo off
REM Compila e roda o seu cliente BitTorrent.
REM Uso: your_program.cmd decode 5:hello
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\bittorrent.jar" %*
