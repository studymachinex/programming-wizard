@echo off
REM Compila e roda o servidor DNS localmente.
REM Uso: your_program.cmd [--resolver <ip:porta>] [--port <porta>]
cd /d "%~dp0"
call mvn -q -B package
if errorlevel 1 exit /b 1
java -jar target\dns-server.jar %*
