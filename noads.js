
(function () {
    'use strict';

    function startPlugin() {
        if (!window.Lampa || !Lampa.Player) return;
        if (window.noads_plugin) return;

        window.noads_plugin = true;

        function clean(data) {
            if (!data || typeof data !== 'object') return;

            delete data.vast_url;
            delete data.vast_msg;
            delete data.vast_region;
            delete data.vast_platform;
            delete data.vast_screen;
        }

        var originalPlay = Lampa.Player.play;

        if (typeof originalPlay === 'function') {
            Lampa.Player.play = function () {
                clean(arguments[0]);
                return originalPlay.apply(this, arguments);
            };
        }

        console.log('[NoAds] Plugin started');
    }

    startPlugin();
})();
