
(function () {
    'use strict';

    if (window.lampa_custom_sync_v6) return;
    window.lampa_custom_sync_v6 = true;

    var API = 'https://lampa.dev-lead.ru/sync.php';
    var CODE_KEY = 'lampa_custom_sync_code';

    var busy = false;
    var started = false;
    var codeDialogOpen = false;
    var syncTimer = null;

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

    function log() {
        var args = ['[Lampa Sync v6]'];

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

    function storageGet(name) {
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
            log('Favorite.full error:', e);
        }

        return storageGet('favorite');
    }

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return {};
        }
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
        var keys = SECTIONS.concat(['card']);

        Object.keys(local).concat(
            Object.keys(remote)
        ).forEach(function (key) {
            if (keys.indexOf(key) === -1) {
                keys.push(key);
            }
        });

        keys.forEach(function (section) {
            var a = Array.isArray(local[section])
                ? local[section]
                : [];

            var b = Array.isArray(remote[section])
                ? remote[section]
                : [];

            var seen = Object.create(null);
            var merged = [];

            a.concat(b).forEach(function (item) {
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

        var result = Object.assign({}, local);

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

            var currentUpdated = Number(
                current.updated || 0
            );

            var incomingUpdated = Number(
                incoming.updated || 0
            );

            if (incomingUpdated > currentUpdated) {
                result[key] = incoming;
                return;
            }

            if (incomingUpdated < currentUpdated) {
                return;
            }

            var currentPercent = Number(
                current.percent || 0
            );

            var incomingPercent = Number(
                incoming.percent || 0
            );

            var currentTime = Number(
                current.time || 0
            );

            var incomingTime = Number(
                incoming.time || 0
            );

            if (
                incomingPercent > currentPercent ||
                (
                    incomingPercent === currentPercent &&
                    incomingTime > currentTime
                )
            ) {
                result[key] = incoming;
            }
        });

        return result;
    }

    function favoriteCounts(data) {
        return {
            like: (data.like || []).length,
            book: (data.book || []).length,
            history: (data.history || []).length,
            card: (data.card || []).length
        };
    }

    function syncNow(showMessage) {
        if (busy) {
            log('Синхронизация уже выполняется');
            return;
        }

        var code = getCode();

        if (!validCode(code)) {
            if (showMessage) {
                notify('Сначала введите код');
            }

            return;
        }

        busy = true;

        var outgoing = {
            favorite: clone(getFavorite()),
            file_view: clone(storageGet('file_view'))
        };

        log('Начало синхронизации');

        var controller = typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;

        var timeout = setTimeout(function () {
            if (controller) {
                controller.abort();
            }
        }, 15000);

        var options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                action: 'sync',
                data: outgoing
            })
        };

        if (controller) {
            options.signal = controller.signal;
        }

        fetch(API, options)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(
                        'HTTP ' + response.status
                    );
                }

                return response.json();
            })
            .then(function (answer) {
                if (
                    !answer ||
                    answer.ok !== true ||
                    !answer.data
                ) {
                    throw new Error(
                        answer && answer.error
                            ? answer.error
                            : 'Неверный ответ сервера'
                    );
                }

                // Код мог измениться во время запроса.
                if (getCode() !== code) {
                    log('Код изменён, ответ пропущен');
                    return;
                }

                // Берём самые свежие локальные данные.
                var currentFavorite = clone(
                    getFavorite()
                );

                var currentProgress = clone(
                    storageGet('file_view')
                );

                var mergedFavorite = mergeFavorites(
                    currentFavorite,
                    answer.data.favorite || {}
                );

                var mergedProgress = mergeProgress(
                    currentProgress,
                    answer.data.file_view || {}
                );

                // Не перечитываем Favorite без необходимости.
                if (
                    JSON.stringify(currentFavorite) !==
                    JSON.stringify(mergedFavorite)
                ) {
                    Lampa.Storage.set(
                        'favorite',
                        mergedFavorite
                    );

                    Lampa.Favorite.read();

                    log('Избранное обновлено');
                }

                if (
                    JSON.stringify(currentProgress) !==
                    JSON.stringify(mergedProgress)
                ) {
                    Lampa.Storage.set(
                        'file_view',
                        mergedProgress
                    );

                    log('Прогресс обновлён');
                }

                log('OK', {
                    revision: answer.data.revision,
                    favorite: favoriteCounts(
                        mergedFavorite
                    ),
                    progress: Object.keys(
                        mergedProgress
                    ).length
                });

                if (showMessage) {
                    notify('Синхронизация выполнена');
                }
            })
            .catch(function (error) {
                log('Ошибка синхронизации:', error);

                if (showMessage) {
                    notify(
                        'Ошибка синхронизации: ' +
                        error.message
                    );
                }
            })
            .then(function () {
                clearTimeout(timeout);
                busy = false;
            });
    }

    function openCodeDialog() {
        if (codeDialogOpen) {
            log('Окно ввода уже открыто');
            return;
        }

        if (!Lampa.Input || !Lampa.Input.edit) {
            notify('Ввод кода недоступен');
            return;
        }

        codeDialogOpen = true;

        var currentCode = getCode();

        /*
         * На LG используем минимальный набор
         * параметров штатного окна Lampa.
         *
         * Без принудительного layout: nums
         * и keyboard: lampa.
         */
        try {
            Lampa.Input.edit({
                title: 'Код синхронизации',
                value: currentCode,
                free: true,
                nosave: true
            }, function (value) {
                codeDialogOpen = false;

                // Отмена ввода — код не меняем.
                if (value === null ||
                    typeof value === 'undefined') {
                    return;
                }

                var code = String(value).trim();

                if (!validCode(code)) {
                    notify('Введите ровно 6 цифр');
                    return;
                }

                try {
                    localStorage.setItem(
                        CODE_KEY,
                        code
                    );
                } catch (e) {
                    notify('Не удалось сохранить код');
                    return;
                }

                notify('Код сохранён');

                /*
                 * Не запускаем сетевой запрос
                 * непосредственно внутри callback
                 * клавиатуры LG.
                 */
                setTimeout(function () {
                    syncNow(true);
                }, 800);
            });
        } catch (error) {
            codeDialogOpen = false;
            log('Ошибка открытия клавиатуры:', error);
            notify('Не удалось открыть ввод кода');
        }
    }

    function installSettings() {
        if (
            !Lampa.SettingsApi ||
            !Lampa.SettingsApi.addParam
        ) {
            return;
        }

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_code_v6',
                type: 'button'
            },
            field: {
                name: 'Sync: ввести / изменить код'
            },
            onChange: function () {
                openCodeDialog();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'more',
            param: {
                name: 'lampa_sync_now_v6',
                type: 'button'
            },
            field: {
                name: 'Sync: синхронизировать сейчас'
            },
            onChange: function () {
                syncNow(true);
            }
        });
    }

    function init() {
        if (started) return true;

        if (
            !window.Lampa ||
            !Lampa.Storage ||
            !Lampa.Storage.get ||
            !Lampa.Storage.set ||
            !Lampa.Favorite ||
            !Lampa.Favorite.full ||
            !Lampa.Favorite.read ||
            !Lampa.Input ||
            !Lampa.SettingsApi
        ) {
            return false;
        }

        started = true;

        installSettings();

        window.lampaCustomSyncNow = function () {
            syncNow(true);
        };

        window.lampaCustomSyncCode = openCodeDialog;

        syncTimer = setInterval(function () {
            syncNow(false);
        }, 30000);

        // Только синхронизация, без открытия клавиатуры.
        if (validCode(getCode())) {
            setTimeout(function () {
                syncNow(false);
            }, 2500);
        }

        log('Запущен');
        return true;
    }

    var attempts = 0;

    var waitTimer = setInterval(function () {
        attempts++;

        if (init() || attempts >= 90) {
            clearInterval(waitTimer);
        }
    }, 1000);
})();
