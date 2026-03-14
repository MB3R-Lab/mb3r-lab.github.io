import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'MB3R Lab <noreply@mb3r-lab.org>';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAIL_NOTIFY_TO = Deno.env.get('MAIL_NOTIFY_TO') ?? '';
const MAILGUN_API_BASE_URL =
    Deno.env.get('MAILGUN_API_BASE_URL') ?? 'https://api.mailgun.net/v3';
const DEFAULT_ALLOWED_ORIGINS = [
    'https://mb3r-lab.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];
const ALLOWED_ORIGINS = (
    Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS.join(',')
)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);
const parsePositiveIntEnv = (name: string, fallback: number) => {
    const rawValue = Deno.env.get(name);
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};
const ADMIN_MAX_FAILED_ATTEMPTS = parsePositiveIntEnv('ADMIN_MAX_FAILED_ATTEMPTS', 8);
const ADMIN_ATTEMPT_WINDOW_MS = parsePositiveIntEnv('ADMIN_ATTEMPT_WINDOW_MS', 10 * 60 * 1000);
const ADMIN_BLOCK_MS = parsePositiveIntEnv('ADMIN_BLOCK_MS', 10 * 60 * 1000);
const ADMIN_BASE_DELAY_MS = parsePositiveIntEnv('ADMIN_BASE_DELAY_MS', 400);
const ADMIN_MAX_DELAY_MS = parsePositiveIntEnv('ADMIN_MAX_DELAY_MS', 5000);
type AuthFailureState = {
    failures: number;
    windowStartedAt: number;
    lastFailureAt: number;
    blockedUntil: number;
};
const authFailuresByClient = new Map<string, AuthFailureState>();

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

const getRequestOrigin = (req: Request) => (req.headers.get('origin') ?? '').trim();
const isAllowedOrigin = (origin: string) => Boolean(origin) && ALLOWED_ORIGINS_SET.has(origin);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getClientIp = (req: Request) => {
    const xff = req.headers.get('x-forwarded-for');
    const firstXff = xff
        ?.split(',')
        .map((part) => part.trim())
        .find(Boolean);
    return (
        req.headers.get('cf-connecting-ip') ??
        firstXff ??
        req.headers.get('x-real-ip') ??
        req.headers.get('x-client-ip') ??
        'unknown'
    ).trim();
};
const getAuthClientKey = (req: Request) => {
    const origin = getRequestOrigin(req) || 'no-origin';
    return `${getClientIp(req)}|${origin}`;
};
const pruneAuthFailureMap = (now: number) => {
    for (const [key, state] of authFailuresByClient.entries()) {
        const isStale = state.blockedUntil <= now && now - state.lastFailureAt > ADMIN_ATTEMPT_WINDOW_MS;
        if (isStale) {
            authFailuresByClient.delete(key);
        }
    }
};
const getAuthFailureState = (key: string, now: number) => {
    const state = authFailuresByClient.get(key);
    if (!state) {
        return null;
    }

    if (now - state.windowStartedAt > ADMIN_ATTEMPT_WINDOW_MS && state.blockedUntil <= now) {
        authFailuresByClient.delete(key);
        return null;
    }

    return state;
};
const getFailureDelayMs = (failures: number) =>
    Math.min(ADMIN_MAX_DELAY_MS, ADMIN_BASE_DELAY_MS * 2 ** Math.max(0, failures - 1));
const getRetryAfterSeconds = (remainingMs: number) => String(Math.max(1, Math.ceil(remainingMs / 1000)));
const rateLimitResponse = (req: Request, remainingMs: number) =>
    jsonResponse(
        req,
        { message: 'Too many failed attempts. Try again later.' },
        429,
        { 'Retry-After': getRetryAfterSeconds(remainingMs) }
    );
const registerAuthFailure = (key: string, now: number) => {
    let state = getAuthFailureState(key, now);
    if (!state) {
        state = {
            failures: 0,
            windowStartedAt: now,
            lastFailureAt: now,
            blockedUntil: 0
        };
        authFailuresByClient.set(key, state);
    }

    if (now - state.windowStartedAt > ADMIN_ATTEMPT_WINDOW_MS) {
        state.failures = 0;
        state.windowStartedAt = now;
    }

    state.failures += 1;
    state.lastFailureAt = now;

    if (state.failures >= ADMIN_MAX_FAILED_ATTEMPTS) {
        state.blockedUntil = Math.max(state.blockedUntil, now + ADMIN_BLOCK_MS);
    }

    return {
        delayMs: getFailureDelayMs(state.failures),
        blockedMs: Math.max(0, state.blockedUntil - now)
    };
};
const clearAuthFailure = (key: string) => {
    authFailuresByClient.delete(key);
};
const getCorsHeaders = (req: Request) => {
    const origin = getRequestOrigin(req);
    const fallbackOrigin = ALLOWED_ORIGINS[0] ?? '*';
    return {
        'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : fallbackOrigin,
        'Access-Control-Allow-Headers': 'content-type, x-admin-pass',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        Vary: 'Origin'
    };
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        const origin = getRequestOrigin(req);
        if (origin && !isAllowedOrigin(origin)) {
            return jsonResponse(req, { message: 'Origin is not allowed.' }, 403);
        }
        return new Response('ok', { headers: getCorsHeaders(req) });
    }

    try {
        if (req.method === 'POST') {
            return await handlePost(req);
        }

        if (req.method === 'GET') {
            return await handleGet(req);
        }

        if (req.method === 'DELETE') {
            return await handleDelete(req);
        }

        return new Response('Method Not Allowed', {
            status: 405,
            headers: getCorsHeaders(req)
        });
    } catch (error) {
        console.error('[applications] unhandled error', error);
        return jsonResponse(req, { message: 'Internal server error.' }, 500);
    }
});

