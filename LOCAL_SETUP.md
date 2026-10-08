# UOV Timetable System — Windows + XAMPP setup

## Important distinction

**phpMyAdmin is only the database management page.** The timetable application itself opens at `http://localhost:3000`, not at `http://localhost/phpmyadmin`. Use phpMyAdmin to create the database, then run the Node application separately.

## 1. Install and start XAMPP

Install XAMPP for Windows. Open the XAMPP Control Panel and start **MySQL**. Apache is optional; phpMyAdmin normally opens through Apache at:

```text
http://localhost/phpmyadmin
```

If that URL does not open, use the XAMPP Control Panel **MySQL Admin** button. If Apache is stopped, start Apache too.

## Quick option: one-click launcher

After starting XAMPP MySQL, double-click `run-uov-timetable.bat` in the project folder. It installs packages, creates the `uov_timetable` database when XAMPP is installed at `C:\xampp`, applies the Drizzle tables, and starts the application. If XAMPP is installed elsewhere, follow the manual steps below once.

## 2. Create the database

In phpMyAdmin, select the **SQL** tab and run the contents of:

```text
database/create-database.sql
```

The database name must be:

```text
uov_timetable
```

Do not manually create the tables; Drizzle will create/update them.

## 3. Environment file (already included)

The project package already includes a ready-to-use `.env` file for the normal XAMPP setup. You do not need to create any file manually. If `.env` is ever missing, `run-uov-timetable.bat` automatically creates it from `.env.example`.

For the usual XAMPP default account, the included `.env` contains:

```text
DATABASE_URL=mysql://root:@127.0.0.1:3306/uov_timetable
JWT_SECRET=uov-local-secret-change-this
LOCAL_DEMO_MODE=false
VITE_LOCAL_DEMO_MODE=false
PORT=3000
EMAIL_WEBHOOK_URL=
EMAIL_FROM=timetable@vau.ac.lk
```

If you set a MySQL root password in XAMPP, use it between the colon and `@`, for example:

```text
DATABASE_URL=mysql://root:MyPassword@127.0.0.1:3306/uov_timetable
```

Do not put spaces around `=`. Save the file exactly as `.env`, not `.env.txt`.

## 4. Install dependencies and start automatically

You can now double-click `run-uov-timetable.bat`. It automatically installs packages, creates the database, creates/updates all tables, and starts the application. No manual project file creation is required.

For manual commands, use:

Open the VS Code terminal in the project root:

```powershell
pnpm install
```

If `pnpm` is not recognised, install it once:

```powershell
npm install -g pnpm
```

## 5. Create/update all tables

Make sure XAMPP MySQL is running, then run:

```powershell
pnpm db:push
```

If this command says `ECONNREFUSED`, MySQL is not running or is using a different port. Check the MySQL port in XAMPP. If it is `3307`, use:

```text
DATABASE_URL=mysql://root:@127.0.0.1:3307/uov_timetable
```

## 6. Start the timetable application

```powershell
pnpm dev
```

Open the URL printed in the terminal, normally:

```text
http://localhost:3000
```

Do not use `http://localhost/phpmyadmin` as the timetable application URL.

## 7. Login

Use the local login screen:

```text
Email: admin@uov.local
Password: Admin@12345
Role: Admin
```

The project does not require Manus OAuth for local login.

Only the administrator bootstrap account uses a default password. Lecturers and students must first be created by the administrator using their university email. On their first login, they enter that email and leave the password empty; the application immediately asks them to create a private password. Account creation, administrator password resets, swap decisions, timetable cancellations, and timetable time changes create dashboard notices. Real external email delivery requires `EMAIL_WEBHOOK_URL`; without it, dashboard notices still work and the server logs the email event.

## 8. Correct upload order

1. Login as admin.
2. Open **Staff & Lecturer Management → Lecturers**.
3. Upload the lecturer template.
4. Open **Staff & Lecturer Management → Students**.
5. Upload student details.
6. Upload rooms.
7. Upload courses.
8. Generate Semester 1 or Semester 2 timetable.

## 9. Common errors

| Error | Fix |
|---|---|
| `http://localhost/phpmyadmin` does not open | Start Apache in XAMPP, or use the XAMPP MySQL Admin button. |
| `ECONNREFUSED 127.0.0.1:3306` | Start MySQL or correct the port in `.env`. |
| `Unknown database uov_timetable` | Run `database/create-database.sql` in phpMyAdmin. |
| `DATABASE_URL is required` | Create `.env` in the project root and restart the terminal. |
| `Invalid university email or password` | Confirm MySQL is running and the database is configured, then use `admin@uov.local` and `Admin@12345`, with Admin selected. Lecturer/student emails must first be added by the administrator and must be used with an empty password on first login. |
| Browser shows port 3001/3002 | Port 3000 was busy; open the exact URL printed by `pnpm dev`. |
| Tables are missing | Stop the app, start MySQL, run `pnpm db:push`, then run `pnpm dev`. |

## 10. Verification commands

```powershell
pnpm check
pnpm test
pnpm build
```
