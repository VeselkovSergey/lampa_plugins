
(function () {
    'use strict';

    if (window.noads_test_started) return;
    window.noads_test_started = true;

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
            typeof Lampa.Player.play !== 'function') {
            return false;
        }

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function () {
            var data = arguments[0];

            if (data && typeof data === 'object') {
                // Диагностический обход preroll
                data.iptv = true;

                delete data.vast_url;
                delete data.vast_msg;

                notify('Тест пропуска рекламы');
            }

            return originalPlay.apply(this, arguments);
        };

        notify('Тестовая блокировка подключена');
        return true;
    }

    var attempts = 0;
    var timer = setInterval(function () {
        attempts++;

        if (init()) {
            clearInterval(timer);
        } else if (attempts >= 30) {
            clearInterval(timer);
            notify('Ошибка подключения');
        }
    }, 1000);
})();
