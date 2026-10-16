
(function () {
    'use strict';

    if (window.lampa_noads_v5) return;

    if (
        !window.Lampa ||
        !Lampa.Player ||
        !Lampa.Player.listener ||
        typeof Lampa.Player.listener.follow !== 'function'
    ) {
        console.warn(
            '[NoAds v5] Lampa.Player.listener недоступен'
        );
        return;
    }

    window.lampa_noads_v5 = true;

    function beforePlay(event) {
        var data = event && event.data;

        if (!data || typeof data !== 'object') {
            return;
        }

        var old;

        try {
            old = Object.getOwnPropertyDescriptor(
                data,
                'iptv'
            );

            // Не трогаем защищённые свойства
            // и нестандартные геттеры других плагинов.
            if (
                old &&
                (
                    !old.configurable ||
                    !old.hasOwnProperty('value')
                )
            ) {
                return;
            }

            // Настоящий IPTV уже пропускает рекламу.
            if (data.iptv) return;

        } catch (e) {
            return;
        }

        var reads = 0;
        var restored = false;

        function restore() {
            if (restored) return;

            restored = true;

            try {
                if (old) {
                    Object.defineProperty(
                        data,
                        'iptv',
                        old
                    );
                } else {
                    delete data.iptv;
                }
            } catch (e) {
                console.warn(
                    '[NoAds v5] Ошибка восстановления iptv:',
                    e
                );
            }
        }

        try {
            /*
             * В этой сборке Lampa getMediaType()
             * читает data.iptv два раза:
             *
             * 1. При создании поля iptv.
             * 2. При вычислении поля any.
             *
             * На оба чтения возвращаем true.
             * Сразу после второго восстанавливаем
             * исходное свойство.
             */

            Object.defineProperty(data, 'iptv', {
                configurable: true,
                enumerable: false,

                get: function () {
                    reads++;

                    if (reads === 2) {
                        restore();

                        console.log(
                            '[NoAds v5] Preroll пропущен'
                        );
                    }

                    return true;
                },

                set: function (value) {
                    restore();
                    data.iptv = value;
                }
            });

            /*
             * Защита на случай отменённого
             * или отложенного запуска фильма.
             */
            setTimeout(restore, 0);

        } catch (e) {
            restore();

            console.warn(
                '[NoAds v5] Ошибка подготовки:',
                e
            );
        }
    }

    Lampa.Player.listener.follow(
        'create',
        beforePlay
    );

    console.log(
        '[NoAds v5] Запущен. ' +
        'Без перехвата XHR и video.play'
    );

})();
