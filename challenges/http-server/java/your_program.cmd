@echo off
REM Compila e roda o HTTP server localmente.
REM Uso: your_program.cmd [--directory <pasta>] [--port <porta>]
cd /d "%~dp0"
call mvn -q -B package
if errorlevel 1 exit /b 1
java -jar target\http-server.jar %*
