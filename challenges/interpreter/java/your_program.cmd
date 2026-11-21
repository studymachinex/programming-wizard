@echo off
REM Compila e roda o seu interpreter.
REM Uso: your_program.cmd <tokenize|parse|evaluate|run> <arquivo.lox>
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\interpreter.jar" %*
