#!/bin/bash
# UOV Timetable System — one-click start for macOS.
# Double-click this file in Finder (first time: right-click → Open).
cd "$(dirname "$0")" || exit 1
echo "================================================"
echo " UOV Timetable System - macOS start"
echo "================================================"

# Homebrew / XAMPP paths
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/XAMPP/xamppfiles/bin:/opt/homebrew/opt/mysql/bin:/usr/local/opt/mysql/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org (or: brew install node) and run this again."
  read -n 1 -s -r -p "Press any key to close"; exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm…"
  npm install -g pnpm || sudo npm install -g pnpm || { echo "Could not install pnpm."; read -n 1 -s -r; exit 1; }
fi
[ -f .env ] || cp .env.example .env

echo "[1/4] Installing packages…"
pnpm install || { echo "Package installation failed."; read -n 1 -s -r; exit 1; }

echo "[2/4] Creating the uov_timetable database…"
if command -v mysql >/dev/null 2>&1; then
  mysql -u root -h 127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS uov_timetable CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
    || echo "  (Could not create it automatically – if the next step fails, create 'uov_timetable' in phpMyAdmin.)"
else
  echo "  mysql client not found – make sure MySQL is running and the 'uov_timetable' database exists."
fi

echo "[3/4] Creating / updating tables…"
pnpm db:push || { echo "Database setup failed. Is MySQL running? Check DATABASE_URL in .env"; read -n 1 -s -r; exit 1; }

echo "[4/4] Starting… the browser opens at http://localhost:3000"
( sleep 6; open "http://localhost:3000" ) &
pnpm dev
