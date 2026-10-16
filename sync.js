
(function () {
    'use strict';

    if (window.lampa_custom_sync_v9) return;
    window.lampa_custom_sync_v9 = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var CODE_KEY = 'lampa_custom_sync_code';

    var SECTIONS = [
        'like',
        'wath',
        'book',
        'history',
        'look',
        'viewed',
        'scheduled',
        'continued',
        'thrown'
    ];

    var started = false;
    var busy = false;
    var queued = false;
    var applying = false;
    var debounce = null;
    var lastNavigation = 0;

    function log(message) {
        console.log('[Sync v9] ' + message);
    }

    function notice(message) {
        log(message);

        if (
            window.Lampa &&
            Lampa.Noty &&
            Lampa.Noty.show
        ) {
            Lampa.Noty.show('Sync: ' + message);
        }
    }

    function codeNow() {
        return String(
            localStorage.getItem(CODE_KEY) || ''
        ).trim();
    }

    function validCode(code) {
        return /^\d{6}$/.test(code);
    }

    function clone(data) {
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (e) {
            return {};
        }
    }

    function readStorage(name) {
        try {
            var x = Lampa.Storage.get(name, {});

            if (
                x &&
                typeof x === 'object' &&
                !Array.isArray(x)
            ) {
                return x;
            }
        } catch (e) {}

        return {};
    }

    function readFavorite() {
        try {
            var x = Lampa.Favorite.full();

            if (
                x &&
                typeof x === 'object'
            ) {
                return x;
            }
        } catch (e) {}

        return readStorage('favorite');
    }

    /*
     * Очередь операций хранится локально.
     * Если интернет пропал, добавления
     * и удаления отправятся позже.
     */
    function opKey(code) {
        return 'lampa_sync_v9_pending_' + code;
    }

    function readPending(code) {
        try {
            var x = JSON.parse(
                localStorage.getItem(opKey(code)) || '[]'
            );

            return Array.isArray(x) ? x : [];
        } catch (e) {
            return [];
        }
    }

    function savePending(code, ops) {
        try {
            localStorage.setItem(
                opKey(code),
                JSON.stringify(ops)
            );
        } catch (e) {
            log(
                'Не удалось сохранить очередь изменений: ' +
                e.message
            );
        }
    }

    function idOf(item, section) {
        if (
            item &&
            typeof item === 'object'
        ) {
            item = item.id;
        }

        if (
            (
                typeof item !== 'number' &&
                typeof item !== 'string'
            ) ||
            !/^\d{1,20}$/.test(String(item))
        ) {
            return null;
        }

        return String(item);
    }

    function sectionAllowed(section) {
        return SECTIONS.indexOf(section) !== -1;
    }

    /*
     * Запись явной операции добавления/удаления.
     */
    function queueOperation(verb, section, id) {
        var code = codeNow();

        if (
            !validCode(code) ||
            !sectionAllowed(section) ||
            id === null
        ) {
            return;
        }

        var ops = readPending(code);

        ops.push({
            event_id:
                'v9_' +
                Date.now() +
                '_' +
                Math.random().toString(36).slice(2) +
                '_' +
                Math.random().toString(36).slice(2),

            op: verb,
            section: section,
            id: id
        });

        savePending(code, ops);
    }

    /*
     * Индекс удалений, полученных с сервера.
     */
    function removedIndex(list) {
        var index = {};

        (
            Array.isArray(list) ? list : []
        ).forEach(function (entry) {
            if (
                !entry ||
                !sectionAllowed(entry.section)
            ) {
                return;
            }

            var id = idOf(
                entry.id,
                entry.section
            );

            if (id !== null) {
                index[
                    entry.section + ':' + id
                ] = true;
            }
        });

        return index;
    }

    /*
     * Объединяем избранное.
     * Удалённые элементы исключаем.
     */
    function mergeFavorite(local, remote, removed) {
        var result = {};

        SECTIONS.concat(['card']).forEach(
            function (section) {
                var seen = {};
                var out = [];

                var a = Array.isArray(local[section])
                    ? local[section]
                    : [];

                var b = Array.isArray(remote[section])
                    ? remote[section]
                    : [];

                a.concat(b).forEach(function (item) {
                    var id = idOf(item, section);

                    if (
                        id === null ||
                        seen[id]
                    ) {
                        return;
                    }

                    if (
                        section === 'card' &&
                        (
                            !item ||
                            typeof item !== 'object'
                        )
                    ) {
                        return;
                    }

                    if (
                        removed[
                            section + ':' + id
                        ]
                    ) {
                        return;
                    }

                    seen[id] = true;
                    out.push(item);
                });

                result[section] = out;
            }
        );

        return result;
    }

    function progressIsNewer(old, candidate) {
        if (
            !candidate ||
            typeof candidate !== 'object'
        ) {
            return false;
        }

        if (
            !old ||
            typeof old !== 'object'
        ) {
            return true;
        }

        var a = Number(candidate.updated || 0);
        var b = Number(old.updated || 0);

        if (a !== b) {
            return a > b;
        }

        var p = Number(candidate.percent || 0);
        var q = Number(old.percent || 0);

        if (p !== q) {
            return p > q;
        }

        return Number(candidate.time || 0) >
            Number(old.time || 0);
    }

    function mergeProgress(local, remote) {
        var result = clone(local);

        Object.keys(remote || {}).forEach(
            function (key) {
                if (
                    progressIsNewer(
                        result[key],
                        remote[key]
                    )
                ) {
                    result[key] = remote[key];
                }
            }
        );

        return result;
    }

    /*
     * Учитываем операции, которые появились
     * во время запроса к серверу.
     */
    function applyUnsent(favorite, local, ops) {
        ops.forEach(function (op) {
            if (
                !op ||
                !sectionAllowed(op.section)
            ) {
                return;
            }

            var section = op.section;
            var id = idOf(op.id, section);

            if (id === null) {
                return;
            }

            favorite[section] = favorite[section]
                .filter(function (item) {
                    return idOf(item, section) !== id;
                });

            if (op.op === 'add') {
                var source = Array.isArray(local[section])
                    ? local[section]
                    : [];

                var original = source.filter(
                    function (item) {
                        return idOf(item, section) === id;
                    }
                )[0];

                if (typeof original !== 'undefined') {
                    favorite[section].unshift(original);
                }
            }
        });

        return favorite;
    }

    /*
     * Обычный XMLHttpRequest.
     * Никакой глобальной подмены XHR.
     */
    function send(payload, callback) {
        var xhr;

        try {
            xhr = new XMLHttpRequest();

            xhr.open('POST', API, true);
            xhr.timeout = 15000;

            xhr.setRequestHeader(
                'Content-Type',
                'application/json'
            );

            var finished = false;

            function done(error, data) {
                if (finished) return;

                finished = true;
                callback(error, data);
            }

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) {
                    return;
                }

                if (
                    xhr.status < 200 ||
                    xhr.status >= 300
                ) {
                    return done(
                        new Error('HTTP ' + xhr.status)
                    );
                }

                var response;

                try {
                    response = JSON.parse(
                        xhr.responseText
                    );
                } catch (e) {
                    return done(
                        new Error('Ответ не JSON')
                    );
                }

                if (
                    !response ||
                    response.ok !== true ||
                    !response.data ||
                    response.data.protocol !== 9
                ) {
                    return done(
                        new Error(
                            'Сервер sync.php не обновлён до v9'
                        )
                    );
                }

                done(null, response.data);
            };

            xhr.onerror = function () {
                done(new Error('Ошибка сети'));
            };

            xhr.ontimeout = function () {
                done(new Error('Тайм-аут'));
            };

            xhr.send(JSON.stringify(payload));

        } catch (e) {
            callback(e);
        }
    }

    /*
     * Основная синхронизация.
     */
    function syncNow(showMessage) {
        var code = codeNow();

        if (!validCode(code)) {
            return;
        }

        if (busy) {
            queued = true;
            return;
        }

        busy = true;

        var ops = readPending(code).slice(0, 400);

        send({
            code: code,
            action: 'sync',

            data: {
                favorite: clone(readFavorite()),
                file_view: clone(
                    readStorage('file_view')
                )
            },

            ops: ops

        }, function (error, data) {
            busy = false;

            if (error) {
                log(
                    'Ошибка синхронизации: ' +
                    error.message
                );

                if (showMessage) {
                    notice(
                        'Ошибка: ' + error.message
                    );
                }

            } else if (code === codeNow()) {
                try {
                    if (
                        !data.favorite ||
                        !data.file_view ||
                        !Array.isArray(data.removed)
                    ) {
                        throw new Error(
                            'Неполные данные сервера'
                        );
                    }

                    applying = true;

                    /*
                     * Убираем подтверждённые
                     * сервером операции из очереди.
                     */
                    var ack = {};

                    ops.forEach(function (op) {
                        ack[op.event_id] = true;
                    });

                    var remaining = readPending(code)
                        .filter(function (op) {
                            return !ack[op.event_id];
                        });

                    savePending(code, remaining);

                    var local = clone(
                        readFavorite()
                    );

                    var localProgress = clone(
                        readStorage('file_view')
                    );

                    var merged = mergeFavorite(
                        local,
                        data.favorite,
                        removedIndex(data.removed)
                    );

                    applyUnsent(
                        merged,
                        local,
                        remaining
                    );

                    var progress = mergeProgress(
                        localProgress,
                        data.file_view
                    );

                    /*
                     * Обновляем избранное только
                     * при фактическом изменении.
                     */
                    if (
                        JSON.stringify(local) !==
                        JSON.stringify(merged)
                    ) {
                        Lampa.Storage.set(
                            'favorite',
                            merged,
                            true
                        );

                        Lampa.Favorite.read();
                    }

                    /*
                     * Синхронизация таймкодов.
                     */
                    if (
                        JSON.stringify(localProgress) !==
                        JSON.stringify(progress)
                    ) {
                        Lampa.Storage.set(
                            'file_view',
                            progress,
                            true
                        );

                        if (
                            Lampa.Timeline &&
                            typeof Lampa.Timeline.read ===
                                'function'
                        ) {
                            Lampa.Timeline.read(true);
                        }
                    }

                    log(
                        'OK; ревизия ' +
                        data.revision +
                        ', ожидает отправки: ' +
                        remaining.length
                    );

                    if (showMessage) {
                        notice(
                            'Синхронизация завершена'
                        );
                    }

                    if (remaining.length) {
                        queued = true;
                    }

                } catch (e) {
                    log(
                        'Не удалось применить ответ: ' +
                        e.message
                    );

                    if (showMessage) {
                        notice(
                            'Ошибка применения: ' +
                            e.message
                        );
                    }

                } finally {
                    applying = false;
                }
            }

            if (queued) {
                queued = false;

                setTimeout(function () {
                    syncNow(false);
                }, 1000);
            }
        });
    }

    function scheduleSync(ms) {
        if (applying) {
            return;
        }

        clearTimeout(debounce);

        debounce = setTimeout(function () {
            debounce = null;
            syncNow(false);
        }, ms || 2000);
    }

    /*
     * Добавление и удаление избранного
     * через штатные события Lampa.
     */
    function onFavorite(event) {
        if (
            !event ||
            applying ||
            event.target !== 'favorite' ||
            event.reason !== 'update'
        ) {
            return;
        }

        if (
            (
                event.method === 'add' ||
                event.method === 'remove'
            ) &&
            sectionAllowed(event.type)
        ) {
            var id = idOf(
                event.card,
                event.type
            );

            if (id !== null) {
                queueOperation(
                    event.method,
                    event.type,
                    id
                );
            }
        }

        scheduleSync(2000);
    }

    /*
     * Синхронизация изменения прогресса.
     */
    function onStorage(event) {
        if (
            !applying &&
            event &&
            event.name === 'file_view'
        ) {
            scheduleSync(5000);
        }
    }

    /*
     * Открытие избранного или истории.
     */
    function onActivity(event) {
        if (
            !event ||
            event.type !== 'start'
        ) {
            return;
        }

        if (
            event.component !== 'bookmarks' &&
            event.component !== 'favorite'
        ) {
            return;
        }

        if (
            Date.now() - lastNavigation < 1500
        ) {
            return;
        }

        lastNavigation = Date.now();
        scheduleSync(300);
    }

    /*
     * Ручное восстановление истории
     * по сохранённым таймкодам.
     */
    function restoreHistory() {
        var favorite = clone(
            readFavorite()
        );

        var progress = readStorage(
            'file_view'
        );

        var cards = Array.isArray(favorite.card)
            ? favorite.card
            : [];

        var history = Array.isArray(favorite.history)
            ? favorite.history
            : [];

        var known = {};

        history.forEach(function (id) {
            known[String(id)] = true;
        });

        var added = [];

        var hash = Lampa.Utils && Lampa.Utils.hash;

        cards.forEach(function (card) {
            if (
                !card ||
                card.id == null ||
                known[String(card.id)]
            ) {
                return;
            }

            var type = card.original_name
                ? 'tv'
                : 'movie';

            var source = String(
                card.source || 'tmdb'
            );

            var cardKey = type + '_' + card.id;

            if (
                source !== 'tmdb' &&
                source !== 'cub'
            ) {
                cardKey = source + '_' + cardKey;
            }

            cardKey = cardKey
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '')
                .slice(0, 64);

            var found = false;

            Object.keys(progress).some(
                function (key) {
                    var road = progress[key];

                    if (
                        !road ||
                        typeof road !== 'object'
                    ) {
                        return false;
                    }

                    /*
                     * Не восстанавливаем запись
                     * без реального прогресса.
                     */
                    if (
                        !(
                            Number(road.percent || 0) > 0 ||
                            Number(road.time || 0) >= 60
                        )
                    ) {
                        return false;
                    }

                    /*
                     * Новый вариант связи таймкода
                     * с карточкой.
                     */
                    if (road.card === cardKey) {
                        found = true;
                        return true;
                    }

                    if (
                        road.card ||
                        typeof hash !== 'function'
                    ) {
                        return false;
                    }

                    /*
                     * Старые таймкоды фильмов.
                     */
                    if (type === 'movie') {
                        found = (
                            !!card.original_title &&
                            String(
                                hash(card.original_title)
                            ) === key
                        );

                    } else if (card.original_name) {
                        /*
                         * Старые таймкоды сериалов.
                         */
                        var seasons = Math.min(
                            20,
                            Number(
                                card.number_of_seasons
                            ) || 10
                        );

                        for (
                            var s = 1;
                            s <= seasons && !found;
                            s++
                        ) {
                            for (
                                var ep = 1;
                                ep <= 30;
                                ep++
                            ) {
                                var label =
                                    String(s) +
                                    (s > 10 ? ':' : '') +
                                    ep +
                                    card.original_name;

                                if (
                                    String(hash(label)) ===
                                    key
                                ) {
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }

                    return found;
                }
            );

            if (found) {
                known[String(card.id)] = true;
                added.push(card.id);
            }
        });

        if (!added.length) {
            notice(
                'История: совпадений не найдено. ' +
                'Для старых таймкодов нужны ' +
                'карточки фильмов.'
            );
            return;
        }

        /*
         * Не заменяем существующую историю,
         * только дополняем её.
         */
        favorite.history = added.concat(history);

        try {
            applying = true;

            Lampa.Storage.set(
                'favorite',
                favorite,
                true
            );

            Lampa.Favorite.read();

        } finally {
            applying = false;
        }

        added.forEach(function (id) {
            queueOperation(
                'add',
                'history',
                String(id)
            );
        });

        notice(
            'Восстановлено записей истории: ' +
            added.length
        );

        scheduleSync(1000);
    }

    /*
     * Редактирование кода синхронизации.
     */
    function editCode() {
        Lampa.Input.edit({
            title: 'Код синхронизации',
            value: codeNow(),
            free: true,
            nosave: true

        }, function (value) {
            var code = String(value || '').trim();

            if (!validCode(code)) {
                return notice(
                    'Нужен код из 6 цифр'
                );
            }

            localStorage.setItem(
                CODE_KEY,
                code
            );

            setTimeout(function () {
                syncNow(true);
            }, 1000);
        });
    }

    /*
     * Кнопки настроек Lampa.
     */
    function installSettings() {
        Lampa.SettingsApi.addParam({
            component: 'more',

            param: {
                name: 'lampa_sync_v9_code',
                type: 'button'
            },

            field: {
                name: 'Sync: изменить код'
            },

            onChange: editCode
        });

        Lampa.SettingsApi.addParam({
            component: 'more',

            param: {
                name: 'lampa_sync_v9_now',
                type: 'button'
            },

            field: {
                name: 'Sync: синхронизировать сейчас'
            },

            onChange: function () {
                syncNow(true);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'more',

            param: {
                name: 'lampa_sync_v9_restore_history',
                type: 'button'
            },

            field: {
                name:
                    'Sync: восстановить историю по просмотрам'
            },

            onChange: restoreHistory
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
            'state:changed',
            onFavorite
        );

        Lampa.Listener.follow(
            'activity',
            onActivity
        );

        Lampa.Storage.listener.follow(
            'change',
            onStorage
        );

        window.lampaCustomSyncNow = function () {
            syncNow(true);
        };

        window.lampaSyncRestoreHistory =
            restoreHistory;

        /*
         * Одна синхронизация при запуске.
         * Далее только по событиям.
         */
        if (validCode(codeNow())) {
            setTimeout(function () {
                syncNow(false);
            }, 3000);
        }

        log(
            'Запущен. События + журнал удалений, ' +
            'без периодического опроса.'
        );

        return true;
    }

    /*
     * Ожидание инициализации Lampa.
     * Интервал прекращается после запуска.
     */
    var attempts = 0;

    var wait = setInterval(function () {
        attempts++;

        if (
            init() ||
            attempts >= 90
        ) {
            clearInterval(wait);
        }
    }, 1000);

})();
