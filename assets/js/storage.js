(function () {
    const STORAGE_KEY = 'mb3r-pilot-requests';

    const safeRead = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (error) {
            console.warn('Unable to read cached submissions', error);
            return [];
        }
    };

    const safeWrite = (records) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (error) {
            console.warn('Unable to persist cached submissions', error);
        }
    };

    const save = (record) => {
        if (!record) {
            return null;
        }
        const current = safeRead();
        current.unshift(record);
        safeWrite(current.slice(0, 500)); // guard against unbounded storage
        return record;
    };

    const list = () => safeRead();

    window.MB3RStorage = {
        save,
        list,
        STORAGE_KEY
    };
})();
