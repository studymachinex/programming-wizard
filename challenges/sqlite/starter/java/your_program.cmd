@echo off
REM Compila e roda o seu SQLite.
REM Uso: your_program.cmd <banco.db> .dbinfo
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\sqlite.jar" %*
