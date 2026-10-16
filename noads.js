
(function () {
    'use strict';

    if (window.noads_plugin_started) return;
    window.noads_plugin_started = true;

    function notify(message) {
        console.log('[NoAds] ' + message);

        if (window.Lampa &&
            Lampa.Noty &&
            typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show('NoAds: ' + message);
        }
    }

    function init() {
        if (!window.Lampa ||
            !Lampa.Player ||
            !Lampa.Player.listener) {
            return false;
        }

        Lampa.Player.listener.follow('create', function (event) {
            notify('Событие запуска плеера');

            var data = event && event.data;
            if (!data) return;

            if (data.vast_url) {
                delete data.vast_url;
                delete data.vast_msg;
                delete data.vast_region;
                delete data.vast_platform;
                delete data.vast_screen;

                notify('VAST удалён');
            } else {
                notify('VAST не найден');
            }
        });

        notify('Блокировка подключена');
        return true;
    }

    var attempts = 0;

    var timer = setInterval(function () {
        attempts++;

        if (init()) {
            clearInterval(timer);
        } else if (attempts >= 30) {
            clearInterval(timer);
            notify('Ошибка инициализации');
        }
    }, 1000);
})();
