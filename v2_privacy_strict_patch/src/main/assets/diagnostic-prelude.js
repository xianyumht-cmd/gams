(function () {
  'use strict';
  if (window.__GG_DIAGNOSTICS__) return;

  const BUILD = '2026.08.06.private-v1';
  const startedAt = Date.now();
  const bridge = window.__GG_DIAG__;
  const counters = Object.create(null);
  const tokenMaps = {
    route: new Map(),
    selector: new Map(),
    source: new Map(),
    error: new Map(),
    value: new Map(),
    api: new Map(),
    callback: new Map()
  };

  function token(group, value, prefix) {
    const map = tokenMaps[group];
    const key = String(value == null ? '' : value);
    if (!key) return prefix + '0';
    if (map.has(key)) return map.get(key);
    const created = prefix + (map.size + 1);
    map.set(key, created);
    return created;
  }

  function countBucket(value) {
    const count = Number(value) || 0;
    if (count <= 0) return '0';
    if (count === 1) return '1';
    if (count <= 5) return '2-5';
    if (count <= 20) return '6-20';
    if (count <= 100) return '21-100';
    return '101+';
  }

  function sizeBucket(value) {
    const size = Number(value) || 0;
    if (size <= 0) return '0B';
    if (size < 100) return '1-99B';
    if (size < 1024) return '100B-1K';
    if (size < 10240) return '1K-10K';
    if (size < 102400) return '10K-100K';
    return '100K+';
  }

  function durationBucket(value) {
    const ms = Math.max(0, Number(value) || 0);
    if (ms < 25) return '0-24ms';
    if (ms < 100) return '25-99ms';
    if (ms < 250) return '100-249ms';
    if (ms < 500) return '250-499ms';
    if (ms < 1000) return '500-999ms';
    if (ms < 2000) return '1-2s';
    if (ms < 5000) return '2-5s';
    return '5s+';
  }

  function broadContentType(value) {
    const text = String(value || '').toLowerCase();
    if (text.indexOf('json') >= 0) return 'json';
    if (text.indexOf('javascript') >= 0 || text.indexOf('ecmascript') >= 0) return 'script';
    if (text.indexOf('html') >= 0) return 'html';
    if (text.indexOf('image/') >= 0) return 'image';
    if (text.indexOf('font') >= 0 || text.indexOf('woff') >= 0) return 'font';
    if (text.indexOf('audio') >= 0 || text.indexOf('video') >= 0) return 'media';
    if (text.indexOf('octet-stream') >= 0) return 'binary';
    if (text.indexOf('text/') >= 0) return 'text';
    return 'other';
  }

  function safeMethod(value) {
    const method = String(value || 'GET').toUpperCase();
    return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : 'other';
  }

  function routeToken(value) {
    try {
      const parsed = new URL(String(value == null ? '' : value), location.href);
      return token('route', parsed.origin + parsed.pathname, 'R');
    } catch (_) {
      return token('route', String(value == null ? '' : value), 'R');
    }
  }

  function sourceToken(value) {
    return token('source', String(value == null ? '' : value), 'S');
  }

  function selectorToken(value) {
    return token('selector', String(value == null ? '' : value), 'Q');
  }

  function callbackToken(value) {
    return token('callback', String(value == null ? '' : value), 'C');
  }

  function errorToken(value) {
    return token('error', String(value == null ? '' : value), 'E');
  }

  function apiToken(value) {
    return token('api', String(value == null ? '' : value), 'A');
  }

  function numberShape(value) {
    if (!Number.isFinite(value)) return { type: 'number', class: 'non-finite' };
    if (value === 0) return { type: 'number', class: 'zero' };
    const abs = Math.abs(value);
    let magnitude = 'large';
    if (abs < 1) magnitude = 'fraction';
    else if (abs < 10) magnitude = 'small';
    else if (abs < 1000) magnitude = 'medium';
    return { type: 'number', sign: value > 0 ? 'positive' : 'negative', magnitude: magnitude, integer: Number.isInteger(value) };
  }

  function objectShape(value, depth) {
    let keyCount = 0;
    let typeCounts = Object.create(null);
    try {
      const keys = Object.keys(value);
      keyCount = keys.length;
      keys.slice(0, 24).forEach(function (key) {
        let type = 'unknown';
        try {
          const item = value[key];
          type = item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
        } catch (_) {}
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
    } catch (_) {}
    const safeCounts = {};
    Object.keys(typeCounts).slice(0, 10).forEach(function (key) { safeCounts[key] = countBucket(typeCounts[key]); });
    return { type: 'object', keyCount: countBucket(keyCount), valueTypes: safeCounts, depthLimited: depth >= 2 };
  }

  function shape(value, depth) {
    const level = depth || 0;
    if (level > 2) return { type: typeof value, depthLimited: true };
    if (value == null) return { type: String(value) };
    const type = typeof value;
    if (type === 'string') return { type: 'string', size: sizeBucket(value.length) };
    if (type === 'number') return numberShape(value);
    if (type === 'boolean') return { type: 'boolean', value: value };
    if (type === 'undefined') return { type: 'undefined' };
    if (type === 'function') return { type: 'function', arity: countBucket(value.length) };
    if (Array.isArray(value)) {
      return { type: 'array', length: countBucket(value.length), sampleTypes: value.slice(0, 6).map(function (item) { return item == null ? String(item) : Array.isArray(item) ? 'array' : typeof item; }) };
    }
    if (value instanceof Error) {
      const name = /^(TypeError|RangeError|ReferenceError|SyntaxError|Error)$/.test(String(value.name)) ? String(value.name) : 'other';
      return { type: 'error', class: name, errorId: errorToken(String(value.name) + '|' + String(value.message) + '|' + String(value.stack)), stackPresent: !!value.stack };
    }
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return { type: 'node', nodeType: value.nodeType, connected: !!value.isConnected };
    }
    return objectShape(value, level);
  }

  function emit(event, detail) {
    try {
      if (!bridge || typeof bridge.emit !== 'function') return;
      bridge.emit(JSON.stringify({ event: String(event || 'event').replace(/[^A-Za-z0-9_.:/-]/g, '_'), detail: detail || {} }));
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
    routeToken: routeToken,
    sourceToken: sourceToken,
    selectorToken: selectorToken,
    callbackToken: callbackToken,
    errorToken: errorToken,
    apiToken: apiToken,
    countBucket: countBucket,
    sizeBucket: sizeBucket,
    durationBucket: durationBucket,
    broadContentType: broadContentType,
    counters: counters,
    startedAt: startedAt
  };

  emit('diagnostics_installed', {
    build: BUILD,
    readyState: document.readyState,
    route: routeToken(location.href),
    bridgePresent: !!bridge
  });

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    try {
      const original = console[level];
      if (typeof original !== 'function' || original.__ggPrivateWrapped) return;
      const wrapped = function () {
        const args = Array.prototype.slice.call(arguments);
        emit('console_' + level, { argCount: countBucket(args.length), args: args.slice(0, 8).map(function (item) { return shape(item, 0); }) });
        return original.apply(this, args);
      };
      wrapped.__ggPrivateWrapped = true;
      console[level] = wrapped;
    } catch (_) {}
  });

  window.addEventListener('error', function (event) {
    const error = event.error;
    const errorClass = error && /^(TypeError|RangeError|ReferenceError|SyntaxError|Error)$/.test(String(error.name)) ? String(error.name) : 'other';
    emit('window_error', {
      errorClass: errorClass,
      errorId: errorToken(String(event.message) + '|' + String(error && error.stack)),
      source: sourceToken(event.filename || ''),
      lineBand: event.lineno ? countBucket(Math.ceil(event.lineno / 250)) : '0',
      columnPresent: !!event.colno
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    emit('unhandled_rejection', { reason: shape(event.reason, 0) });
  });

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const begin = performance.now();
      const method = safeMethod((init && init.method) || (input && input.method) || 'GET');
      const target = input && input.url ? input.url : input;
      const route = routeToken(target);
      emit('fetch_start', { method: method, route: route, bodyPresent: !!(init && init.body) });
      return originalFetch.apply(this, arguments).then(function (response) {
        emit('fetch_end', {
          method: method,
          route: route,
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          responseClass: broadContentType(response.headers && response.headers.get('content-type')),
          duration: durationBucket(performance.now() - begin)
        });
        return response;
      }, function (error) {
        emit('fetch_error', {
          method: method,
          route: route,
          error: shape(error, 0),
          duration: durationBucket(performance.now() - begin)
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
      this.__ggPrivateDiag = { method: safeMethod(method), route: routeToken(url), headerCount: 0, openedAt: performance.now() };
      return originalOpen.apply(this, arguments);
    };
    proto.setRequestHeader = function () {
      if (this.__ggPrivateDiag) this.__ggPrivateDiag.headerCount += 1;
      return originalSetHeader.apply(this, arguments);
    };
    proto.send = function (body) {
      const meta = this.__ggPrivateDiag || { method: 'GET', route: 'R0', headerCount: 0, openedAt: performance.now() };
      meta.sentAt = performance.now();
      emit('xhr_start', { method: meta.method, route: meta.route, headerCount: countBucket(meta.headerCount), bodyPresent: body != null });
      const finish = () => {
        let responseLength = -1;
        try { if (typeof this.responseText === 'string') responseLength = this.responseText.length; } catch (_) {}
        emit('xhr_end', {
          method: meta.method,
          route: meta.route,
          status: this.status,
          readyState: this.readyState,
          responseClass: broadContentType(this.getResponseHeader('content-type')),
          responseSize: responseLength < 0 ? 'unknown' : sizeBucket(responseLength),
          duration: durationBucket(performance.now() - (meta.sentAt || performance.now()))
        });
      };
      this.addEventListener('loadend', finish, { once: true });
      this.addEventListener('error', function () { emit('xhr_error', { method: meta.method, route: meta.route }); }, { once: true });
      this.addEventListener('timeout', function () { emit('xhr_timeout', { method: meta.method, route: meta.route }); }, { once: true });
      return originalSend.apply(this, arguments);
    };
  }

  function wrapSelectorMethod(owner, name, kind) {
    try {
      const original = owner && owner[name];
      if (typeof original !== 'function' || original.__ggPrivateWrapped) return;
      const wrapped = function (selector) {
        const result = original.apply(this, arguments);
        const selectorId = selectorToken(selector);
        let found = false;
        let count = 0;
        if (kind === 'one') found = !!result;
        else {
          try { count = result ? result.length : 0; } catch (_) {}
          found = count > 0;
        }
        const key = name + ':' + selectorId + ':' + found + ':' + countBucket(count);
        if (sample(key, 3, 50)) emit('dom_query', { operation: kind, selector: selectorId, found: found, count: countBucket(count) });
        return result;
      };
      wrapped.__ggPrivateWrapped = true;
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
        emit('history_' + name, { route: routeToken(url || location.href), state: shape(state, 0) });
        return original.apply(this, arguments);
      };
    } catch (_) {}
  });

  function lifecycle(name, detail) { emit('lifecycle_' + name, detail || {}); }
  document.addEventListener('DOMContentLoaded', function () { lifecycle('dom_content_loaded', { elapsed: durationBucket(Date.now() - startedAt) }); }, { once: true });
  window.addEventListener('load', function () { lifecycle('load', { elapsed: durationBucket(Date.now() - startedAt) }); }, { once: true });
  window.addEventListener('pageshow', function (event) { lifecycle('pageshow', { persisted: !!event.persisted }); });
  window.addEventListener('pagehide', function (event) {
    lifecycle('pagehide', {
      persisted: !!event.persisted,
      domQueryCalls: countBucket(Object.keys(counters).reduce(function (total, key) { return total + counters[key]; }, 0)),
      uniqueQueryStates: countBucket(Object.keys(counters).length)
    });
  });
  window.addEventListener('hashchange', function () { lifecycle('hashchange', { route: routeToken(location.href) }); });
  window.addEventListener('popstate', function () { lifecycle('popstate', { route: routeToken(location.href) }); });
  window.addEventListener('online', function () { lifecycle('online'); });
  window.addEventListener('offline', function () { lifecycle('offline'); });
  document.addEventListener('visibilitychange', function () { lifecycle('visibility', { state: document.visibilityState === 'hidden' ? 'hidden' : 'visible' }); });
})();
