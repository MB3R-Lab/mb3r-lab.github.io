# MB3R Lab Landing

Landing page for MB3R Lab with a pilot-request workflow, lightweight backend (Express + SQLite), confirmation emails, and a password-protected admin view.

## Quick start

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env
   # then adjust PORT/ADMIN_PASSWORD/etc.
   ```
3. **Run the server**
   ```bash
   npm start
   ```
   The server serves the landing page (`/`), the admin dashboard (`/admin`), and exposes APIs under `/api`.

Use `npm run dev` for development with automatic restarts (requires `nodemon` from devDependencies).

## Features

- **CTA + modal form** — visitors leave an email, company, and optional comment for pilot onboarding. Validation happens on the client and the server.
- **SQLite storage** — submissions are stored in `data/applications.sqlite` (auto-created).
- **Mail service** — every submission triggers an email written to `data/outbox/*.eml`. Configure the sender via `MAIL_FROM`.
- **Admin dashboard** (`/admin`) — shows a table of submissions. Access requires a password entered in a modal (default `123456789@`, override via `ADMIN_PASSWORD`).
- **API endpoints**
  - `POST /api/applications` — accepts `{ email, company, comment? }` and returns the new `id`.
  - `GET /api/applications` — returns all submissions when the `x-admin-pass` header matches `ADMIN_PASSWORD`.

## Environment variables

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | `123456789@` | Password required by `/admin` UI and API header |
| `DATA_DIR` | `./data` | Folder where SQLite DB and outbox live |
| `MAIL_FROM` | `MB3R Lab <noreply@mb3r-lab.org>` | Sender shown in confirmation emails |
| `MAIL_OUTBOX_DIR` | `./data/outbox` | Where `.eml` files are written |

## Database schema

`applications` table (auto-created):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK | Auto-increment |
| `email` | TEXT | Required |
| `company` | TEXT | Required |
| `comment` | TEXT | Optional |
| `created_at` | TEXT | ISO timestamp stored via `CURRENT_TIMESTAMP` |

## Email testing

Emails are generated with Nodemailerʼs `streamTransport`, so no SMTP credentials are needed. Each confirmation email lands in `data/outbox/*.eml` and can be opened with any mail client for inspection.
