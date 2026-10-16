
(function () {
    'use strict';

    if (window.lampa_file_sync) return;
    window.lampa_file_sync = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var KEY = 'lampa_custom_sync_code';

    var busy = false;
    var started = false;
    var asking = false;

    function notice(msg) {
        console.log('[Sync]', msg);

        if (
            window.Lampa &&
            Lampa.Noty &&
            Lampa.Noty.show
        ) {
            Lampa.Noty.show('Sync: ' + msg);
        }
    }

    function read(key, fallback) {
        try {
            return JSON.parse(
                localStorage.getItem(key)
            ) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    }

    function itemId(item) {
        if (item && item.id != null) {
            return String(item.id);
        }

        return JSON.stringify(item);
    }

    function mergeFavorites(a, b) {
        var result = {};

        var keys = Object.keys(a || {}).concat(
            Object.keys(b || {})
        );

        keys.forEach(function (key) {
            if (result[key]) return;

            var seen = {};
            var out = [];

            var left = Array.isArray(a && a[key])
                ? a[key]
                : [];

            var right = Array.isArray(b && b[key])
                ? b[key]
                : [];

            left.concat(right).forEach(function (item) {
                if (!item || typeof item !== 'object') {
                    return;
                }

                var id = itemId(item);

                if (!seen[id]) {
                    seen[id] = true;
                    out.push(item);
                }
            });

            result[key] = out;
        });

        return result;
    }

    function mergeProgress(a, b) {
        var result = Object.assign({}, a || {});

        Object.keys(b || {}).forEach(function (key) {
            var remote = b[key];
            var local = result[key];

            if (!remote || typeof remote !== 'object') {
                return;
            }

            if (
                !local ||
                Number(remote.updated || 0) >
                Number(local.updated || 0)
            ) {
                result[key] = remote;
            }
        });

        return result;
    }

    function sync() {
        var code = localStorage.getItem(KEY);

        if (!code || busy) return;

        busy = true;

        var local = {
            favorite: read('favorite', {}),
            file_view: read('file_view', {})
        };

        fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                action: 'sync',
                data: local
            })
        })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(
                    'HTTP ' + response.status
                );
            }

            return response.json();
        })
        .then(function (answer) {
            if (!answer.ok || !answer.data) {
                throw new Error(
                    'Некорректный ответ сервера'
                );
            }

            var mergedFavorite = mergeFavorites(
                local.favorite,
                answer.data.favorite
            );

            var mergedProgress = mergeProgress(
                local.file_view,
                answer.data.file_view
            );

            write('favorite', mergedFavorite);
            write('file_view', mergedProgress);

            console.log(
                '[Sync] Синхронизация выполнена'
            );
        })
        .catch(function (error) {
            console.error('[Sync]', error);

            notice(
                'Ошибка синхронизации: ' +
                error.message
            );
        })
        .finally(function () {
            busy = false;
        });
    }

    function askCode() {
        if (asking) return;

        if (
            !window.Lampa ||
            !Lampa.Input ||
            !Lampa.Input.edit
        ) {
            notice('Ввод кода недоступен');
            return;
        }

        asking = true;

        Lampa.Input.edit({
            title: 'Код синхронизации (6 цифр)',
            value: '',
            free: true,
            nosave: true,
            nomic: true,
            layout: 'nums',
            keyboard: 'lampa'
        }, function (value) {
            asking = false;

            var code = String(value || '').trim();

            if (!/^\d{6}$/.test(code)) {
                notice(
                    'Код должен содержать 6 цифр'
                );
                return;
            }

            localStorage.setItem(KEY, code);

            notice('Профиль подключён');

            sync();
        });
    }

    function init() {
        if (
            !window.Lampa ||
            !Lampa.Noty ||
            !Lampa.Input
        ) {
            return false;
        }

        if (started) return true;

        started = true;

        // Синхронизация каждые 30 секунд
        setInterval(sync, 30000);

        var code = localStorage.getItem(KEY);

        if (code && /^\d{6}$/.test(code)) {
            notice('Профиль подключён');
            sync();
        } else {
            // Ждём загрузки интерфейса телевизора
            setTimeout(askCode, 1500);
        }

        return true;
    }

    // Ручной вызов окна ввода кода
    window.lampaFileSyncAskCode = askCode;

    // Ожидание готовности Lampa
    var attempts = 0;

    var timer = setInterval(function () {
        if (init() || ++attempts > 30) {
            clearInterval(timer);
        }
    }, 1000);

})();
