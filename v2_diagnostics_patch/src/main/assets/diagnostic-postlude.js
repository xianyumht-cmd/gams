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
    if (scans < 80) setTimeout(scanApis, 500);
    else emit('api_scan_complete', { scans: scans, inventory: 'api#' + lastInventory });
  }

  emit('payload_executed', {
    elapsedMs: Date.now() - diag.startedAt,
    readyState: document.readyState,
    remoteInstalled: !!window.__REMOTE_SCRIPT_INSTALLED__,
    v2ControlLoaded: !!window.__GG_V2_CONTROL_LOADED__
  });
  scanApis();

  // Targeted, observation-only JSONP lifecycle probe. It never blocks, rewrites,
  // invokes, or replaces the page callback and never records raw URLs or IDs.
  (function installJsonpOrderProbe() {
    if (window.__GG_JSONP_ORDER_PROBE__) return;
    window.__GG_JSONP_ORDER_PROBE__ = true;

    const originalCreateElement = document.createElement;
    const nativeSetAttribute = Element.prototype.setAttribute;
    const seenScripts = typeof WeakMap === 'function' ? new WeakMap() : null;
    let orderSequence = 0;
    let lastOrderAt = 0;
    let lastOrder = null;

    function parseOrder(value) {
      const text = String(value == null ? '' : value);
      if (text.toLowerCase().indexOf('createbuyorder') < 0) return null;
      try {
        const parsed = new URL(text, location.href);
        const callback = parsed.searchParams.get('jsonCallback') || parsed.searchParams.get('callback') || '';
        const goods = parsed.searchParams.get('goods_id') || '';
        const buyNum = parsed.searchParams.get('buy_num') || '';
        return {
          url: diag.urlFingerprint(text),
          callbackName: callback,
          callback: callback ? 'cb#' + diag.hash(callback) : 'none',
          goods: goods ? 'goods#' + diag.hash(goods) : 'none',
          buyNum: /^\d{1,6}$/.test(buyNum) ? Number(buyNum) : -1
        };
      } catch (_) {
        return {
          url: diag.urlFingerprint(text),
          callbackName: '',
          callback: 'invalid',
          goods: 'invalid',
          buyNum: -1
        };
      }
    }

    function callbackState(name) {
      if (!name) return { type: 'missing', sameAsPrevious: false };
      let value;
      try { value = window[name]; } catch (_) { return { type: 'unreadable', sameAsPrevious: false }; }
      return {
        type: safeName(typeof value),
        functionName: typeof value === 'function' ? safeName(value.name) : '',
        hasOriginal: !!(value && value.__ggOriginalCallback),
        sameAsPrevious: !!(lastOrder && lastOrder.callbackName === name && lastOrder.callbackRef === value),
        ref: value
      };
    }

    function publicState(state) {
      return {
        type: state.type,
        functionName: state.functionName || '',
        hasOriginal: !!state.hasOriginal,
        sameAsPrevious: !!state.sameAsPrevious
      };
    }

    function observeScript(script, value, source) {
      const meta = parseOrder(value);
      if (!meta) return;
      const prior = seenScripts && seenScripts.get(script);
      const urlHash = diag.hash(String(value));
      if (prior && prior.urlHash === urlHash && Date.now() - prior.at < 250) return;

      const callbackBefore = callbackState(meta.callbackName);
      const sequence = ++orderSequence;
      const record = {
        sequence: sequence,
        at: Date.now(),
        urlHash: urlHash,
        callbackName: meta.callbackName,
        callbackRef: callbackBefore.ref
      };
      if (seenScripts) seenScripts.set(script, record);
      lastOrderAt = record.at;
      lastOrder = record;

      emit('order_jsonp_src', {
        sequence: sequence,
        source: safeName(source),
        url: meta.url,
        callback: meta.callback,
        goods: meta.goods,
        buyNum: meta.buyNum,
        callbackBefore: publicState(callbackBefore),
        connected: !!script.isConnected
      });

      if (!script.__ggOrderProbeEvents) {
        script.__ggOrderProbeEvents = true;
        script.addEventListener('load', function () {
          const state = callbackState(meta.callbackName);
          emit('order_jsonp_load', {
            sequence: sequence,
            elapsedMs: Date.now() - record.at,
            callback: meta.callback,
            callbackAfter: publicState(state),
            connected: !!script.isConnected
          });
        });
        script.addEventListener('error', function () {
          const state = callbackState(meta.callbackName);
          emit('order_jsonp_error', {
            sequence: sequence,
            elapsedMs: Date.now() - record.at,
            callback: meta.callback,
            callbackAfter: publicState(state),
            connected: !!script.isConnected
          });
        });
      }

      [0, 100, 500, 1500].forEach(function (delay) {
        setTimeout(function () {
          const state = callbackState(meta.callbackName);
          emit('order_callback_state', {
            sequence: sequence,
            delayMs: delay,
            callback: meta.callback,
            state: publicState(state),
            documentState: safeName(document.readyState),
            visibility: safeName(document.visibilityState)
          });
        }, delay);
      });
    }

    function patchScript(script) {
      if (!script || script.__ggJsonpOrderProbePatched) return script;
      script.__ggJsonpOrderProbePatched = true;

      try {
        const descriptor = Object.getOwnPropertyDescriptor(script, 'src');
        if (descriptor && typeof descriptor.set === 'function' && descriptor.configurable !== false) {
          Object.defineProperty(script, 'src', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: descriptor.get ? function () { return descriptor.get.call(this); } : undefined,
            set: function (value) {
              observeScript(this, value, 'property');
              return descriptor.set.call(this, value);
            }
          });
        }
      } catch (error) {
        emit('order_probe_patch_error', { stage: 'property', error: shape(error) });
      }

      try {
        const existingSetAttribute = script.setAttribute;
        script.setAttribute = function (name, value) {
          if (String(name).toLowerCase() === 'src') observeScript(this, value, 'attribute');
          return existingSetAttribute.apply(this, arguments);
        };
      } catch (error) {
        emit('order_probe_patch_error', { stage: 'attribute', error: shape(error) });
      }
      return script;
    }

    document.createElement = function (tagName) {
      const element = originalCreateElement.apply(this, arguments);
      if (String(tagName).toLowerCase() === 'script') patchScript(element);
      return element;
    };

    try {
      const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (!node || node.nodeType !== 1) return;
            if (String(node.tagName).toLowerCase() === 'script') {
              patchScript(node);
              const src = node.getAttribute && node.getAttribute('src');
              if (src) observeScript(node, src, 'mutation');
            }
            if (node.querySelectorAll) {
              Array.prototype.forEach.call(node.querySelectorAll('script[src]'), function (child) {
                patchScript(child);
                observeScript(child, child.getAttribute('src'), 'mutation-descendant');
              });
            }
          });
        });
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (error) {
      emit('order_probe_patch_error', { stage: 'observer', error: shape(error) });
    }

    function recentOrderDetail() {
      return {
        recentOrder: lastOrderAt > 0,
        orderAgeMs: lastOrderAt > 0 ? Date.now() - lastOrderAt : -1,
        orderSequence: lastOrder ? lastOrder.sequence : 0
      };
    }

    window.addEventListener('beforeunload', function () {
      emit('navigation_beforeunload', recentOrderDetail());
    }, true);
    window.addEventListener('pagehide', function (event) {
      const detail = recentOrderDetail();
      detail.persisted = !!event.persisted;
      emit('navigation_pagehide_after_order', detail);
    }, true);
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
      if (!target) return;
      emit('ui_click', {
        tag: safeName(target.tagName),
        id: target.id ? 'id#' + diag.hash(target.id) : 'none',
        className: target.className ? 'class#' + diag.hash(String(target.className)) : 'none',
        textLength: String(target.textContent || '').trim().length,
        recentOrder: lastOrderAt > 0 && Date.now() - lastOrderAt < 5000
      });
    }, true);

    emit('order_jsonp_probe_installed', {
      createElementWrapped: document.createElement !== originalCreateElement,
      nativeSetAttributeAvailable: typeof nativeSetAttribute === 'function'
    });
  })();

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
