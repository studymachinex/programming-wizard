@echo off
REM Compila e roda o seu redis.
REM Uso: your_program.cmd [--port 6379] [--replicaof "host porta"]
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\redis.jar" %*
