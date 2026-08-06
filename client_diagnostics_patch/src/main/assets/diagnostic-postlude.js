(function () {
  'use strict';
  const diag = window.__GG_DIAGNOSTICS__;
  if (!diag) return;
  const wrapped = typeof WeakSet === 'function' ? new WeakSet() : null;

  function emit(event, detail) { diag.emit(event, detail); }
  function shape(value) { return diag.shape(value, 0); }
  function safeName(value) {
    const text = String(value == null ? '' : value);
    return /^[A-Za-z0-9_$.:/-]{1,96}$/.test(text) ? text : 'id#' + diag.hash(text);
  }

  function wrapFunction(owner, key, path) {
    let original;
    try { original = owner[key]; } catch (_) { return false; }
    if (typeof original !== 'function') return false;
    if (original.__ggDiagWrapped || (wrapped && wrapped.has(original))) return false;
    const proxy = function () {
      const args = Array.prototype.slice.call(arguments);
      const started = performance.now();
      emit('api_call_start', { api: safeName(path), args: args.slice(0, 12).map(shape) });
      try {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(function (value) {
            emit('api_call_resolve', { api: safeName(path), result: shape(value), durationMs: Math.round(performance.now() - started) });
            return value;
          }, function (error) {
            emit('api_call_reject', { api: safeName(path), error: shape(error), durationMs: Math.round(performance.now() - started) });
            throw error;
          });
        }
        emit('api_call_return', { api: safeName(path), result: shape(result), durationMs: Math.round(performance.now() - started) });
        return result;
      } catch (error) {
        emit('api_call_throw', { api: safeName(path), error: shape(error), durationMs: Math.round(performance.now() - started) });
        throw error;
      }
    };
    try {
      Object.defineProperty(proxy, 'name', { value: original.name || String(key), configurable: true });
      proxy.__ggDiagWrapped = true;
      proxy.__ggDiagOriginal = original;
      owner[key] = proxy;
      if (wrapped) wrapped.add(original);
      emit('api_wrapped', { api: safeName(path), arity: original.length });
      return true;
    } catch (_) {
      return false;
    }
  }

  let lastInventory = '';
  let scans = 0;
  function scanApis() {
    scans += 1;
    const names = [];
    try {
      Object.getOwnPropertyNames(window).forEach(function (key) {
        if (key.indexOf('noname.') === 0) {
          names.push(key);
          wrapFunction(window, key, 'window[' + key + ']');
        }
      });
    } catch (_) {}
    try {
      const object = window.noname;
      if (object && (typeof object === 'object' || typeof object === 'function')) {
        Object.keys(object).forEach(function (key) {
          names.push('noname.' + key);
          wrapFunction(object, key, 'noname.' + key);
        });
      }
    } catch (_) {}
    names.sort();
    const fingerprint = diag.hash(names.join('|'));
    if (fingerprint !== lastInventory) {
      lastInventory = fingerprint;
      emit('api_inventory', { count: names.length, fingerprint: 'api#' + fingerprint, sample: names.slice(0, 20).map(safeName) });
    }
    if (scans < 40) setTimeout(scanApis, 500);
    else emit('api_scan_complete', { scans: scans, inventory: 'api#' + lastInventory });
  }

  emit('payload_executed', {
    elapsedMs: Date.now() - diag.startedAt,
    readyState: document.readyState,
    remoteInstalled: !!window.__REMOTE_SCRIPT_INSTALLED__,
    quickWebInstalled: !!window.__QUICK_WEB_APP_SCRIPT_LOADED__
  });
  scanApis();

  setTimeout(function () {
    let shadowRoots = 0;
    try {
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i += 1) if (all[i].shadowRoot) shadowRoots += 1;
    } catch (_) {}
    emit('dom_snapshot', {
      readyState: document.readyState,
      scripts: document.scripts ? document.scripts.length : 0,
      frames: window.frames ? window.frames.length : 0,
      forms: document.forms ? document.forms.length : 0,
      buttons: document.querySelectorAll('button,[role="button"]').length,
      inputs: document.querySelectorAll('input,textarea,select').length,
      shadowRoots: shadowRoots
    });
  }, 1500);
})();
