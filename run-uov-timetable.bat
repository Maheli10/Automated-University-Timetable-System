@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ================================================
echo UOV Timetable System - Automatic Setup
echo ================================================

if not exist ".env" (
  echo Creating .env configuration...
  copy /y ".env.example" ".env" >nul
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is not installed. Installing pnpm with npm...
  where npm >nul 2>nul
  if errorlevel 1 goto :missingnode
  call npm install -g pnpm
  if errorlevel 1 goto :error
)

echo [1/4] Installing packages...
call pnpm install
if errorlevel 1 (
  echo Package installation was locked or incomplete. Closing Node processes and retrying...
  taskkill /F /IM node.exe >nul 2>nul
  if exist node_modules rmdir /S /Q node_modules
  call pnpm install
  if errorlevel 1 goto :error
)

echo [2/4] Creating the uov_timetable database...
set "MYSQL_EXE="
if exist "C:\xampp\mysql\bin\mysql.exe" set "MYSQL_EXE=C:\xampp\mysql\bin\mysql.exe"
if defined MYSQL_EXE goto :mysqlfound
where mysql >nul 2>nul
if not errorlevel 1 set "MYSQL_EXE=mysql.exe"
if not defined MYSQL_EXE goto :mysqlmissing
:mysqlfound
"%MYSQL_EXE%" -u root -e "CREATE DATABASE IF NOT EXISTS uov_timetable CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 goto :mysqlerror

echo [3/4] Creating and updating all database tables...
call pnpm db:push
if errorlevel 1 goto :error

echo [4/4] Starting UOV Timetable System...
echo Open http://localhost:3000 after the server starts.
call pnpm dev
exit /b 0

:mysqlmissing
echo.
echo MySQL was not found. Please start MySQL in XAMPP, then run this file again.
echo Expected path: C:\xampp\mysql\bin\mysql.exe
pause
exit /b 1

:mysqlerror
echo.
echo MySQL could not create the database. Confirm XAMPP MySQL is running.
pause
exit /b 1

:missingnode
echo Node.js/npm is not installed. Install Node.js LTS, then run this file again.
pause
exit /b 1

:error
echo.
echo Setup failed. Check the error above. Keep XAMPP MySQL running and run this file again.
echo If the error mentions EBUSY, close VS Code terminals and retry this launcher.
pause
exit /b 1
