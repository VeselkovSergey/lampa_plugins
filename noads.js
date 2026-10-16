
(function () {
    'use strict';

    function startPlugin() {
        if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener) {
            console.log('[NoAds] Player API unavailable');
            return;
        }

        if (window.noads_plugin_started) return;
        window.noads_plugin_started = true;

        Lampa.Player.listener.follow('create', function (event) {
            var data = event && event.data;
            if (!data) return;

            delete data.vast_url;
            delete data.vast_msg;
            delete data.vast_region;
            delete data.vast_platform;
            delete data.vast_screen;

            console.log('[NoAds] VAST parameters removed');
        });

        console.log('[NoAds] Player listener installed');
    }

    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }

})();
