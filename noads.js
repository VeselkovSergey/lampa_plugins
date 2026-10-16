
(function () {
    'use strict';

    function notify(message) {
        if (window.Lampa && Lampa.Noty &&
            typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show(message);
        }

        console.log('[NoAds] ' + message);
    }

    function startPlugin() {
        if (!window.Lampa ||
            !Lampa.Player ||
            !Lampa.Player.listener) {
            console.log('[NoAds] Player API unavailable');
            return;
        }

        if (window.noads_plugin_started) return;
        window.noads_plugin_started = true;

        Lampa.Player.listener.follow('create', function (event) {
            var data = event && event.data;
            if (!data) return;

            var hasVast = !!data.vast_url;

            delete data.vast_url;
            delete data.vast_msg;
            delete data.vast_region;
            delete data.vast_platform;
            delete data.vast_screen;

            if (hasVast) {
                notify('NoAds: VAST-реклама удалена');
            }
        });

        notify('NoAds: плагин успешно загружен');
    }

    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }

})();
