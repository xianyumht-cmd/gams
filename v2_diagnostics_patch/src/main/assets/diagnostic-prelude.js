(function () {
  'use strict';
  if (window.__GG_DIAGNOSTICS__) return;

  const BUILD = '2026.08.06.v2';
  const startedAt = Date.now();
  const bridge = window.__GG_DIAG__;
  const counters = Object.create(null);

  function hash(value) {
    const text = String(value == null ? '' : value);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function safeName(value) {
    const text = String(value == null ? '' : value);
    return /^[A-Za-z0-9_$.:/-]{1,96}$/.test(text) ? text : 'id#' + hash(text);
  }

  function shape(value, depth) {
    if (depth > 2) return { type: typeof value };
    if (value == null) return { type: String(value) };
    const type = typeof value;
    if (type === 'string') return { type: 'string', length: value.length, hash: hash(value) };
    if (type === 'number' || type === 'boolean') return { type: type, value: value };
    if (type === 'function') return { type: 'function', name: safeName(value.name), length: value.length };
    if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 4).map(v => shape(v, depth + 1)) };
    if (value instanceof Error) return { type: 'error', name: safeName(value.name), messageHash: hash(value.message), stackHash: hash(value.stack) };
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return { type: 'node', nodeType: value.nodeType, tag: safeName(value.nodeName), connected: !!value.isConnected };
    }
    let keys = [];
    try { keys = Object.keys(value).slice(0, 12).map(safeName); } catch (_) {}
    return { type: 'object', ctor: safeName(value && value.constructor && value.constructor.name), keys: keys };
  }

  function urlFingerprint(value) {
    try {
      const parsed = new URL(String(value), location.href);
      return {
        scheme: safeName(parsed.protocol.replace(':', '')),
        host: 'host#' + hash(parsed.host),
        path: 'path#' + hash(parsed.pathname),
        query: !!parsed.search,
        fragment: !!parsed.hash
      };
    } catch (_) {
      return { value: 'url#' + hash(value) };
    }
  }

  function emit(event, detail) {
    try {
      if (!bridge || typeof bridge.emit !== 'function') return;
      bridge.emit(JSON.stringify({ event: safeName(event), detail: detail || {} }));
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
    hash: hash,
    shape: shape,
    urlFingerprint: urlFingerprint,
    counters: counters,
    startedAt: startedAt
  };

  emit('diagnostics_installed', {
    build: BUILD,
    readyState: document.readyState,
    href: urlFingerprint(location.href),
    hasBridge: !!bridge,
    userAgentHash: hash(navigator.userAgent)
  });

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    try {
      const original = console[level];
      if (typeof original !== 'function' || original.__ggWrapped) return;
      const wrapped = function () {
        const args = Array.prototype.slice.call(arguments);
        emit('console_' + level, { count: args.length, args: args.slice(0, 8).map(v => shape(v, 0)) });
        return original.apply(this, args);
      };
      wrapped.__ggWrapped = true;
      console[level] = wrapped;
    } catch (_) {}
  });

  window.addEventListener('error', function (event) {
    emit('window_error', {
      name: safeName(event.error && event.error.name),
      messageHash: hash(event.message),
      source: urlFingerprint(event.filename || ''),
      line: event.lineno || 0,
      column: event.colno || 0,
      stackHash: hash(event.error && event.error.stack)
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    emit('unhandled_rejection', { reason: shape(event.reason, 0) });
  });

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const begin = performance.now();
      const method = safeName((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const target = input && input.url ? input.url : input;
      const request = { method: method, url: urlFingerprint(target), bodyPresent: !!(init && init.body) };
      emit('fetch_start', request);
      return originalFetch.apply(this, arguments).then(function (response) {
        emit('fetch_end', {
          method: method,
          url: request.url,
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          type: safeName(response.type),
          contentType: safeName((response.headers && response.headers.get('content-type') || '').split(';')[0]),
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
      this.__ggDiag = { method: safeName(method).toUpperCase(), url: urlFingerprint(url), headers: [], openedAt: performance.now() };
      return originalOpen.apply(this, arguments);
    };
    proto.setRequestHeader = function (name) {
      if (this.__ggDiag && this.__ggDiag.headers.length < 20) this.__ggDiag.headers.push(safeName(name));
      return originalSetHeader.apply(this, arguments);
    };
    proto.send = function (body) {
      const meta = this.__ggDiag || { method: 'GET', url: { value: 'unknown' }, headers: [] };
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
          readyState: this.readyState,
          responseType: safeName(this.responseType || 'text'),
          responseLength: responseLength,
          contentType: safeName((this.getResponseHeader('content-type') || '').split(';')[0]),
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
        const selectorHash = hash(selector);
        let found = false;
        let count = 0;
        if (kind === 'one') found = !!result;
        else {
          try { count = result ? result.length : 0; } catch (_) {}
          found = count > 0;
        }
        const key = name + ':' + selectorHash + ':' + found + ':' + count;
        if (sample(key, 4, 50)) emit('dom_query', { operation: name, selector: 'sel#' + selectorHash, found: found, count: count });
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
        emit('history_' + name, { url: urlFingerprint(url || location.href), state: shape(state, 0) });
        return original.apply(this, arguments);
      };
    } catch (_) {}
  });

  function lifecycle(name, detail) { emit('lifecycle_' + name, detail || {}); }
  document.addEventListener('DOMContentLoaded', function () { lifecycle('dom_content_loaded', { elapsedMs: Date.now() - startedAt }); }, { once: true });
  window.addEventListener('load', function () { lifecycle('load', { elapsedMs: Date.now() - startedAt }); }, { once: true });
  window.addEventListener('pageshow', function (event) { lifecycle('pageshow', { persisted: !!event.persisted }); });
  window.addEventListener('pagehide', function (event) { lifecycle('pagehide', { persisted: !!event.persisted, counters: counters }); });
  window.addEventListener('hashchange', function () { lifecycle('hashchange', { href: urlFingerprint(location.href) }); });
  window.addEventListener('popstate', function () { lifecycle('popstate', { href: urlFingerprint(location.href) }); });
  window.addEventListener('online', function () { lifecycle('online'); });
  window.addEventListener('offline', function () { lifecycle('offline'); });
  document.addEventListener('visibilitychange', function () { lifecycle('visibility', { state: safeName(document.visibilityState) }); });
})();
