class EmailService {
    constructor({ from, apiKey, domain, baseUrl = 'https://api.mailgun.net/v3' }) {
        this.from = from;
        this.apiKey = apiKey;
        this.domain = domain;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    get isConfigured() {
        return Boolean(this.apiKey && this.domain && this.from);
    }

    buildPayload({ to, subject, text, html }) {
        const params = new URLSearchParams();
        params.append('from', this.from);
        params.append('to', to);
        params.append('subject', subject);
        params.append('text', text);
        params.append('html', html);
        return params;
    }

    async sendConfirmation(to, company) {
        if (!to || !this.isConfigured) {
            if (!this.isConfigured) {
                console.warn('[email] Mailgun is not fully configured. Skipping email send.');
            }
            return null;
        }

        const subject = 'MB3R Lab — pilot request received';
        const plainText = [
            'Hi there,',
            '',
            'Thanks for your interest in running a pilot with MB3R Lab.',
            `Company: ${company || '—'}`,
            '',
            'Our team will follow up shortly with next steps.',
            '',
            '— MB3R Lab'
        ].join('\n');

        const html = plainText
            .split('\n')
            .map((line) => (line ? `<p>${line}</p>` : '<br>'))
            .join('');

        const endpoint = `${this.baseUrl}/${this.domain}/messages`;
        const payload = this.buildPayload({ to, subject, text: plainText, html });
        const authHeader = `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload
        });

        if (!response.ok) {
            const body = await response.text();
            const error = new Error(`Mailgun request failed with status ${response.status}`);
            error.status = response.status;
            error.body = body;
            throw error;
        }

        const result = await response.json().catch(() => ({}));
        return {
            messageId: result.id || null,
            status: result.message || 'queued'
        };
    }
}

module.exports = EmailService;
