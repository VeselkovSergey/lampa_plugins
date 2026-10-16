
(function () {
    'use strict';

    if (window.noads_debug_started) return;
    window.noads_debug_started = true;

    function notify(message) {
        console.log('[NoAds] ' + message);

        if (window.Lampa && Lampa.Noty &&
            typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show('NoAds: ' + message);
        }
    }

    function init() {
        if (!window.Lampa ||
            !Lampa.Player ||
            typeof Lampa.Player.play !== 'function') {
            return false;
        }

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function () {
            notify('Вызван Player.play');

            var data = arguments[0];

            if (data && typeof data === 'object') {
                if (data.vast_url) {
                    delete data.vast_url;
                    delete data.vast_msg;
                    delete data.vast_region;
                    delete data.vast_platform;
                    delete data.vast_screen;

                    notify('VAST удалён');
                } else {
                    notify('VAST отсутствует');
                }
            }

            return originalPlay.apply(this, arguments);
        };

        notify('Перехват Player.play установлен');
        return true;
    }

    var attempts = 0;
    var timer = setInterval(function () {
        attempts++;

        if (init() || attempts >= 30) {
            clearInterval(timer);

            if (attempts >= 30) {
                notify('Player.play недоступен');
            }
        }
    }, 1000);
})();
