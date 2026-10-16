
(function () {
    'use strict';

    if (window.noads_v4_started) return;
    window.noads_v4_started = true;

    var originalOpen = XMLHttpRequest.prototype.open;

    var EMPTY_ADS_URL =
        'data:application/json,%7B%22ad%22%3A%5B%5D%7D';

    var intercepted = 0;

    function log(message) {
        console.log('[NoAds v4] ' + message);
    }

    function isPrerollRequest(method, url) {
        return String(method).toUpperCase() === 'GET' &&
            /\/api\/ad\/get\/preroll(?:[?#]|$)/i.test(
                String(url || '')
            );
    }

    XMLHttpRequest.prototype.open = function (
        method,
        url
    ) {
        if (isPrerollRequest(method, url)) {
            intercepted++;

            log(
                'Запрос preroll перенаправлен. Всего: ' +
                intercepted
            );

            /*
             * Настоящий XHR остаётся нетронутым.
             * Меняем только адрес рекламного запроса.
             *
             * Ответ: {"ad":[]}
             */
            var args = Array.prototype.slice.call(
                arguments
            );

            args[1] = EMPTY_ADS_URL;

            return originalOpen.apply(this, args);
        }

        return originalOpen.apply(this, arguments);
    };

    log('Активирован перехват запросов preroll');
})();
