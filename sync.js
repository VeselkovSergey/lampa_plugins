
(function () {
    'use strict';

    // Версия 4. Отдельный идентификатор,
    // чтобы не зависеть от старой версии.
    if (window.lampa_sync_v4) return;
    window.lampa_sync_v4 = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var KEY = 'lampa_custom_sync_code';

    var busy = false;
    var installed = false;
    var lastNotice = '';

    function notice(message) {
        console.log('[Lampa Sync]', message);

        if (window.Lampa && Lampa.Noty) {
            if (lastNotice !== message) {
                Lampa.Noty.show('Sync: ' + message);
                lastNotice = message;
            }
        }
    }

    function read(key) {
        try {
            return JSON.parse(
                localStorage.getItem(key) || '{}'
            );
        } catch (e) {
            return {};
        }
    }

    function write(key, value) {
        localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    }

    function mergeFavorites(local, remote) {
        var result = {};
        var keys = Object.keys(local || {}).concat(
            Object.keys(remote || {})
        );

        keys.forEach(function (key) {
            if (result[key]) return;

            var items = []
                .concat(local[key] || [])
                .concat(remote[key] || []);

            var seen = {};

            result[key] = items.filter(function (item) {
                if (!item || typeof item !== 'object') {
                    return false;
                }

                var id = String(
                    item.id != null
                        ? item.id
                        : JSON.stringify(item)
                );

                if (seen[id]) return false;

                seen[id] = true;
                return true;
            });
        });

        return result;
    }

    function mergeProgress(local, remote) {
        var result = Object.assign({}, local);

        Object.keys(remote || {}).forEach(function (key) {
            var a = result[key];
            var b = remote[key];

            if (!a) {
                result[key] = b;
                return;
            }

            if (
                Number(b.updated || 0) >
                Number(a.updated || 0)
            ) {
                result[key] = b;
            }
        });

        return result;
    }

    function syncNow() {
        var code = localStorage.getItem(KEY);

        if (!/^\d{6}$/.test(code || '') || busy) {
            return;
        }

        busy = true;

        var local = {
            favorite: read('favorite'),
            file_view: read('file_view')
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
                throw new Error('HTTP ' + response.status);
            }

            return response.json();
        })
        .then(function (response) {
            if (!response.ok || !response.data) {
                throw new Error('Ошибка ответа PHP');
            }

            var favorites = mergeFavorites(
                local.favorite,
                response.data.favorite || {}
            );

            var progress = mergeProgress(
                local.file_view,
                response.data.file_view || {}
            );

            write('favorite', favorites);
            write('file_view', progress);

            console.log('[Lampa Sync] OK');
        })
        .catch(function (error) {
            console.error('[Lampa Sync]', error);
            notice('Ошибка: ' + error.message);
        })
        .then(function () {
            busy = false;
        });
    }

    function askCode() {
        if (!Lampa.Input || !Lampa.Input.edit) {
            notice('Клавиатура недоступна');
            return;
        }

        Lampa.Input.edit({
            title: 'Введите код синхронизации',
            value: localStorage.getItem(KEY) || '',
            free: true,
            nosave: true,
            layout: 'nums',
            keyboard: 'lampa'
        }, function (value) {
            var code = String(value || '').trim();

            if (!/^\d{6}$/.test(code)) {
                notice('Нужно ровно 6 цифр');
                return;
            }

            localStorage.setItem(KEY, code);

            lastNotice = '';
            notice('Код сохранён');

            syncNow();
        });
    }

    function installSettings() {
        if (installed) return;

        if (
            !window.Lampa ||
            !Lampa.SettingsApi ||
            !Lampa.SettingsApi.addParam
        ) {
            return;
        }

        installed = true;

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_code_button',
                type: 'button'
            },
            field: {
                name: 'Ввести / изменить код синхронизации'
            },
            onChange: function () {
                askCode();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_now_button',
                type: 'button'
            },
            field: {
                name: 'Синхронизировать сейчас'
            },
            onChange: function () {
                if (!localStorage.getItem(KEY)) {
                    askCode();
                } else {
                    syncNow();
                    notice('Запрос отправлен');
                }
            }
        });

        console.log('[Lampa Sync] Кнопки добавлены');

        if (!/^\d{6}$/.test(localStorage.getItem(KEY) || '')) {
            notice('Откройте Настройки → Ещё → Ввести код');
        } else {
            syncNow();
        }

        setInterval(syncNow, 30000);
    }

    // Публичные функции для диагностики
    window.lampaSyncAskCode = askCode;
    window.lampaSyncNow = syncNow;

    var attempts = 0;

    var wait = setInterval(function () {
        attempts++;

        if (
            window.Lampa &&
            Lampa.SettingsApi &&
            Lampa.Input
        ) {
            clearInterval(wait);
            installSettings();
        }

        if (attempts >= 60) {
            clearInterval(wait);
            console.error(
                '[Lampa Sync] Не удалось дождаться Lampa'
            );
        }
    }, 1000);

})();
