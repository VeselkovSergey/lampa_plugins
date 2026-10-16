(function () {
    'use strict';

    if (window.noads_plugin_started) return;
    window.noads_plugin_started = true;

    function init() {
        if (!window.Lampa || !Lampa.Player) {
            console.log('[NoAds] Lampa.Player ещё не готов');
            return;
        }

        console.log('[NoAds] Плагин успешно инициализирован');

        // Здесь подключается логика блокировки рекламы.
    }

    if (window.appready) {
        init();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    } else {
        console.log('[NoAds] Не найден API Lampa');
    }
})();
