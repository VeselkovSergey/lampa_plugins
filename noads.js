(function () {
    'use strict';

    function init() {
        console.log('[NoAds] Plugin loaded');
    }

    if (window.appready) {
        init();
    } else if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    } else {
        init();
    }
})();
