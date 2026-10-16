
(function () {
    'use strict';

    console.log('[NoAds] Script executed');

    function showMessage() {
        if (window.Lampa &&
            Lampa.Noty &&
            typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show('NoAds TEST: плагин работает!');
            console.log('[NoAds] Notification shown');
        } else {
            console.log('[NoAds] Notification API unavailable');
        }
    }

    // Проверяем несколько раз, если Lampa ещё загружается
    var attempts = 0;

    var timer = setInterval(function () {
        attempts++;

        if (window.Lampa && Lampa.Noty) {
            clearInterval(timer);
            showMessage();
        } else if (attempts >= 30) {
            clearInterval(timer);
            console.log('[NoAds] Initialization timeout');
        }
    }, 1000);
})();
