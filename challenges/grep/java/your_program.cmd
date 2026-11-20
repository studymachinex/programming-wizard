@echo off
REM Compila e roda o seu grep.
REM Uso: echo apple | your_program.cmd -E "a"
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\grep.jar" %*
