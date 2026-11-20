@echo off
REM Compila e roda o seu git no diretório atual.
REM Uso: your_program.cmd <comando> [<args>...]   (ex.: your_program.cmd init)
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\git.jar" %*
