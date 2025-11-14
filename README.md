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
- **Mail service** — every submission triggers a confirmation email via Mailgun. Configure the sender plus API credentials via `MAIL_FROM`, `MAILGUN_API_KEY`, and `MAILGUN_DOMAIN`.
- **Admin dashboard** (`/admin`) — shows a table of submissions. Access requires a password entered in a modal (default `123456789@`, override via `ADMIN_PASSWORD`).
- **API endpoints**
  - `POST /api/applications` — accepts `{ email, company, comment? }` and returns the new `id`.
  - `GET /api/applications` — returns all submissions when the `x-admin-pass` header matches `ADMIN_PASSWORD`.

## Environment variables

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | — | Password required by `/admin` UI and API header (must be set) |
| `DATA_DIR` | `./data` | Folder where SQLite DB lives |
| `MAIL_FROM` | `MB3R Lab <noreply@mb3r-lab.org>` | Sender shown in confirmation emails |
| `MAILGUN_API_KEY` | — | Mailgun private API key (required for email delivery) |
| `MAILGUN_DOMAIN` | — | Mailgun domain, e.g. `mg.example.com` |
| `MAILGUN_API_BASE_URL` | `https://api.mailgun.net/v3` | Override for EU region or custom edge |

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

The backend now calls Mailgun's HTTP API directly. For local development you can keep `MAILGUN_*` variables empty; the server will skip the email send (logging a warning) but still accept submissions. To test delivery end-to-end, provision a Mailgun domain, set the variables, and submit the pilot form — Mailgun should show the event immediately in its dashboard.
