import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'MB3R Lab <noreply@mb3r-lab.org>';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_API_BASE_URL =
    Deno.env.get('MAILGUN_API_BASE_URL') ?? 'https://api.mailgun.net/v3';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as secrets.');
}

if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be set as a secret.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-admin-pass',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        if (req.method === 'POST') {
            return await handlePost(req);
        }

        if (req.method === 'GET') {
            return await handleGet(req);
        }

        return new Response('Method Not Allowed', {
            status: 405,
            headers: corsHeaders
        });
    } catch (error) {
        console.error('[applications] unhandled error', error);
        return jsonResponse({ message: 'Internal server error.' }, 500);
    }
});

async function handlePost(req: Request): Promise<Response> {
    const payload = await req.json().catch(() => ({}));
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const company = typeof payload.company === 'string' ? payload.company.trim() : '';
    const comment = typeof payload.comment === 'string' ? payload.comment.trim() : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ message: 'Please provide a valid email address.' }, 400);
    }

    if (!company) {
        return jsonResponse({ message: 'Company is required.' }, 400);
    }

    const country = detectCountry(req) ?? null;

    const { data, error } = await supabase
        .from('applications')
        .insert({ email, company, comment, country })
        .select('id, created_at, country')
        .single();

    if (error) {
        console.error('[applications] insert failed', error);
        return jsonResponse({ message: 'Unable to save your request.' }, 500);
    }

    try {
        await sendConfirmation(email, company);
    } catch (mailError) {
        console.error('[applications] mailgun error', mailError);
    }

    return jsonResponse(
        {
            id: data?.id,
            created_at: data?.created_at,
            country: data?.country,
            message: 'Request received.'
        },
        201
    );
}

async function handleGet(req: Request): Promise<Response> {
    const providedPassword = req.headers.get('x-admin-pass');
    if (!providedPassword) {
        return jsonResponse({ message: 'Administrator password required.' }, 401);
    }

    if (providedPassword !== ADMIN_PASSWORD) {
        return jsonResponse({ message: 'Incorrect password.' }, 403);
    }

    const { data, error } = await supabase
        .from('applications')
        .select('id, email, company, comment, country, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[applications] select failed', error);
        return jsonResponse({ message: 'Unable to load applications.' }, 500);
    }

    return jsonResponse(data || []);
}

async function sendConfirmation(to: string, company: string) {
    if (!to || !MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
        return;
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

    const endpoint = `${MAILGUN_API_BASE_URL.replace(/\/$/, '')}/${MAILGUN_DOMAIN}/messages`;
    const params = new URLSearchParams();
    params.append('from', MAIL_FROM);
    params.append('to', to);
    params.append('subject', subject);
    params.append('text', plainText);
    params.append('html', html);

    const authHeader = `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Mailgun request failed: ${body}`);
    }
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

function detectCountry(req: Request): string | null {
    const candidates = [
        req.headers.get('cf-ipcountry'),
        req.headers.get('x-country'),
        req.headers.get('x-vercel-ip-country'),
        req.headers.get('x-geo-country')
    ];

    const value = candidates.find((val) => typeof val === 'string' && val.trim().length > 0);
    return value ? value.trim().toUpperCase() : null;
}
