@echo off
title SafetySync Pro Development
echo ========================================
echo SafetySync Pro Development Environment
echo ========================================

REM Map network drive
net use Z: \\GMK-DC\RedirectedFolders\Bill.S >nul 2>&1

REM Navigate to project
Z:
cd Documents\safetysync-pro

REM Set up aliases for easier development
set NODE_CMD=c:\nodejs\node.exe
set NPM_CMD=c:\nodejs\node.exe c:\nodejs\node_modules\npm\bin\npm-cli.js

echo ✅ Node.js: %NODE_CMD%
echo ✅ npm: %NPM_CMD%
echo ✅ Project: %CD%
echo.

echo Available commands:
echo   npm install     - Install dependencies
echo   npm start       - Start the application  
echo   node app.js     - Run app directly
echo   code .          - Open VS Code
echo.

REM Keep command prompt open
cmd /k