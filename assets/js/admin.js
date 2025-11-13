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
    const resetAuthButton = document.getElementById('reset-auth-button');
    const ADMIN_PASS_STORAGE_KEY = 'mb3r-admin-pass';
    const storage = window.MB3RStorage;
    let currentPassword = sessionStorage.getItem(ADMIN_PASS_STORAGE_KEY) || '';
    const userLocale = navigator.language || 'en-US';

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

    const setTableMessage = (message) => {
        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = '';
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
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
        if (!value) return '—';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return value;
        }
        return parsed.toLocaleString(userLocale);
    };

    const renderTable = (rows) => {
        if (!tableBody) return;

        if (!rows.length) {
            setTableMessage('No requests yet.');
            return;
        }

        tableBody.innerHTML = '';

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            const fields = [
                row.id,
                row.email,
                row.company,
                row.comment || '—',
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
        if (!password) {
            const error = new Error('Password is required.');
            error.status = 401;
            throw error;
        }

        try {
            const response = await fetch('/api/applications', {
                headers: { 'x-admin-pass': password }
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (response.status >= 500) {
                    const error = new Error('Server error.');
                    error.offline = true;
                    throw error;
                }
                const error = new Error(data.message || 'Unable to load requests.');
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            if (!error.status) {
                const offlineError = new Error('Backend is unreachable.');
                offlineError.offline = true;
                throw offlineError;
            }
            throw error;
        }
    };

    const loadApplications = async ({ password = currentPassword, silent = false } = {}) => {
        if (!password) {
            setAuthStatus('Enter the password.', 'error');
            return;
        }

        if (!silent) {
            setTableMessage('Refreshing request list...');
        }

        try {
            const rows = await fetchApplications(password);
            currentPassword = password;
            sessionStorage.setItem(ADMIN_PASS_STORAGE_KEY, password);
            renderTable(rows);
            unlockTable();
            closeModal();
            return;
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                sessionStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
                currentPassword = '';
                lockTable();
                setAuthStatus(error.message, 'error');
                openModal();
                throw error;
            }

            if (error.offline) {
                const cached = storage?.list?.() || [];
                currentPassword = password;
                sessionStorage.setItem(ADMIN_PASS_STORAGE_KEY, password);
                renderTable(cached);
                unlockTable();
                closeModal();
                setAuthStatus('API unavailable. Showing cached requests.', 'error');
                return;
            }

            setTableMessage(error.message || 'Unable to load requests.');
            lockTable();
            throw error;
        }
    };

    authForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = passwordInput?.value.trim();

        if (!password) {
            setAuthStatus('Enter the password.', 'error');
            return;
        }

        setAuthStatus('Validating...', '');

        try {
            await loadApplications({ password });
            setAuthStatus('Access granted.', 'success');
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

    resetAuthButton?.addEventListener('click', () => {
        sessionStorage.removeItem(ADMIN_PASS_STORAGE_KEY);
        currentPassword = '';
        passwordInput.value = '';
        lockTable();
        openModal();
    });

    if (currentPassword) {
        loadApplications({ silent: true }).catch(() => {});
    } else {
        openModal();
    }
});
