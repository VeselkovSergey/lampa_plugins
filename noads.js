
(function () {
    'use strict';

    function removeVast(data) {
        if (!data || typeof data !== 'object') return;

        delete data.vast_url;
        delete data.vast_msg;
        delete data.vast_region;
        delete data.vast_platform;
        delete data.vast_screen;
    }

    function startPlugin() {
        if (window.noads_plugin) return;
        if (!window.Lampa || !Lampa.Player) return;

        window.noads_plugin = true;

        var player = Lampa.Player;

        if (typeof player.play === 'function') {
            var originalPlay = player.play;

            player.play = function () {
                removeVast(arguments[0]);
                return originalPlay.apply(this, arguments);
            };
        }

        if (typeof player.playlist === 'function') {
            var originalPlaylist = player.playlist;

            player.playlist = function () {
                var items = arguments[0];

                if (Array.isArray(items)) {
                    items.forEach(removeVast);
                } else {
                    removeVast(items);
                }

                return originalPlaylist.apply(this, arguments);
            };
        }

        console.log('[NoAds] Plugin initialized');
    }

    // Как в Online MOD: основной запуск сразу
    startPlugin();

})();