async function handlePost(req: Request): Promise<Response> {
    const payload = await req.json().catch(() => ({}));
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const company = typeof payload.company === 'string' ? payload.company.trim() : '';
    const comment = typeof payload.comment === 'string' ? payload.comment.trim() : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse(req, { message: 'Please provide a valid email address.' }, 400);
    }

    if (!company) {
        return jsonResponse(req, { message: 'Company is required.' }, 400);
    }

    const country = detectCountry(req) ?? null;

    const { data, error } = await supabase
        .from('applications')
        .insert({ email, company, comment, country })
        .select('id, created_at, country')
        .single();

    if (error) {
        console.error('[applications] insert failed', error);
        return jsonResponse(req, { message: 'Unable to save your request.' }, 500);
    }

    let ownerNotificationStatus: 'sent' | 'skipped' | 'failed' = 'skipped';
    try {
        ownerNotificationStatus = await sendOwnerNotification({
            id: data?.id,
            createdAt: data?.created_at,
            applicantEmail: email,
            company,
            comment,
            country,
            clientIp: getClientIp(req)
        });
    } catch (mailError) {
        ownerNotificationStatus = 'failed';
        console.error('[applications] mailgun notify error', mailError);
    }

    return jsonResponse(
        req,
        {
            id: data?.id,
            created_at: data?.created_at,
            country: data?.country,
            message: 'Request received.',
            owner_notification_status: ownerNotificationStatus
        },
        201
    );
}

async function handleGet(req: Request): Promise<Response> {
    const authError = await requireAdminAccess(req);
    if (authError) {
        return authError;
    }

    const { data, error } = await supabase
        .from('applications')
        .select('id, email, company, comment, country, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[applications] select failed', error);
        return jsonResponse(req, { message: 'Unable to load applications.' }, 500);
    }

    return jsonResponse(req, data || []);
}

async function handleDelete(req: Request): Promise<Response> {
    const authError = await requireAdminAccess(req);
    if (authError) {
        return authError;
    }

    const payload = await req.json().catch(() => ({}));
    const id = parseApplicationId(payload?.id);
    if (!id) {
        return jsonResponse(req, { message: 'Valid request ID is required.' }, 400);
    }

    const { data, error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[applications] delete failed', error);
        return jsonResponse(req, { message: 'Unable to delete request.' }, 500);
    }

    if (!data) {
        return jsonResponse(req, { message: 'Request not found.' }, 404);
    }

    return jsonResponse(req, { id: data.id, message: 'Request deleted.' });
}

async function requireAdminAccess(req: Request): Promise<Response | null> {
    const origin = getRequestOrigin(req);
    if (!isAllowedOrigin(origin)) {
        return jsonResponse(req, { message: 'Origin is not allowed.' }, 403);
    }

    const now = Date.now();
    pruneAuthFailureMap(now);
    const authKey = getAuthClientKey(req);
    const existingState = getAuthFailureState(authKey, now);
    const activeBlockMs = existingState ? Math.max(0, existingState.blockedUntil - now) : 0;
    if (activeBlockMs > 0) {
        return rateLimitResponse(req, activeBlockMs);
    }

    const providedPassword = req.headers.get('x-admin-pass');
    if (!providedPassword) {
        return jsonResponse(req, { message: 'Administrator password required.' }, 401);
    }

    if (providedPassword !== ADMIN_PASSWORD) {
        const failure = registerAuthFailure(authKey, now);
        if (failure.delayMs > 0) {
            await sleep(failure.delayMs);
        }
        if (failure.blockedMs > 0) {
            return rateLimitResponse(req, failure.blockedMs);
        }
        return jsonResponse(req, { message: 'Incorrect password.' }, 403);
    }

    clearAuthFailure(authKey);
    return null;
}

function parseApplicationId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
}

type OwnerNotificationPayload = {
    id: number | null | undefined;
    createdAt: string | null | undefined;
    applicantEmail: string;
    company: string;
    comment: string | null;
    country: string | null;
    clientIp: string;
};

async function sendOwnerNotification(payload: OwnerNotificationPayload): Promise<'sent' | 'skipped'> {
    if (!MAIL_NOTIFY_TO || !MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
        return 'skipped';
    }

    const subject = 'MB3R Lab — new pilot request';
    const plainText = [
        'New pilot request received:',
        '',
        `ID: ${payload.id ?? '—'}`,
        `Created at: ${payload.createdAt ?? '—'}`,
        `Email: ${payload.applicantEmail || '—'}`,
        `Company: ${payload.company || '—'}`,
        `Comment: ${payload.comment || '—'}`,
        `Country: ${payload.country || '—'}`,
        `Client IP: ${payload.clientIp || '—'}`,
        '',
        'Open admin page to review full details.'
    ].join('\n');

    const endpoint = `${MAILGUN_API_BASE_URL.replace(/\/$/, '')}/${MAILGUN_DOMAIN}/messages`;
    const params = new URLSearchParams();
    params.append('from', MAIL_FROM);
    params.append('to', MAIL_NOTIFY_TO);
    params.append('subject', subject);
    params.append('text', plainText);

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

    return 'sent';
}

function jsonResponse(
    req: Request,
    body: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...getCorsHeaders(req),
            ...extraHeaders,
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
