(function () {
    const STORAGE_KEY = 'mb3r-lang';
    const DEFAULT_LANG = 'ru';
    const FALLBACK_LANG = 'en';
    const SUPPORTED_LANGS = ['ru', 'en'];

    const normalize = (value) => (value || '').toLowerCase().split('-')[0];

    const getInitialLang = () => {
        const saved = normalize(localStorage.getItem(STORAGE_KEY));
        if (SUPPORTED_LANGS.includes(saved)) {
            return saved;
        }

        const htmlLang = normalize(document.documentElement.lang);
        if (SUPPORTED_LANGS.includes(htmlLang)) {
            return htmlLang;
        }

        const navigatorLang = normalize(navigator.language || '');
        if (SUPPORTED_LANGS.includes(navigatorLang)) {
            return navigatorLang;
        }

        return DEFAULT_LANG;
    };

    let currentLang = getInitialLang();
    let translations = {};
    const listeners = new Set();
    let readyResolve = null;
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
        const nextLang = SUPPORTED_LANGS.includes(normalized) ? normalized : DEFAULT_LANG;
        currentLang = nextLang;
        localStorage.setItem(STORAGE_KEY, nextLang);
        document.documentElement.lang = nextLang;

        let dict = {};
        try {
            dict = await loadTranslations(nextLang);
        } catch (error) {
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

    const handleToggleClick = (event) => {
        const target = event.target.closest('[data-lang-toggle]');
        if (!target) return;
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
        document.addEventListener('click', handleToggleClick);
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
