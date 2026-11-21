@echo off
REM Compila e roda o seu shell.
REM Uso: your_program.cmd
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\shell.jar" %*
