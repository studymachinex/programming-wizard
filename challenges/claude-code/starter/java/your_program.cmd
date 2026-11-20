@echo off
REM Compila e roda o seu agente no diretório atual.
REM Uso: your_program.cmd -p "<prompt>"
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\agent.jar" %*
