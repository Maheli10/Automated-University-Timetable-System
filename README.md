
# Automated University Timetable Management System

A web-based system for managing and generating university timetables while detecting scheduling conflicts. The system is designed to support students, lecturers, staff, and administrators in managing academic scheduling more efficiently.

## Project Status

🚧 **Under Development**

The current repository contains the initial project structure and setup. Feature development will be carried out through separate branches by the team members.

## Main Technologies

* **Frontend:** React, TypeScript, Vite
* **Backend:** Node.js, TypeScript, tRPC
* **Database:** MySQL
* **ORM:** Drizzle ORM
* **Package Manager:** pnpm

## Repository Structure

```text
uov-timetable-work/
│
├── client/          # Frontend application
├── server/          # Backend and API
├── shared/          # Shared types and utilities
├── drizzle/         # Database schema and migrations
├── database/        # Database setup scripts
├── docs/            # Project documentation
├── README.md
├── package.json
└── pnpm-lock.yaml
```

## Team Branches

Development will be divided by features to allow team members to work independently and reduce conflicts.

| Member   | Branch                             | Main Responsibility                                   |
| -------- | ---------------------------------- | ----------------------------------------------------- |
| Member 1 | `feature/student-batch-management` | Student and batch management                          |
| Member 2 | `feature/academic-data-management` | Subjects, lecturers, rooms and academic data          |
| Member 3 | `feature/timetable-generation`     | Timetable generation and scheduling logic             |
| Member 4 | `feature/constraints-conflicts`    | Availability constraints and conflict detection       |
| Member 5 | `feature/frontend-timetable`       | Timetable interface, views and search/filter features |
| Member 6 | `feature/auth-reports`             | Authentication, roles, reports and notifications      |

### Additional Branches

```text
prototype
```

Used for early UI/prototype work.

```text
feature/documentation
```

Can be used when adding or updating project-wide documentation such as requirements, database documentation, architecture, and API documentation.

## Development Workflow

Each member works on their assigned feature branch.

```text
Feature Branch
      ↓
   Pull Request
      ↓
    Review
      ↓
     main
```

The `main` branch will contain the stable version of the project. Direct pushes to `main` should be avoided.

## Documentation

Project documentation will be maintained in:

```text
docs/
├── requirements/
├── database/
├── architecture/
└── api/
```

## Team

This project is developed as a university group project by six team members.
