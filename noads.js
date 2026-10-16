
(function () {
    'use strict';

    if (window.noads_direct_v3) return;
    window.noads_direct_v3 = true;

    var NativeXHR = window.XMLHttpRequest;
    var blocked = 0;

    function log(message) {
        console.log('[NoAds v3] ' + message);
    }

    function isPreroll(url) {
        return /\/api\/ad\/get\/preroll(?:[?#]|$)/i.test(
            String(url || '')
        );
    }

    function FakePrerollXHR() {
        this.readyState = 0;
        this.status = 0;
        this.statusText = '';
        this.responseText = '';
        this.response = null;

        this.onload = null;
        this.onreadystatechange = null;
        this.onerror = null;
        this.ontimeout = null;
        this.onloadend = null;

        this.timeout = 0;
        this.withCredentials = false;

        this._listeners = {};
        this._timer = null;
    }

    FakePrerollXHR.prototype.addEventListener = function (
        type,
        callback
    ) {
        if (typeof callback !== 'function') return;

        if (!this._listeners[type]) {
            this._listeners[type] = [];
        }

        this._listeners[type].push(callback);
    };

    FakePrerollXHR.prototype.removeEventListener = function (
        type,
        callback
    ) {
        var listeners = this._listeners[type];

        if (!listeners) return;

        var index = listeners.indexOf(callback);

        if (index !== -1) {
            listeners.splice(index, 1);
        }
    };

    FakePrerollXHR.prototype._emit = function (type) {
        var event = {
            type: type,
            target: this,
            currentTarget: this
        };

        var handler = this['on' + type];

        if (typeof handler === 'function') {
            try {
                handler.call(this, event);
            } catch (e) {
                log('Ошибка обработчика ' + type + ': ' + e);
            }
        }

        var listeners = (
            this._listeners[type] || []
        ).slice();

        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i].call(this, event);
            } catch (e) {
                log('Ошибка слушателя ' + type + ': ' + e);
            }
        }
    };

    FakePrerollXHR.prototype.open = function () {
        this.readyState = 1;
        this._emit('readystatechange');
    };

    FakePrerollXHR.prototype.setRequestHeader = function () {};

    FakePrerollXHR.prototype.getResponseHeader = function (
        name
    ) {
        if (String(name).toLowerCase() === 'content-type') {
            return 'application/json';
        }

        return null;
    };

    FakePrerollXHR.prototype.getAllResponseHeaders = function () {
        return 'content-type: application/json\r\n';
    };

    FakePrerollXHR.prototype.overrideMimeType = function () {};

    FakePrerollXHR.prototype.send = function () {
        var self = this;

        this._timer = setTimeout(function () {
            self._timer = null;

            self.status = 200;
            self.statusText = 'OK';
            self.responseText = '{"ad":[]}';
            self.response = self.responseText;
            self.readyState = 4;

            self._emit('readystatechange');
            self._emit('load');
            self._emit('loadend');

            blocked++;
            log(
                'Preroll отключён. Запросов: ' + blocked
            );
        }, 0);
    };

    FakePrerollXHR.prototype.abort = function () {
        if (this._timer !== null) {
            clearTimeout(this._timer);
            this._timer = null;
        }

        this.readyState = 0;
        this._emit('abort');
        this._emit('loadend');
    };

    /*
     * Для обычных запросов возвращаем настоящий XHR.
     * Для preroll создаём объект с ответом {"ad":[]}.
     */
    function NoAdsXHR() {
        var xhr = new NativeXHR();
        var originalOpen = xhr.open;
        var fake = null;

        xhr.open = function (method, url) {
            if (
                String(method).toUpperCase() === 'GET' &&
                isPreroll(url)
            ) {
                /*
                 * Перехват должен произойти до установки
                 * обработчиков onload в VastManager.
                 */
                fake = new FakePrerollXHR();
                fake.open();

                log('Запрос рекламы перехвачен: ' + url);

                return;
            }

            return originalOpen.apply(xhr, arguments);
        };

        /*
         * Возвращаем обёртку с прозрачным доступом
         * к обычному XHR и отдельной обработкой preroll.
         */
        var wrapper = {};

        var properties = [
            'onload',
            'onreadystatechange',
            'onerror',
            'ontimeout',
            'onloadend',
            'onabort',
            'timeout',
            'withCredentials',
            'responseType',
            'readyState',
            'status',
            'statusText',
            'responseText',
            'response',
            'upload'
        ];

        for (var i = 0; i < properties.length; i++) {
            (function (property) {
                Object.defineProperty(wrapper, property, {
                    configurable: true,
                    enumerable: true,

                    get: function () {
                        return (fake || xhr)[property];
                    },

                    set: function (value) {
                        (fake || xhr)[property] = value;
                    }
                });
            })(properties[i]);
        }

        wrapper.open = function () {
            return xhr.open.apply(xhr, arguments);
        };

        var methods = [
            'send',
            'abort',
            'setRequestHeader',
            'getResponseHeader',
            'getAllResponseHeaders',
            'overrideMimeType',
            'addEventListener',
            'removeEventListener'
        ];

        for (var j = 0; j < methods.length; j++) {
            (function (method) {
                wrapper[method] = function () {
                    var target = fake || xhr;

                    return target[method].apply(
                        target,
                        arguments
                    );
                };
            })(methods[j]);
        }

        return wrapper;
    }

    NoAdsXHR.prototype = NativeXHR.prototype;

    window.XMLHttpRequest = NoAdsXHR;

    log('Запущен. Прямой перехват preroll активен.');
})();
