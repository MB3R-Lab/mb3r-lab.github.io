(function () {
    const STORAGE_KEY = 'mb3r-lang';
    const DEFAULT_LANG = 'en';
    const FALLBACK_LANG = 'en';
    const SUPPORTED_LANGS = ['ru', 'en'];

    const normalize = (value) => (value || '').toLowerCase().split('-')[0];
    const isSupported = (lang) => SUPPORTED_LANGS.includes(lang);

    const safeGet = (key) => {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    };

    const safeSet = (key, value) => {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Ignore storage failures.
        }
    };

    const getInitialLang = () => {
        const saved = normalize(safeGet(STORAGE_KEY));
        if (isSupported(saved)) {
            return saved;
        }

        const browserLang = normalize(
            navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : '') || ''
        );

        if (isSupported(browserLang)) {
            return browserLang;
        }

        return DEFAULT_LANG;
    };

    let currentLang = getInitialLang();
    let translations = {};
    const listeners = new Set();
    let readyResolve;
    const ready = new Promise((resolve) => {
        readyResolve = resolve;
    });

    const getValue = (source, path) =>
        path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), source);

    const loadTranslations = async (lang) => {
        const response = await fetch(`assets/i18n/${lang}.json`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Unable to load translations');
        }
        return response.json();
    };

    const syncLanguageButtons = (lang) => {
        document.querySelectorAll('[data-lang-set]').forEach((button) => {
            const buttonLang = normalize(button.dataset.langSet);
            const isActive = buttonLang === lang;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    const applyTranslations = (dict) => {
        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.dataset.i18n;
            const value = getValue(dict, key);
            if (typeof value === 'string' || typeof value === 'number') {
                element.textContent = value;
            }
        });

        document.querySelectorAll('[data-i18n-html]').forEach((element) => {
            const key = element.dataset.i18nHtml;
            const value = getValue(dict, key);
            if (typeof value === 'string' || typeof value === 'number') {
                element.innerHTML = value;
            }
        });

        document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
            const mappings = (element.dataset.i18nAttr || '')
                .split(';')
                .map((entry) => entry.trim())
                .filter(Boolean);

            mappings.forEach((mapping) => {
                const parts = mapping.split(':');
                if (parts.length < 2) return;
                const attrName = parts[0].trim();
                const key = parts.slice(1).join(':').trim();
                const effectiveKey =
                    attrName === 'data-overlay-message' && element.dataset.overlayKey
                        ? element.dataset.overlayKey
                        : key;
                const value = getValue(dict, effectiveKey);
                if (value !== undefined && value !== null) {
                    element.setAttribute(attrName, value);
                }
            });
        });

        document.querySelectorAll('[data-i18n-json]').forEach((element) => {
            const key = element.dataset.i18nJson;
            const value = getValue(dict, key);
            if (value && typeof value === 'object') {
                element.textContent = JSON.stringify(value, null, 4);
            }
        });
    };

    const setLanguage = async (lang) => {
        const normalized = normalize(lang);
        const nextLang = isSupported(normalized) ? normalized : DEFAULT_LANG;
        currentLang = nextLang;
        safeSet(STORAGE_KEY, nextLang);
        document.documentElement.lang = nextLang;
        syncLanguageButtons(nextLang);

        let dict = {};
        try {
            dict = await loadTranslations(nextLang);
        } catch {
            if (nextLang !== FALLBACK_LANG) {
                try {
                    dict = await loadTranslations(FALLBACK_LANG);
                } catch {
                    dict = {};
                }
            }
        }

        translations = dict;
        applyTranslations(dict);
        listeners.forEach((listener) => {
            try {
                listener(nextLang, dict);
            } catch {
                // Ignore listener errors.
            }
        });

        return dict;
    };

    const t = (key) => {
        const value = getValue(translations, key);
        if (typeof value === 'string' || typeof value === 'number') {
            return value;
        }
        return key;
    };

    const getLocale = () => {
        const locale = getValue(translations, 'meta.locale');
        if (typeof locale === 'string') {
            return locale;
        }
        return currentLang === 'ru' ? 'ru-RU' : 'en-US';
    };

    const onChange = (listener) => {
        if (typeof listener === 'function') {
            listeners.add(listener);
        }
        return () => listeners.delete(listener);
    };

    const handleLanguageClick = (event) => {
        const explicitButton = event.target.closest('[data-lang-set]');
        if (explicitButton) {
            event.preventDefault();
            setLanguage(explicitButton.dataset.langSet);
            return;
        }

        const toggleButton = event.target.closest('[data-lang-toggle]');
        if (!toggleButton) return;
        event.preventDefault();
        const next = currentLang === 'ru' ? 'en' : 'ru';
        setLanguage(next);
    };

    const init = () => {
        setLanguage(currentLang).finally(() => {
            if (readyResolve) {
                readyResolve();
            }
        });

        document.addEventListener('click', handleLanguageClick);
    };

    window.MB3RI18n = {
        ready,
        t,
        setLanguage,
        getLanguage: () => currentLang,
        getLocale,
        onChange
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
