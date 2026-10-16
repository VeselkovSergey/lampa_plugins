
(function () {
    'use strict';

    if (window.noads_direct_v2) return;
    window.noads_direct_v2 = true;

    var STYLE_ID = 'noads-direct-style';

    function log(message) {
        console.log('[NoAds Direct] ' + message);
    }

    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;

        /*
         * Скрываем только элементы рекламного
         * интерфейса Lampa.
         *
         * Не трогаем video, iframe и сам плеер.
         */
        style.textContent = [
            '.ad-preroll,',
            '.ad-video-block,',
            '.ad-bot,',
            '.ad-card,',
            '.ad-offer,',
            '.ad-premiere {',
            '  display: none !important;',
            '}'
        ].join('\n');

        (document.head || document.documentElement)
            .appendChild(style);
    }

    function trySkip() {
        /*
         * Здесь нет имитации ended и нет
         * перехвата HTMLVideoElement.play().
         *
         * Ищем только явно существующие
         * кнопки пропуска рекламы.
         */
        var selectors = [
            '.ad-video-block .ad-skip',
            '.ad-preroll .ad-skip'
        ];

        for (var i = 0; i < selectors.length; i++) {
            var button = document.querySelector(
                selectors[i]
            );

            if (button && typeof button.click === 'function') {
                button.click();
                log('Нажата кнопка пропуска рекламы');
                return;
            }
        }
    }

    function checkAds() {
        try {
            installStyle();
            trySkip();
        } catch (e) {
            log('Ошибка: ' + e.message);
        }
    }

    function start() {
        installStyle();

        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function () {
                trySkip();
            });

            observer.observe(
                document.body || document.documentElement,
                {
                    childList: true,
                    subtree: true
                }
            );
        }

        log('Экспериментальный режим запущен');
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            start
        );
    } else {
        start();
    }
})();
