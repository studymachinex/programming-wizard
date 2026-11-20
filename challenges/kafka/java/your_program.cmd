@echo off
REM Compila e roda o seu broker Kafka.
REM Uso: your_program.cmd <server.properties>
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\kafka.jar" %*
