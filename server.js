require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const EmailService = require('./server/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789@';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'applications.sqlite');

const db = new Database(DB_PATH);
db.prepare(`
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`).run();

const emailService = new EmailService({
    from: process.env.MAIL_FROM || 'MB3R Lab <noreply@mb3r-lab.org>',
    outboxDir: path.resolve(process.env.MAIL_OUTBOX_DIR || path.join(DATA_DIR, 'outbox'))
});

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

app.use(express.json());

app.use('/assets', express.static(path.join(__dirname, 'assets')));

['manifest.webmanifest', 'robots.txt', 'sitemap.xml'].forEach((fileName) => {
    app.get(`/${fileName}`, (_, res) => {
        res.sendFile(path.join(__dirname, fileName));
    });
});

const sendIndex = (_, res) => res.sendFile(path.join(__dirname, 'index.html'));
const sendAdmin = (_, res) => res.sendFile(path.join(__dirname, 'admin.html'));

app.get('/', sendIndex);
app.get('/index.html', sendIndex);
app.get('/admin', sendAdmin);

app.post('/api/applications', async (req, res, next) => {
    try {
        const { email, company, comment } = req.body || {};
        const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
        const normalizedCompany = company ? String(company).trim() : '';
        const normalizedComment = comment ? String(comment).trim() : null;

        if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
            return res.status(400).json({ message: 'Укажите корректный email.' });
        }

        if (!normalizedCompany) {
            return res.status(400).json({ message: 'Поле "Компания" обязательно.' });
        }

        const stmt = db.prepare(`
            INSERT INTO applications (email, company, comment)
            VALUES (?, ?, ?)
        `);
        const result = stmt.run(normalizedEmail, normalizedCompany, normalizedComment);

        await emailService.sendConfirmation(normalizedEmail, normalizedCompany);

        return res.status(201).json({
            id: result.lastInsertRowid,
            message: 'Заявка отправлена.'
        });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/applications', (req, res) => {
    const providedPassword = req.header('x-admin-pass');

    if (!providedPassword) {
        return res.status(401).json({ message: 'Требуется пароль администратора.' });
    }

    if (providedPassword !== ADMIN_PASSWORD) {
        return res.status(403).json({ message: 'Неверный пароль.' });
    }

    const rows = db.prepare(`
        SELECT id, email, company, comment, created_at
        FROM applications
        ORDER BY datetime(created_at) DESC
    `).all();

    return res.json(rows);
});

app.use((_, res) => {
    res.status(404).json({ message: 'Не найдено' });
});

app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Внутренняя ошибка сервера.' });
});

app.listen(PORT, () => {
    console.log(`MB3R Lab server listening on http://localhost:${PORT}`);
});

module.exports = app;
