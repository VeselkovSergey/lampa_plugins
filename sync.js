
(function () {
    'use strict';

    // Новая версия. Старый плагин нужно заменить по тому же URL.
    if (window.lampa_custom_sync_v5) return;
    window.lampa_custom_sync_v5 = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var KEY = 'lampa_custom_sync_code';
    var busy = false;
    var started = false;

    var SECTIONS = [
        'like', 'wath', 'book', 'history',
        'look', 'viewed', 'scheduled',
        'continued', 'thrown'
    ];

    function log() {
        console.log.apply(console, ['[Lampa Sync v5]'].concat(
            Array.prototype.slice.call(arguments)
        ));
    }

    function notice(message) {
        log(message);

        if (Lampa.Noty && Lampa.Noty.show) {
            Lampa.Noty.show('Sync: ' + message);
        }
    }

    function storageGet(name) {
        try {
            return Lampa.Storage.get(name, {});
        } catch (e) {
            log('Ошибка чтения', name, e);
            return {};
        }
    }

    function storageSet(name, value) {
        Lampa.Storage.set(name, value);
    }

    function getFavorite() {
        try {
            return Lampa.Favorite.full();
        } catch (e) {
            return storageGet('favorite');
        }
    }

    function idOf(item, section) {
        if (section === 'card') {
            if (!item || typeof item !== 'object' ||
                item.id == null) return null;

            return String(item.id);
        }

        if (typeof item !== 'number' &&
            typeof item !== 'string') return null;

        return String(item);
    }

    function mergeFavorites(a, b) {
        a = a || {};
        b = b || {};

        var result = {};
        var keys = Object.keys(a).concat(Object.keys(b));

        SECTIONS.concat(['card']).forEach(function (key) {
            if (keys.indexOf(key) === -1) keys.push(key);
        });

        keys.forEach(function (key) {
            var left = Array.isArray(a[key]) ? a[key] : [];
            var right = Array.isArray(b[key]) ? b[key] : [];

            var seen = {};
            var merged = [];

            left.concat(right).forEach(function (item) {
                var id = idOf(item, key);

                if (id === null || seen[id]) return;

                seen[id] = true;
                merged.push(item);
            });

            result[key] = merged;
        });

        return result;
    }

    function mergeProgress(a, b) {
        a = a && typeof a === 'object' ? a : {};
        b = b && typeof b === 'object' ? b : {};

        var result = Object.assign({}, a);

        Object.keys(b).forEach(function (key) {
            var remote = b[key];
            var local = result[key];

            if (!remote || typeof remote !== 'object') return;

            if (!local) {
                result[key] = remote;
                return;
            }

            var remoteUpdated = Number(remote.updated || 0);
            var localUpdated = Number(local.updated || 0);

            if (remoteUpdated > localUpdated) {
                result[key] = remote;
            }
        });

        return result;
    }

    function counts(f) {
        var result = {};

        SECTIONS.concat(['card']).forEach(function (key) {
            result[key] = Array.isArray(f[key])
                ? f[key].length
                : 0;
        });

        return result;
    }

    function syncNow() {
        var code = localStorage.getItem(KEY);

        if (!/^\d{6}$/.test(code || '') || busy) return;

        busy = true;

        // Снимок данных перед запросом.
        var outgoing = {
            favorite: getFavorite(),
            file_view: storageGet('file_view')
        };

        fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                action: 'sync',
                data: outgoing
            })
        })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            return response.json();
        })
        .then(function (answer) {
            if (!answer.ok || !answer.data) {
                throw new Error('Некорректный ответ сервера');
            }

            // ВАЖНО: перечитываем локальные данные ПОСЛЕ
            // ответа сервера, чтобы не потерять изменения,
            // сделанные во время сетевого запроса.
            var currentFavorite = getFavorite();
            var currentProgress = storageGet('file_view');

            var favorite = mergeFavorites(
                currentFavorite,
                answer.data.favorite
            );

            var progress = mergeProgress(
                currentProgress,
                answer.data.file_view
            );

            // Запись через штатный Storage Lampa.
            storageSet('favorite', favorite);
            storageSet('file_view', progress);

            // Обновляем внутреннее состояние Favorite.
            Lampa.Favorite.read();

            log('Синхронизация OK', {
                revision: answer.data.revision,
                favorite: counts(favorite),
                progress: Object.keys(progress).length
            });
        })
        .catch(function (error) {
            console.error('[Lampa Sync v5]', error);
            notice('Ошибка: ' + error.message);
        })
        .finally(function () {
            busy = false;
        });
    }

    function askCode() {
        Lampa.Input.edit({
            title: 'Код синхронизации (6 цифр)',
            value: localStorage.getItem(KEY) || '',
            free: true,
            nosave: true,
            nomic: true,
            layout: 'nums',
            keyboard: 'lampa'
        }, function (value) {
            var code = String(value || '').trim();

            if (!/^\d{6}$/.test(code)) {
                notice('Нужно ровно 6 цифр');
                return;
            }

            localStorage.setItem(KEY, code);
            notice('Код сохранён');
            syncNow();
        });
    }

    function installSettings() {
        if (!Lampa.SettingsApi ||
            !Lampa.SettingsApi.addParam) return;

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_custom_sync_code_v5',
                type: 'button'
            },
            field: {
                name: 'Ввести / изменить код синхронизации'
            },
            onChange: askCode
        });

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_custom_sync_now_v5',
                type: 'button'
            },
            field: {
                name: 'Синхронизировать сейчас'
            },
            onChange: function () {
                notice('Синхронизация запущена');
                syncNow();
            }
        });
    }

    function init() {
        if (started) return true;

        if (!window.Lampa ||
            !Lampa.Storage ||
            !Lampa.Favorite ||
            !Lampa.Favorite.full ||
            !Lampa.Favorite.read ||
            !Lampa.Input) {
            return false;
        }

        started = true;

        installSettings();

        window.lampaCustomSyncNow = syncNow;
        window.lampaCustomSyncCode = askCode;

        setInterval(syncNow, 30000);

        if (localStorage.getItem(KEY)) {
            syncNow();
        } else {
            setTimeout(askCode, 1500);
        }

        log('Плагин запущен');
        return true;
    }

    var attempts = 0;

    var timer = setInterval(function () {
        attempts++;

        if (init() || attempts >= 60) {
            clearInterval(timer);
        }
    }, 1000);
})();
