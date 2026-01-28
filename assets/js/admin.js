document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const body = document.body;
    const modal = document.getElementById('admin-auth-modal');
    const authForm = document.getElementById('admin-auth-form');
    const passwordInput = document.getElementById('admin-password');
    const statusField = document.getElementById('admin-auth-status');
    const tableBody = document.getElementById('applications-body');
    const tableWrapper = document.querySelector('.table-wrapper');
    const refreshButton = document.getElementById('refresh-button');
    const ADMIN_PASS_STORAGE_KEY = 'mb3r-admin-pass';
    const storage = window.MB3RStorage;
    const getI18n = () => window.MB3RI18n;
    const t = (key) => (getI18n()?.t ? getI18n().t(key) : key);
    const whenI18nReady = () => getI18n()?.ready || Promise.resolve();
    const getLocale = () =>
        getI18n()?.getLocale
            ? getI18n().getLocale()
            : document.documentElement.lang || navigator.language || 'ru-RU';
    const explicitEndpoint =
        typeof window.__MB3R_API_ENDPOINT__ === 'string'
            ? window.__MB3R_API_ENDPOINT__.trim().replace(/\/$/, '')
            : '';
    const apiBaseUrl =
        typeof window.__MB3R_API_BASE__ === 'string'
            ? window.__MB3R_API_BASE__.trim().replace(/\/$/, '')
            : '';
    const isApiConfigured = Boolean(explicitEndpoint || apiBaseUrl);
    const isOfflineError = (status) => !status || status === 0 || !isApiConfigured;
    const resolveEndpoint = (path) => {
        if (explicitEndpoint) {
            return explicitEndpoint;
        }
        if (apiBaseUrl) {
            return `${apiBaseUrl}${path}`;
        }
        return null;
    };
    sessionStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
    let currentPassword = '';
    let hasRemoteSuccess = false;

    const lockTable = () => tableWrapper?.setAttribute('data-locked', 'true');
    const unlockTable = () => tableWrapper?.removeAttribute('data-locked');
    lockTable();

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlElement.setAttribute('data-theme', savedTheme);
    } else {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }

    const setAuthStatus = (message, state) => {
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

    const setOverlayMessage = (message, messageKey) => {
        if (!tableWrapper) return;
        tableWrapper.setAttribute('data-overlay-message', message);
        if (messageKey) {
            tableWrapper.dataset.overlayKey = messageKey;
        } else {
            delete tableWrapper.dataset.overlayKey;
        }
    };

    whenI18nReady().then(() => {
        if (tableWrapper?.getAttribute('data-locked') === 'true') {
            setOverlayMessage(t('admin.table.overlayLocked'), 'admin.table.overlayLocked');
        }
    });

    const setTableMessage = (message) => {
        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = '';
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.textContent = message;
        row.appendChild(cell);
        tableBody.appendChild(row);
    };

    const openModal = () => {
        if (!modal) return;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        body.classList.add('no-scroll');
        setAuthStatus('', '');
        requestAnimationFrame(() => passwordInput?.focus());
    };

    const closeModal = () => {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        body.classList.remove('no-scroll');
    };

    const formatDate = (value) => {
        if (!value) return t('common.placeholder');
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return value;
        }
        return parsed.toLocaleString(getLocale());
    };

    const renderTable = (rows) => {
        if (!tableBody) return;

        if (!rows.length) {
            setTableMessage(t('admin.status.noRequests'));
            return;
        }

        tableBody.innerHTML = '';

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            const fields = [
                row.id,
                row.email,
                row.company,
                row.comment || t('common.placeholder'),
                row.country || t('common.placeholder'),
                formatDate(row.created_at)
            ];

            fields.forEach((value) => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });

            tableBody.appendChild(tr);
        });
    };

    const fetchApplications = async (password) => {
        await whenI18nReady();

        if (!password) {
            const error = new Error(t('admin.errors.passwordRequired'));
            error.status = 401;
            throw error;
        }

        const endpoint = resolveEndpoint('/applications');

        if (!endpoint) {
            const configError = new Error(t('admin.errors.apiNotConfigured'));
            configError.offline = true;
            throw configError;
        }

        try {
            const response = await fetch(endpoint, {
                headers: { 'x-admin-pass': password }
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const authError = new Error(data.message || t('admin.errors.loadFailed'));
                    authError.status = response.status;
                    throw authError;
                }

                const error = new Error(data.message || t('admin.errors.loadFailed'));
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            if (!error.status || isOfflineError(error.status)) {
                const offlineError = new Error(error.message || t('admin.errors.backendUnreachable'));
                offlineError.offline = true;
                offlineError.status = error.status;
                throw offlineError;
            }
            throw error;
        }
    };

    const loadApplications = async ({ password = currentPassword, silent = false } = {}) => {
        await whenI18nReady();

        if (!password) {
            setAuthStatus(t('admin.status.enterPassword'), 'error');
            return;
        }

        if (!silent) {
            setTableMessage(t('admin.status.refreshing'));
        }

        try {
            const rows = await fetchApplications(password);
            currentPassword = password;
            sessionStorage.setItem(ADMIN_PASS_STORAGE_KEY, password);
            renderTable(rows);
            unlockTable();
            closeModal();
            hasRemoteSuccess = true;
            setOverlayMessage(t('admin.table.overlayLocked'), 'admin.table.overlayLocked');
            return;
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                sessionStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
                currentPassword = '';
                lockTable();
                setAuthStatus(error.message, 'error');
                setOverlayMessage(t('admin.status.incorrectPassword'), 'admin.status.incorrectPassword');
                openModal();
                throw error;
            }

            if (error.offline) {
                if (!hasRemoteSuccess) {
                    setAuthStatus(
                        t('admin.status.apiUnavailable'),
                        'error'
                    );
                    sessionStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
                    currentPassword = '';
                    lockTable();
                    setOverlayMessage(t('admin.status.apiUnavailableLater'), 'admin.status.apiUnavailableLater');
                    openModal();
                    throw error;
                }

                const cached = storage?.list?.() || [];
                renderTable(cached);
                unlockTable();
                closeModal();
                setAuthStatus(t('admin.status.showingCached'), 'error');
                return;
            }

            setTableMessage(error.message || t('admin.errors.loadFailed'));
            lockTable();
            setOverlayMessage(t('admin.errors.loadFailed'), 'admin.errors.loadFailed');
            throw error;
        }
    };

    authForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await whenI18nReady();
        const password = passwordInput?.value.trim();

        if (!password) {
            setAuthStatus(t('admin.status.enterPassword'), 'error');
            return;
        }

        setAuthStatus(t('admin.status.validating'), '');

        try {
            await loadApplications({ password });
            setAuthStatus(t('admin.status.accessGranted'), 'success');
        } catch {
            // Errors are surfaced inside loadApplications.
        }
    });

    refreshButton?.addEventListener('click', () => {
        if (!currentPassword) {
            openModal();
            return;
        }

        loadApplications({ silent: true }).catch(() => {});
    });

    if (!isApiConfigured) {
        whenI18nReady().then(() => {
            setTableMessage(t('admin.status.apiNotConfiguredHint'));
        });
    }

    if (currentPassword && isApiConfigured) {
        loadApplications({ silent: true }).catch(() => {});
    } else {
        openModal();
    }
});
