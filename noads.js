(function () {
    'use strict';

    function removeAds(item) {
        if (!item || typeof item !== 'object') return;

        [
            'vast_url',
            'vast_msg',
            'vast_region',
            'vast_platform',
            'vast_screen'
        ].forEach(function (key) {
            delete item[key];
        });
    }

    function startPlugin() {
        if (!window.Lampa || !Lampa.Player) return;

        var player = Lampa.Player;

        if (player.__noPrerollInstalled) return;
        player.__noPrerollInstalled = true;

        if (typeof player.play === 'function') {
            var originalPlay = player.play;

            player.play = function (data) {
                removeAds(data);
                return originalPlay.apply(this, arguments);
            };
        }

        if (typeof player.playlist === 'function') {
            var originalPlaylist = player.playlist;

            player.playlist = function (items) {
                if (Array.isArray(items)) {
                    items.forEach(removeAds);
                }

                return originalPlaylist.apply(this, arguments);
            };
        }

        console.log('[NoPreroll] Перехват параметров рекламы включён');
    }

    if (window.appready) {
        startPlugin();
    } else if (window.Lampa) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
