@echo off
REM Compila e roda o seu tokenizer. A entrada vem pelo stdin.
REM Uso: echo hello | your_program.cmd bytes
pushd "%~dp0"
call mvn -q -B package
if errorlevel 1 (popd & exit /b 1)
popd
java -jar "%~dp0target\tokenizer.jar" %*
