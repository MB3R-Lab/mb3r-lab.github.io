document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const body = document.body;
    const navToggle = document.querySelector('[data-nav-toggle]');
    const navPanel = document.querySelector('[data-nav-panel]');
    const navLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
    const themeToggleButton = document.querySelector('[data-theme-toggle]');
    const pilotModal = document.getElementById('pilot-modal');
    const applicationForm = document.getElementById('application-form');
    const statusField = document.getElementById('application-status');
    const submitButton = document.getElementById('application-submit');
    const storage = window.MB3RStorage;
    const getI18n = () => window.MB3RI18n;
    const t = (key) => (getI18n()?.t ? getI18n().t(key) : key);
    const whenI18nReady = () => getI18n()?.ready || Promise.resolve();
    const explicitEndpoint =
        typeof window.__MB3R_API_ENDPOINT__ === 'string'
            ? window.__MB3R_API_ENDPOINT__.trim().replace(/\/$/, '')
            : '';
    const apiBaseUrl =
        typeof window.__MB3R_API_BASE__ === 'string'
            ? window.__MB3R_API_BASE__.trim().replace(/\/$/, '')
            : '';
    const isApiConfigured = Boolean(explicitEndpoint || apiBaseUrl);
    const THEME_STORAGE_KEY = 'theme';
    const currentYear = String(new Date().getFullYear());
    let lastFocusedElement = null;

    document.querySelectorAll('[data-current-year]').forEach((element) => {
        element.textContent = currentYear;
    });

    const resolveEndpoint = (path) => {
        if (explicitEndpoint) {
            return explicitEndpoint;
        }
        if (apiBaseUrl) {
            return `${apiBaseUrl}${path}`;
        }
        return null;
    };

    const shouldFallbackToLocal = (status) =>
        !status || status >= 500 || status === 404 || status === 405 || !isApiConfigured;

    const createLocalRecord = (payload, source = 'local') => ({
        id: `${source}-${Date.now()}`,
        email: payload.email,
        company: payload.company,
        comment: payload.comment || '',
        country: null,
        created_at: new Date().toISOString(),
        source
    });

    const setStatus = (message, state) => {
        if (!statusField) return;
        statusField.textContent = message || '';
        if (state) {
            statusField.dataset.state = state;
        } else {
            statusField.removeAttribute('data-state');
        }
    };

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            htmlElement.setAttribute('data-theme', 'dark');
            return;
        }
        htmlElement.removeAttribute('data-theme');
    };

    const getCurrentTheme = () =>
        htmlElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

    const syncThemeToggleButton = () => {
        if (!themeToggleButton) return;
        const isDark = getCurrentTheme() === 'dark';
        themeToggleButton.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        themeToggleButton.setAttribute(
            'aria-label',
            isDark ? t('nav.switchToLightAria') : t('nav.switchToDarkAria')
        );
    };

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
    syncThemeToggleButton();

    themeToggleButton?.addEventListener('click', () => {
        const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        if (nextTheme === 'dark') {
            localStorage.setItem(THEME_STORAGE_KEY, 'dark');
        } else {
            localStorage.removeItem(THEME_STORAGE_KEY);
        }
        syncThemeToggleButton();
    });

    const isMenuOpen = () => navPanel?.classList.contains('is-open');
    const isPilotModalOpen = () => pilotModal?.classList.contains('is-open');

    const closeMenu = () => {
        if (!navPanel || !navToggle) return;
        navPanel.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        if (!isPilotModalOpen()) {
            body.classList.remove('no-scroll');
        }
    };

    const openMenu = () => {
        if (!navPanel || !navToggle) return;
        navPanel.classList.add('is-open');
        navToggle.setAttribute('aria-expanded', 'true');
        body.classList.add('no-scroll');
    };

    navToggle?.addEventListener('click', () => {
        if (isMenuOpen()) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href') || '';
            if (!href.startsWith('#')) return;

            const target = document.querySelector(href);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });

            if (isMenuOpen()) {
                closeMenu();
            }
        });
    });

    const openPilotModal = () => {
        if (!pilotModal) return;
        lastFocusedElement = document.activeElement;
        pilotModal.classList.add('is-open');
        pilotModal.setAttribute('aria-hidden', 'false');
        body.classList.add('no-scroll');
        setStatus('', '');
        const firstInput = pilotModal.querySelector('input, select, textarea');
        requestAnimationFrame(() => firstInput?.focus());
    };

    const closePilotModal = () => {
        if (!pilotModal) return;
        pilotModal.classList.remove('is-open');
        pilotModal.setAttribute('aria-hidden', 'true');
        if (!isMenuOpen()) {
            body.classList.remove('no-scroll');
        }
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    };

    document.querySelectorAll('[data-modal-target="pilot-modal"]').forEach((button) => {
        button.addEventListener('click', () => {
            if (isMenuOpen()) {
                closeMenu();
            }
            openPilotModal();
        });
    });

    pilotModal?.querySelectorAll('[data-modal-close]').forEach((element) => {
        element.addEventListener('click', closePilotModal);
    });

    document.addEventListener('click', (event) => {
        if (!isMenuOpen() || !navPanel || !navToggle) return;

        const clickInsidePanel = navPanel.contains(event.target);
        const clickOnToggle = navToggle.contains(event.target);

        if (!clickInsidePanel && !clickOnToggle) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isPilotModalOpen()) {
            closePilotModal();
            return;
        }

        if (event.key === 'Escape' && isMenuOpen()) {
            closeMenu();
            return;
        }

        if (event.key !== 'Tab' || !isPilotModalOpen() || !pilotModal) {
            return;
        }

        const focusable = Array.from(
            pilotModal.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );

        if (!focusable.length) {
            return;
        }

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === firstEl) {
            event.preventDefault();
            lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
            event.preventDefault();
            firstEl.focus();
        }
    });

    const persistRecord = (record) => {
        if (!record) return;
        storage?.save?.(record);
    };

    const submitRequest = async (payload) => {
        const endpoint = resolveEndpoint('/applications');

        if (!endpoint) {
            const error = new Error(t('form.errors.apiNotConfigured'));
            error.status = 0;
            throw error;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.message || t('form.errors.submitFailed'));
            error.status = response.status;
            throw error;
        }

        return {
            id: data.id ?? `request-${Date.now()}`,
            email: payload.email,
            company: payload.company,
            comment: payload.comment || '',
            country: data.country || null,
            created_at: data.created_at || new Date().toISOString(),
            source: 'api'
        };
    };

    whenI18nReady().then(() => {
        syncThemeToggleButton();
        getI18n()?.onChange?.(() => {
            syncThemeToggleButton();
        });
        if (!isApiConfigured) {
            console.warn(t('console.apiNotConfigured'));
        }
    });

    applicationForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await whenI18nReady();

        if (!submitButton) {
            return;
        }

        const formData = new FormData(applicationForm);
        const selectedContext = formData.get('context')?.toString().trim() || '';
        const rawComment = formData.get('comment')?.toString().trim() || '';
        const commentParts = [];
        if (selectedContext) {
            commentParts.push(`Context: ${selectedContext}`);
        }
        if (rawComment) {
            commentParts.push(rawComment);
        }

        const payload = {
            email: formData.get('email')?.toString().trim() || '',
            company: formData.get('company')?.toString().trim() || '',
            comment: commentParts.join('\n\n')
        };

        if (!payload.comment) {
            delete payload.comment;
        }

        submitButton.disabled = true;
        setStatus(t('form.status.sending'), '');

        try {
            const record = await submitRequest(payload);
            persistRecord(record);
            applicationForm.reset();
            setStatus(t('form.status.success'), 'success');
        } catch (error) {
            if (shouldFallbackToLocal(error.status)) {
                const localRecord = createLocalRecord(payload);
                persistRecord(localRecord);
                applicationForm.reset();
                const fallbackMessage = isApiConfigured
                    ? t('form.status.savedOffline')
                    : t('form.status.savedMissingEndpoint');
                setStatus(fallbackMessage, 'success');
            } else {
                setStatus(error.message || t('form.errors.submitFailed'), 'error');
            }
        } finally {
            submitButton.disabled = false;
        }
    });
});
