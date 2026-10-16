
(function () {
    'use strict';

    if (window.Lampa && Lampa.Manifest) {
    Lampa.Manifest.plugins = {
        type: 'other',
        version: '1.0.0',
        name: 'Lampa NoAds',
        description: 'Блокировка рекламы при воспроизведении'
    };
}

    if (window.noads_experiment_started) return;
    window.noads_experiment_started = true;

    function setPluginName() {
    if (!window.Lampa || !Lampa.Plugins) return;

    var url = 'https://veselkovsergey.github.io/lampa_plugins/noads.js';
    var plugins = Lampa.Plugins.get();

    var plugin = plugins.find(function (item) {
        return item.url === url;
    });

    if (plugin && plugin.name !== 'Lampa NoAds') {
        plugin.name = 'Lampa NoAds';
        plugin.author = 'Veselkov Sergey';
        plugin.descr = 'Блокировка рекламы';

        Lampa.Plugins.save();
    }
}

    var CLEAR_ALL_TIMERS = false;
    var BLOCK_NEW_VIDEO = true;

    function notify(message) {
        console.log('[NoAds] ' + message);

        if (window.Lampa &&
            Lampa.Noty &&
            typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show('NoAds: ' + message);
        }
    }

    // Эксперимент: перехват создания video.
    // ВНИМАНИЕ: может заблокировать и сам фильм.
    if (BLOCK_NEW_VIDEO && document.createElement) {
        var originalCreateElement = document.createElement;

        document.createElement = function () {
            var element = originalCreateElement.apply(this, arguments);

            if (String(arguments[0]).toLowerCase() === 'video') {
                var originalPlay = element.play;

                element.play = function () {
                    notify('Перехвачено воспроизведение video');

                    // Имитируем завершение.
                    setTimeout(function () {
                        element.dispatchEvent(new Event('ended'));
                    }, 500);

                    return Promise.resolve();
                };

                element.__noads_original_play = originalPlay;
            }

            return element;
        };
    }

    function clearAllTimers() {
        var lastId = setTimeout(function () {}, 0);

        for (var i = 0; i <= lastId; i++) {
            clearTimeout(i);
            clearInterval(i);
        }

        notify('Таймеры очищены');
    }

    if (CLEAR_ALL_TIMERS) {
        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                clearAllTimers
            );
        } else {
            clearAllTimers();
        }
    }

    function ready() {
        notify('Экспериментальный плагин загружен');
    }

    if (window.Lampa && Lampa.Noty) {
        ready();
    } else {
        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;

            if (window.Lampa && Lampa.Noty) {
                clearInterval(timer);
                ready();
            } else if (attempts >= 30) {
                clearInterval(timer);
            }
        }, 1000);
    }
})();
