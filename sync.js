
(function () {
    'use strict';

    if (window.lampa_custom_sync_v8) return;
    window.lampa_custom_sync_v8 = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var CODE_KEY = 'lampa_custom_sync_code';

    var started = false;
    var busy = false;
    var pending = false;
    var applying = false;
    var dialogOpen = false;
    var debounceTimer = null;
    var lastNavigationSync = 0;

    var SECTIONS = [
        'like', 'wath', 'book', 'card',
        'history', 'look', 'viewed',
        'scheduled', 'continued', 'thrown'
    ];

    function log() {
        var args = ['[Lampa Sync v8]'];

        for (var i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }

        console.log.apply(console, args);
    }

    function notify(message) {
        log(message);

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('Sync: ' + message);
            }
        } catch (e) {}
    }

    function getCode() {
        try {
            return String(
                localStorage.getItem(CODE_KEY) || ''
            ).trim();
        } catch (e) {
            return '';
        }
    }

    function validCode(code) {
        return /^\d{6}$/.test(code);
    }

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return {};
        }
    }

    function getStorage(name) {
        try {
            var value = Lampa.Storage.get(name, {});

            if (value && typeof value === 'object') {
                return value;
            }
        } catch (e) {
            log('Ошибка чтения:', name, e);
        }

        return {};
    }

    function getFavorite() {
        try {
            var value = Lampa.Favorite.full();

            if (value && typeof value === 'object') {
                return value;
            }
        } catch (e) {
            log('Favorite.full:', e);
        }

        return getStorage('favorite');
    }

    function itemId(item, section) {
        if (section === 'card') {
            if (
                !item ||
                typeof item !== 'object' ||
                item.id == null
            ) {
                return null;
            }

            return String(item.id);
        }

        if (
            typeof item !== 'number' &&
            typeof item !== 'string'
        ) {
            return null;
        }

        return String(item);
    }

    function mergeFavorites(local, remote) {
        local = local || {};
        remote = remote || {};

        var result = {};
        var keys = SECTIONS.slice();

        Object.keys(local).concat(
            Object.keys(remote)
        ).forEach(function (key) {
            if (keys.indexOf(key) === -1) {
                keys.push(key);
            }
        });

        keys.forEach(function (section) {
            var left = Array.isArray(local[section])
                ? local[section]
                : [];

            var right = Array.isArray(remote[section])
                ? remote[section]
                : [];

            var merged = [];
            var seen = Object.create(null);

            left.concat(right).forEach(function (item) {
                var id = itemId(item, section);

                if (id === null) return;

                var key = 'id:' + id;

                if (seen[key]) return;

                seen[key] = true;
                merged.push(item);
            });

            result[section] = merged;
        });

        return result;
    }

    function mergeProgress(local, remote) {
        local = local && typeof local === 'object'
            ? local
            : {};

        remote = remote && typeof remote === 'object'
            ? remote
            : {};

        var result = {};

        Object.keys(local).forEach(function (key) {
            result[key] = local[key];
        });

        Object.keys(remote).forEach(function (key) {
            var incoming = remote[key];
            var current = result[key];

            if (
                !incoming ||
                typeof incoming !== 'object'
            ) {
                return;
            }

            if (
                !current ||
                typeof current !== 'object'
            ) {
                result[key] = incoming;
                return;
            }

            var a = Number(current.updated || 0);
            var b = Number(incoming.updated || 0);

            if (b > a) {
                result[key] = incoming;
                return;
            }

            if (b < a) return;

            var ap = Number(current.percent || 0);
            var bp = Number(incoming.percent || 0);
            var at = Number(current.time || 0);
            var bt = Number(incoming.time || 0);

            if (
                bp > ap ||
                (bp === ap && bt > at)
            ) {
                result[key] = incoming;
            }
        });

        return result;
    }

    /*
     * Сравниваем состав списков, а не порядок.
     * Это предотвращает лишние Favorite.read().
     */
    function favoriteCompositionChanged(a, b) {
        var keys = SECTIONS.slice();

        Object.keys(a || {}).concat(
            Object.keys(b || {})
        ).forEach(function (key) {
            if (keys.indexOf(key) === -1) {
                keys.push(key);
            }
        });

        for (var i = 0; i < keys.length; i++) {
            var section = keys[i];

            var left = Array.isArray(a[section])
                ? a[section]
                : [];

            var right = Array.isArray(b[section])
                ? b[section]
                : [];

            if (left.length !== right.length) {
                return true;
            }

            var ids = Object.create(null);

            left.forEach(function (item) {
                var id = itemId(item, section);

                if (id !== null) {
                    ids['id:' + id] = true;
                }
            });

            for (var j = 0; j < right.length; j++) {
                var id = itemId(right[j], section);

                if (id === null || !ids['id:' + id]) {
                    return true;
                }
            }
        }

        return false;
    }

    function count(favorite, section) {
        return Array.isArray(favorite[section])
            ? favorite[section].length
            : 0;
    }

    function requestSync(payload, callback) {
        var xhr = new XMLHttpRequest();
        var finished = false;

        function finish(error, data) {
            if (finished) return;

            finished = true;
            callback(error, data);
        }

        try {
            xhr.open('POST', API, true);
            xhr.timeout = 15000;

            xhr.setRequestHeader(
                'Content-Type',
                'application/json'
            );

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                if (
                    xhr.status < 200 ||
                    xhr.status >= 300
                ) {
                    finish(
                        new Error('HTTP ' + xhr.status),
                        null
                    );
                    return;
                }

                var answer;

                try {
                    answer = JSON.parse(
                        xhr.responseText
                    );
                } catch (e) {
                    finish(
                        new Error('Неверный JSON'),
                        null
                    );
                    return;
                }

                if (
                    !answer ||
                    answer.ok !== true ||
                    !answer.data ||
                    typeof answer.data !== 'object'
                ) {
                    finish(
                        new Error(
                            answer && answer.error
                                ? answer.error
                                : 'Неверный ответ сервера'
                        ),
                        null
                    );
                    return;
                }

                finish(null, answer.data);
            };

            xhr.onerror = function () {
                finish(
                    new Error('Ошибка сети'),
                    null
                );
            };

            xhr.ontimeout = function () {
                finish(
                    new Error('Тайм-аут'),
                    null
                );
            };

            xhr.send(JSON.stringify(payload));
        } catch (e) {
            finish(e, null);
        }
    }

    function syncNow(showMessage) {
        var code = getCode();

        if (!validCode(code)) {
            if (showMessage) {
                notify('Введите код из 6 цифр');
            }

            return;
        }

        if (busy) {
            pending = true;
            return;
        }

        busy = true;

        var payload = {
            code: code,
            action: 'sync',
            data: {
                favorite: clone(getFavorite()),
                file_view: clone(
                    getStorage('file_view')
                )
            }
        };

        requestSync(payload, function (error, data) {
            busy = false;

            if (error) {
                log('Ошибка:', error.message);

                if (showMessage) {
                    notify(error.message);
                }

                return;
            }

            if (getCode() !== code) {
                log('Код изменился, ответ пропущен');
                return;
            }

            if (
                !data.favorite ||
                typeof data.favorite !== 'object' ||
                Array.isArray(data.favorite) ||
                !data.file_view ||
                typeof data.file_view !== 'object' ||
                Array.isArray(data.file_view)
            ) {
                log('Неверная структура ответа');
                return;
            }

            try {
                applying = true;

                var localFavorite = clone(
                    getFavorite()
                );

                var localProgress = clone(
                    getStorage('file_view')
                );

                var mergedFavorite = mergeFavorites(
                    localFavorite,
                    data.favorite
                );

                var mergedProgress = mergeProgress(
                    localProgress,
                    data.file_view
                );

                var favoriteChanged =
                    favoriteCompositionChanged(
                        localFavorite,
                        mergedFavorite
                    );

                /*
                 * Проверяем, что объединение
                 * не потеряло локальные ID.
                 */
                var historyBefore = count(
                    localFavorite,
                    'history'
                );

                var historyAfter = count(
                    mergedFavorite,
                    'history'
                );

                if (historyAfter < historyBefore) {
                    throw new Error(
                        'Защита истории: количество уменьшилось'
                    );
                }

                if (favoriteChanged) {
                    Lampa.Storage.set(
                        'favorite',
                        mergedFavorite,
                        true
                    );

                    /*
                     * Только если реально появились
                     * новые элементы.
                     *
                     * Lampa сама обновит активность.
                     */
                    Lampa.Favorite.read();

                    log('Обновлены списки избранного');
                }

                if (
                    JSON.stringify(localProgress) !==
                    JSON.stringify(mergedProgress)
                ) {
                    Lampa.Storage.set(
                        'file_view',
                        mergedProgress,
                        true
                    );

                    log('Обновлён прогресс');
                }

                log('OK', {
                    revision: data.revision,
                    history: count(
                        mergedFavorite,
                        'history'
                    ),
                    card: count(
                        mergedFavorite,
                        'card'
                    ),
                    progress: Object.keys(
                        mergedProgress
                    ).length,
                    refreshed: favoriteChanged
                });

                if (showMessage) {
                    notify('Синхронизация выполнена');
                }
            } catch (e) {
                log('Ошибка обработки:', e);

                if (showMessage) {
                    notify('Ошибка обработки данных');
                }
            } finally {
                applying = false;
            }

            if (pending) {
                pending = false;

                setTimeout(function () {
                    syncNow(false);
                }, 1000);
            }
        });
    }

    /*
     * Объединяем несколько изменений в один запрос.
     */
    function scheduleSync(delay) {
        if (applying) return;

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            syncNow(false);
        }, delay || 2000);
    }

    /*
     * Открытие избранного / истории.
     */
    function onActivity(event) {
        if (!event || event.type !== 'start') {
            return;
        }

        if (
            event.component !== 'bookmarks' &&
            event.component !== 'favorite'
        ) {
            return;
        }

        /*
         * Защита от повторных событий
         * при быстром переключении экранов.
         */
        var now = Date.now();

        if (now - lastNavigationSync < 1500) {
            return;
        }

        lastNavigationSync = now;

        log(
            'Открыт раздел:',
            event.component,
            event.object && event.object.type
        );

        scheduleSync(300);
    }

    function onFavoriteState(event) {
        if (!event || applying) return;

        if (
            event.target === 'favorite' &&
            event.reason === 'update'
        ) {
            scheduleSync(2000);
        }
    }

    function onStorageChange(event) {
        if (!event || applying) return;

        /*
         * Изменение прогресса воспроизведения.
         * Не реагируем на все остальные
         * настройки Lampa.
         */
        if (event.name === 'file_view') {
            scheduleSync(5000);
        }
    }

    function openCodeDialog() {
        if (dialogOpen) return;

        if (
            !Lampa.Input ||
            !Lampa.Input.edit
        ) {
            notify('Клавиатура недоступна');
            return;
        }

        dialogOpen = true;

        try {
            Lampa.Input.edit({
                title: 'Код синхронизации',
                value: getCode(),
                free: true,
                nosave: true
            }, function (value) {
                dialogOpen = false;

                if (
                    value === null ||
                    typeof value === 'undefined'
                ) {
                    return;
                }

                var code = String(value).trim();

                if (!validCode(code)) {
                    notify('Нужно ровно 6 цифр');
                    return;
                }

                try {
                    localStorage.setItem(
                        CODE_KEY,
                        code
                    );
                } catch (e) {
                    notify('Ошибка сохранения кода');
                    return;
                }

                notify('Код сохранён');

                setTimeout(function () {
                    syncNow(true);
                }, 1000);
            });
        } catch (e) {
            dialogOpen = false;
            log('Ошибка клавиатуры:', e);
        }
    }

    function installSettings() {
        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_code_v8',
                type: 'button'
            },
            field: {
                name: 'Sync: изменить код'
            },
            onChange: openCodeDialog
        });

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_now_v8',
                type: 'button'
            },
            field: {
                name: 'Sync: синхронизировать сейчас'
            },
            onChange: function () {
                clearTimeout(debounceTimer);
                debounceTimer = null;
                syncNow(true);
            }
        });
    }

    function init() {
        if (started) return true;

        if (
            !window.Lampa ||
            !Lampa.Storage ||
            !Lampa.Storage.listener ||
            !Lampa.Favorite ||
            !Lampa.Favorite.full ||
            !Lampa.Favorite.read ||
            !Lampa.Listener ||
            !Lampa.SettingsApi ||
            !Lampa.SettingsApi.addParam ||
            !Lampa.Input
        ) {
            return false;
        }

        started = true;

        installSettings();

        Lampa.Listener.follow(
            'activity',
            onActivity
        );

        Lampa.Listener.follow(
            'state:changed',
            onFavoriteState
        );

        Lampa.Storage.listener.follow(
            'change',
            onStorageChange
        );

        window.lampaCustomSyncNow = function () {
            syncNow(true);
        };

        window.lampaCustomSyncCode = openCodeDialog;

        /*
         * Одна синхронизация при запуске.
         * Периодических таймеров НЕТ.
         */
        if (validCode(getCode())) {
            setTimeout(function () {
                syncNow(false);
            }, 3000);
        }

        log(
            'Запущен: синхронизация по событиям, без опроса'
        );

        return true;
    }

    var attempts = 0;

    var wait = setInterval(function () {
        attempts++;

        if (init() || attempts >= 90) {
            clearInterval(wait);
        }
    }, 1000);
})();
