(function () {
  'use strict';
  if (window.__GG_DIAGNOSTICS__) return;

  const BUILD = 'anon-v2';
  const startedAt = Date.now();
  const bridge = window.__GG_DIAG__;
  const counters = Object.create(null);
  const tokenMaps = Object.create(null);
  const tokenCounters = Object.create(null);
  const baselineWindowKeys = new Set(Object.getOwnPropertyNames(window));

  function token(kind, value) {
    const text = String(value == null ? '' : value);
    let map = tokenMaps[kind];
    if (!map) map = tokenMaps[kind] = new Map();
    if (map.has(text)) return map.get(text);
    const next = (tokenCounters[kind] || 0) + 1;
    tokenCounters[kind] = next;
    const alias = kind + '-' + next;
    if (map.size < 2048) map.set(text, alias);
    return alias;
  }

  function lengthBucket(value) {
    const length = String(value == null ? '' : value).length;
    if (length === 0) return '0';
    if (length <= 4) return '1-4';
    if (length <= 16) return '5-16';
    if (length <= 64) return '17-64';
    if (length <= 256) return '65-256';
    if (length <= 1024) return '257-1024';
    return '1025+';
  }

  function numberClass(value) {
    if (!Number.isFinite(value)) return 'non-finite';
    if (value === 0) return 'zero';
    if (value === 1) return 'one';
    if (value === -1) return 'minus-one';
    const absolute = Math.abs(value);
    if (absolute < 10) return value < 0 ? 'negative-small' : 'small';
    if (absolute < 1000) return value < 0 ? 'negative-medium' : 'medium';
    return value < 0 ? 'negative-large' : 'large';
  }

  function fixed(value, allowed, fallbackKind) {
    const text = String(value == null ? '' : value);
    return allowed.indexOf(text) >= 0 ? text : token(fallbackKind || 'id', text);
  }

  function methodName(value) {
    return fixed(String(value || 'GET').toUpperCase(), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], 'method');
  }

  function readyStateName(value) {
    return fixed(value, ['loading', 'interactive', 'complete'], 'state');
  }

  function visibilityName(value) {
    return fixed(value, ['visible', 'hidden', 'prerender', 'unloaded'], 'state');
  }

  function contentClass(value) {
    const text = String(value == null ? '' : value).toLowerCase();
    if (text.indexOf('json') >= 0) return 'json';
    if (text.indexOf('javascript') >= 0 || text.indexOf('ecmascript') >= 0) return 'script';
    if (text.indexOf('html') >= 0) return 'html';
    if (text.indexOf('css') >= 0) return 'style';
    if (text.indexOf('image/') === 0) return 'image';
    if (text.indexOf('font') >= 0 || text.indexOf('woff') >= 0) return 'font';
    if (text.indexOf('audio/') === 0) return 'audio';
    if (text.indexOf('video/') === 0) return 'video';
    if (text.indexOf('text/') === 0) return 'text';
    if (!text) return 'unknown';
    return 'binary';
  }

  function pathClass(pathname) {
    const path = String(pathname || '');
    const clean = path.split('?')[0].split('#')[0];
    const last = clean.substring(clean.lastIndexOf('/') + 1).toLowerCase();
    if (/\.(js|mjs)$/.test(last)) return 'script';
    if (/\.css$/.test(last)) return 'style';
    if (/\.(png|jpe?g|gif|webp|svg|ico)$/.test(last)) return 'image';
    if (/\.(woff2?|ttf|otf)$/.test(last)) return 'font';
    if (/\.(mp3|ogg|wav|m4a)$/.test(last)) return 'audio';
    if (/\.(mp4|webm|m3u8)$/.test(last)) return 'video';
    if (/\.(json|xml)$/.test(last)) return 'data';
    if (/\.(html?|php|aspx?)$/.test(last)) return 'document';
    return last.indexOf('.') >= 0 ? 'other-file' : 'route';
  }

  function urlFingerprint(value) {
    try {
      const parsed = new URL(String(value), location.href);
      let scope = 'external';
      try { if (parsed.origin === location.origin) scope = 'same-origin'; } catch (_) {}
      const segments = parsed.pathname.split('/').filter(Boolean).length;
      const queryCount = parsed.search ? parsed.search.substring(1).split('&').filter(Boolean).length : 0;
      return {
        scheme: fixed(parsed.protocol.replace(':', ''), ['http', 'https', 'file', 'data', 'blob', 'about'], 'scheme'),
        scope: scope,
        origin: token('origin', parsed.origin),
        route: token('route', parsed.origin + parsed.pathname),
        pathDepth: Math.min(segments, 12),
        pathClass: pathClass(parsed.pathname),
        queryCount: Math.min(queryCount, 20),
        fragment: !!parsed.hash
      };
    } catch (_) {
      return { scheme: 'unknown', scope: 'opaque', origin: token('origin', value), route: token('route', value), pathDepth: 0, pathClass: 'unknown', queryCount: 0, fragment: false };
    }
  }

  function tagName(value) {
    const text = String(value == null ? '' : value).toUpperCase();
    const common = ['HTML', 'HEAD', 'BODY', 'DIV', 'SPAN', 'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'FORM', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'SCRIPT', 'STYLE', 'LINK', 'META', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'TD', 'TH', 'P', 'H1', 'H2', 'H3', 'NAV', 'MAIN', 'SECTION', 'ARTICLE'];
    return common.indexOf(text) >= 0 ? text : 'OTHER';
  }

  function shape(value, depth) {
    if (depth > 2) return { type: typeof value };
    if (value == null) return { type: String(value) };
    const type = typeof value;
    if (type === 'string') return { type: 'string', id: token('str', value), length: lengthBucket(value) };
    if (type === 'number') return { type: 'number', valueClass: numberClass(value), integer: Number.isInteger(value) };
    if (type === 'boolean') return { type: 'boolean', value: value };
    if (type === 'function') return { type: 'function', id: token('fn', value), arity: value.length };
    if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 4).map(function (v) { return shape(v, depth + 1); }) };
    if (value instanceof Error) return {
      type: 'error',
      id: token('error', (value.name || '') + '|' + (value.message || '') + '|' + (value.stack || '')),
      nameClass: fixed(value.name || 'Error', ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'NetworkError', 'AbortError'], 'error-type'),
      messageLength: lengthBucket(value.message),
      stackPresent: !!value.stack
    };
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return { type: 'node', nodeType: value.nodeType, tag: tagName(value.nodeName), connected: !!value.isConnected };
    }
    let keys = [];
    try { keys = Object.keys(value).slice(0, 12).map(function (key) { return token('key', key); }); } catch (_) {}
    let ctor = 'none';
    try { ctor = token('ctor', value && value.constructor && value.constructor.name || ''); } catch (_) {}
    return { type: 'object', ctor: ctor, keyCount: keys.length, keys: keys };
  }

  function emit(event, detail) {
    try {
      if (!bridge || typeof bridge.emit !== 'function') return;
      bridge.emit(JSON.stringify({ event: event, detail: detail || {} }));
    } catch (_) {}
  }

  function sample(key, first, every) {
    const count = (counters[key] || 0) + 1;
    counters[key] = count;
    return count <= first || (every > 0 && count % every === 0);
  }

  window.__GG_DIAGNOSTICS__ = {
    build: BUILD,
    emit: emit,
    shape: shape,
    token: token,
    urlFingerprint: urlFingerprint,
    counters: counters,
    startedAt: startedAt,
    baselineWindowKeys: baselineWindowKeys
  };

  emit('diagnostics_installed', {
    build: BUILD,
    readyState: readyStateName(document.readyState),
    href: urlFingerprint(location.href),
    hasBridge: !!bridge,
    environment: {
      android: /Android/i.test(navigator.userAgent),
      webView: /; wv\)/i.test(navigator.userAgent) || /Version\/4\.0/i.test(navigator.userAgent)
    }
  });

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    try {
      const original = console[level];
      if (typeof original !== 'function' || original.__ggWrapped) return;
      const wrapped = function () {
        const args = Array.prototype.slice.call(arguments);
        emit('console_event', { level: level, count: args.length, args: args.slice(0, 8).map(function (v) { return shape(v, 0); }) });
        return original.apply(this, args);
      };
      wrapped.__ggWrapped = true;
      console[level] = wrapped;
    } catch (_) {}
  });

  window.addEventListener('error', function (event) {
    emit('window_error', {
      error: shape(event.error || new Error(String(event.message || '')), 0),
      messageLength: lengthBucket(event.message),
      source: urlFingerprint(event.filename || ''),
      line: event.lineno || 0,
      column: event.colno || 0
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    emit('unhandled_rejection', { reason: shape(event.reason, 0) });
  });

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const begin = performance.now();
      const method = methodName((init && init.method) || (input && input.method) || 'GET');
      const target = input && input.url ? input.url : input;
      const request = { method: method, url: urlFingerprint(target), bodyPresent: !!(init && init.body) };
      emit('fetch_start', request);
      return originalFetch.apply(this, arguments).then(function (response) {
        emit('fetch_end', {
          method: method,
          url: request.url,
          status: response.status,
          statusClass: Math.floor(response.status / 100) + 'xx',
          ok: response.ok,
          redirected: response.redirected,
          responseType: fixed(response.type, ['basic', 'cors', 'default', 'error', 'opaque', 'opaqueredirect'], 'response-type'),
          contentClass: contentClass(response.headers && response.headers.get('content-type')),
          durationMs: Math.round(performance.now() - begin)
        });
        return response;
      }, function (error) {
        emit('fetch_error', {
          method: method,
          url: request.url,
          error: shape(error, 0),
          durationMs: Math.round(performance.now() - begin)
        });
        throw error;
      });
    };
  }

  if (typeof XMLHttpRequest === 'function') {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const originalSetHeader = proto.setRequestHeader;
    proto.open = function (method, url) {
      this.__ggDiag = { method: methodName(method), url: urlFingerprint(url), headerCount: 0 };
      return originalOpen.apply(this, arguments);
    };
    proto.setRequestHeader = function () {
      if (this.__ggDiag) this.__ggDiag.headerCount = Math.min(40, this.__ggDiag.headerCount + 1);
      return originalSetHeader.apply(this, arguments);
    };
    proto.send = function (body) {
      const meta = this.__ggDiag || { method: 'GET', url: { scheme: 'unknown', scope: 'opaque', origin: 'origin-0', route: 'route-0' }, headerCount: 0 };
      meta.sentAt = performance.now();
      meta.bodyPresent = body != null;
      emit('xhr_start', meta);
      const finish = () => {
        let responseLength = -1;
        try { if (typeof this.responseText === 'string') responseLength = this.responseText.length; } catch (_) {}
        emit('xhr_end', {
          method: meta.method,
          url: meta.url,
          status: this.status,
          statusClass: Math.floor(this.status / 100) + 'xx',
          readyState: this.readyState,
          responseType: fixed(this.responseType || 'text', ['', 'text', 'arraybuffer', 'blob', 'document', 'json'], 'response-type'),
          responseLengthBucket: lengthBucket(new Array(Math.max(0, Math.min(responseLength, 2048)) + 1).join('x')),
          contentClass: contentClass(this.getResponseHeader('content-type')),
          durationMs: Math.round(performance.now() - (meta.sentAt || performance.now()))
        });
      };
      this.addEventListener('loadend', finish, { once: true });
      this.addEventListener('error', function () { emit('xhr_error', { method: meta.method, url: meta.url }); }, { once: true });
      this.addEventListener('timeout', function () { emit('xhr_timeout', { method: meta.method, url: meta.url }); }, { once: true });
      return originalSend.apply(this, arguments);
    };
  }

  function wrapSelectorMethod(owner, name, kind) {
    try {
      const original = owner && owner[name];
      if (typeof original !== 'function' || original.__ggWrapped) return;
      const wrapped = function (selector) {
        const result = original.apply(this, arguments);
        const selectorId = token('selector', selector);
        let found = false;
        let count = 0;
        if (kind === 'one') found = !!result;
        else {
          try { count = result ? result.length : 0; } catch (_) {}
          found = count > 0;
        }
        const key = name + ':' + selectorId + ':' + found + ':' + count;
        if (sample(key, 4, 50)) emit('dom_query', { operation: name, selector: selectorId, found: found, count: Math.min(count, 5000) });
        return result;
      };
      wrapped.__ggWrapped = true;
      owner[name] = wrapped;
    } catch (_) {}
  }

  wrapSelectorMethod(Document.prototype, 'querySelector', 'one');
  wrapSelectorMethod(Document.prototype, 'querySelectorAll', 'many');
  wrapSelectorMethod(Element.prototype, 'querySelector', 'one');
  wrapSelectorMethod(Element.prototype, 'querySelectorAll', 'many');
  wrapSelectorMethod(Document.prototype, 'getElementById', 'one');
  wrapSelectorMethod(Document.prototype, 'getElementsByClassName', 'many');

  ['pushState', 'replaceState'].forEach(function (name) {
    try {
      const original = history[name];
      history[name] = function (state, title, url) {
        emit('history_change', { operation: name, url: urlFingerprint(url || location.href), state: shape(state, 0) });
        return original.apply(this, arguments);
      };
    } catch (_) {}
  });

  function lifecycle(name, detail) { emit('lifecycle_event', Object.assign({ name: name }, detail || {})); }
  document.addEventListener('DOMContentLoaded', function () { lifecycle('dom-content-loaded', { elapsedMs: Date.now() - startedAt }); }, { once: true });
  window.addEventListener('load', function () { lifecycle('load', { elapsedMs: Date.now() - startedAt }); }, { once: true });
  window.addEventListener('pageshow', function (event) { lifecycle('pageshow', { persisted: !!event.persisted }); });
  window.addEventListener('pagehide', function (event) { lifecycle('pagehide', { persisted: !!event.persisted, counterKinds: Object.keys(counters).length }); });
  window.addEventListener('hashchange', function () { lifecycle('hashchange', { href: urlFingerprint(location.href) }); });
  window.addEventListener('popstate', function () { lifecycle('popstate', { href: urlFingerprint(location.href) }); });
  window.addEventListener('online', function () { lifecycle('online'); });
  window.addEventListener('offline', function () { lifecycle('offline'); });
  document.addEventListener('visibilitychange', function () { lifecycle('visibility', { state: visibilityName(document.visibilityState) }); });
})();
