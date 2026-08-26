@echo off
cd /d "%~dp0"
node signin.js auto >> signin.log 2>&1
