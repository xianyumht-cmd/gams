(function () {
  'use strict';
  const diag = window.__GG_DIAGNOSTICS__;
  if (!diag) return;
  const wrapped = typeof WeakSet === 'function' ? new WeakSet() : null;
  const functionIds = typeof WeakMap === 'function' ? new WeakMap() : null;
  const objectIds = typeof WeakMap === 'function' ? new WeakMap() : null;
  const excludedKeys = new Set(['__GG_DIAGNOSTICS__', '__GG_DIAG__']);

  function emit(event, detail) { diag.emit(event, detail); }
  function shape(value) { return diag.shape(value, 0); }
  function functionId(fn) {
    if (functionIds && functionIds.has(fn)) return functionIds.get(fn);
    const id = diag.token('api', fn);
    if (functionIds) functionIds.set(fn, id);
    return id;
  }
  function objectId(object) {
    if (objectIds && objectIds.has(object)) return objectIds.get(object);
    const id = diag.token('object', object);
    if (objectIds) objectIds.set(object, id);
    return id;
  }

  function wrapFunction(owner, key, sourceKind) {
    let original;
    try { original = owner[key]; } catch (_) { return false; }
    if (typeof original !== 'function') return false;
    if (original.__ggDiagWrapped || (wrapped && wrapped.has(original))) return false;
    const api = functionId(original);
    const proxy = function () {
      const args = Array.prototype.slice.call(arguments);
      const started = performance.now();
      emit('api_call_start', { api: api, sourceKind: sourceKind, argCount: args.length, args: args.slice(0, 12).map(shape) });
      try {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(function (value) {
            emit('api_call_resolve', { api: api, result: shape(value), durationMs: Math.round(performance.now() - started) });
            return value;
          }, function (error) {
            emit('api_call_reject', { api: api, error: shape(error), durationMs: Math.round(performance.now() - started) });
            throw error;
          });
        }
        emit('api_call_return', { api: api, result: shape(result), durationMs: Math.round(performance.now() - started) });
        return result;
      } catch (error) {
        emit('api_call_throw', { api: api, error: shape(error), durationMs: Math.round(performance.now() - started) });
        throw error;
      }
    };
    try {
      proxy.__ggDiagWrapped = true;
      owner[key] = proxy;
      if (wrapped) wrapped.add(original);
      emit('api_wrapped', { api: api, sourceKind: sourceKind, arity: original.length });
      return true;
    } catch (_) {
      return false;
    }
  }

  function scanObjectMethods(object, limit) {
    let wrappedCount = 0;
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return 0;
    let keys = [];
    try { keys = Object.keys(object).slice(0, limit); } catch (_) { return 0; }
    const owner = objectId(object);
    keys.forEach(function (key) {
      if (wrapFunction(object, key, 'object-method')) wrappedCount += 1;
    });
    if (wrappedCount > 0) emit('api_object_inventory', { owner: owner, keyCount: keys.length, wrappedCount: wrappedCount });
    return wrappedCount;
  }

  let scans = 0;
  let previousInventory = -1;
  function scanApis() {
    scans += 1;
    let candidateCount = 0;
    let wrappedCount = 0;
    try {
      Object.getOwnPropertyNames(window).forEach(function (key) {
        if (excludedKeys.has(key) || diag.baselineWindowKeys.has(key)) return;
        candidateCount += 1;
        let value;
        try { value = window[key]; } catch (_) { return; }
        if (typeof value === 'function') {
          if (wrapFunction(window, key, 'new-global-function')) wrappedCount += 1;
        } else if (value && (typeof value === 'object' || typeof value === 'function')) {
          wrappedCount += scanObjectMethods(value, 64);
        }
      });
    } catch (_) {}
    if (candidateCount !== previousInventory || wrappedCount > 0) {
      previousInventory = candidateCount;
      emit('api_inventory', { candidateCount: candidateCount, wrappedCount: wrappedCount, scan: scans });
    }
    if (scans < 40) setTimeout(scanApis, 500);
    else emit('api_scan_complete', { scans: scans, candidateCount: candidateCount });
  }

  emit('payload_executed', {
    elapsedMs: Date.now() - diag.startedAt,
    readyState: document.readyState,
    newGlobalCount: Math.max(0, Object.getOwnPropertyNames(window).length - diag.baselineWindowKeys.size)
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
