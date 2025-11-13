document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const body = document.body;
    const themeToggleButton = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme');
    const storage = window.MB3RStorage;

    const createLocalRecord = (payload, source = 'local') => ({
        id: `${source}-${Date.now()}`,
        email: payload.email,
        company: payload.company,
        comment: payload.comment || '',
        created_at: new Date().toISOString(),
        source
    });

    const shouldFallbackToLocal = (status) =>
        !status || status >= 500 || status === 404 || status === 405;

    if (currentTheme) {
        htmlElement.setAttribute('data-theme', currentTheme);
    } else {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }

    themeToggleButton?.addEventListener('click', () => {
        let theme = htmlElement.getAttribute('data-theme');
        if (theme === 'dark') {
            htmlElement.removeAttribute('data-theme');
            localStorage.removeItem('theme');
        } else {
            htmlElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            targetElement?.scrollIntoView({ behavior: 'smooth' });
        });
    });

    const modal = document.getElementById('pilot-modal');
    const applicationForm = document.getElementById('application-form');
    const statusField = document.getElementById('application-status');
    const submitButton = document.getElementById('application-submit');
    let lastFocusedElement = null;

    if (modal) {
        const openButtons = document.querySelectorAll('[data-modal-target="pilot-modal"]');
        const closeElements = modal.querySelectorAll('[data-modal-close]');
        const overlay = modal.querySelector('.modal-overlay');
        const focusableSelectors = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'textarea:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        const getFocusableElements = () =>
            Array.from(modal.querySelectorAll(focusableSelectors));

        const handleKeydown = (event) => {
            if (!modal.classList.contains('is-open')) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }

            if (event.key === 'Tab') {
                const focusable = getFocusableElements();
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
            }
        };

        const openModal = () => {
            lastFocusedElement = document.activeElement;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            body.classList.add('no-scroll');
            document.addEventListener('keydown', handleKeydown);
            const firstInput = modal.querySelector('input, textarea, button');
            firstInput?.focus();
        };

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            body.classList.remove('no-scroll');
            document.removeEventListener('keydown', handleKeydown);
            if (lastFocusedElement) {
                lastFocusedElement.focus();
            }
        };

        openButtons.forEach(button => button.addEventListener('click', openModal));
        closeElements.forEach(element => element.addEventListener('click', closeModal));
        overlay?.addEventListener('click', closeModal);
    }

    const setStatus = (message, state) => {
        if (!statusField) {
            return;
        }

        statusField.textContent = message || '';

        if (state) {
            statusField.dataset.state = state;
        } else {
            statusField.removeAttribute('data-state');
        }
    };

    const persistRecord = (record) => {
        if (!record) return;
        storage?.save(record);
    };

    const submitRequest = async (payload) => {
        const response = await fetch('/api/applications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.message || 'Unable to submit the request.');
            error.status = response.status;
            throw error;
        }

        return {
            id: data.id ?? `request-${Date.now()}`,
            email: payload.email,
            company: payload.company,
            comment: payload.comment || '',
            created_at: data.created_at || new Date().toISOString(),
            source: 'api'
        };
    };

    applicationForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!submitButton) {
            return;
        }

        const formData = new FormData(applicationForm);
        const payload = {
            email: formData.get('email')?.toString().trim() || '',
            company: formData.get('company')?.toString().trim() || '',
            comment: formData.get('comment')?.toString().trim() || ''
        };

        if (!payload.comment) {
            delete payload.comment;
        }

        submitButton.disabled = true;
        setStatus('Sending your request...', '');

        try {
            const record = await submitRequest(payload);
            persistRecord(record);
            applicationForm.reset();
            setStatus('All set! We just confirmed via email.', 'success');
        } catch (error) {
            if (shouldFallbackToLocal(error.status)) {
                const localRecord = createLocalRecord(payload);
                persistRecord(localRecord);
                applicationForm.reset();
                setStatus('No backend connection. Saved locally for now.', 'success');
            } else {
                setStatus(error.message || 'Unable to submit the request.', 'error');
            }
        } finally {
            submitButton.disabled = false;
        }
    });
});
