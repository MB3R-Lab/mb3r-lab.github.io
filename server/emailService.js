const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

class EmailService {
    constructor({ from, outboxDir }) {
        this.from = from;
        this.outboxDir = outboxDir;
        fs.mkdirSync(this.outboxDir, { recursive: true });

        // streamTransport avoids external SMTP dependency; messages are stored locally
        this.transporter = nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
            buffer: true
        });
    }

    async sendConfirmation(to, company) {
        if (!to) {
            return null;
        }

        const subject = 'MB3R Lab — заявка на пилотное внедрение получена';
        const plainText = [
            'Здравствуйте!',
            '',
            'Мы получили вашу заявку на пилотное внедрение MB3R Lab.',
            `Компания: ${company || '—'}`,
            '',
            'Команда свяжется с вами в ближайшее время.',
            '',
            '— MB3R Lab'
        ].join('\n');

        const html = plainText
            .split('\n')
            .map((line) => (line ? `<p>${line}</p>` : '<br>'))
            .join('');

        const info = await this.transporter.sendMail({
            from: this.from,
            to,
            subject,
            text: plainText,
            html
        });

        const messageId = info.messageId || `msg-${Date.now()}`;
        const filePath = path.join(this.outboxDir, `${messageId}.eml`);

        if (info.message) {
            await fs.promises.writeFile(filePath, info.message);
        }

        return { messageId, filePath };
    }
}

module.exports = EmailService;
