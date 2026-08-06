(function () {
  'use strict';
  const diag = window.__GG_DIAGNOSTICS__;
  if (!diag) return;
  const wrapped = typeof WeakSet === 'function' ? new WeakSet() : null;

  function emit(event, detail) { diag.emit(event, detail); }
  function shape(value) { return diag.shape(value, 0); }

  function wrapFunction(owner, key, path) {
    let original;
    try { original = owner[key]; } catch (_) { return false; }
    if (typeof original !== 'function') return false;
    if (original.__ggPrivateDiagWrapped || (wrapped && wrapped.has(original))) return false;
    const api = diag.apiToken(path);
    const proxy = function () {
      const args = Array.prototype.slice.call(arguments);
      const started = performance.now();
      emit('api_call_start', { api: api, argCount: diag.countBucket(args.length), args: args.slice(0, 8).map(shape) });
      try {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then(function (value) {
            emit('api_call_resolve', { api: api, result: shape(value), duration: diag.durationBucket(performance.now() - started) });
            return value;
          }, function (error) {
            emit('api_call_reject', { api: api, error: shape(error), duration: diag.durationBucket(performance.now() - started) });
            throw error;
          });
        }
        emit('api_call_return', { api: api, result: shape(result), duration: diag.durationBucket(performance.now() - started) });
        return result;
      } catch (error) {
        emit('api_call_throw', { api: api, error: shape(error), duration: diag.durationBucket(performance.now() - started) });
        throw error;
      }
    };
    try {
      proxy.__ggPrivateDiagWrapped = true;
      proxy.__ggPrivateDiagOriginal = original;
      owner[key] = proxy;
      if (wrapped) wrapped.add(original);
      emit('api_wrapped', { api: api, arity: diag.countBucket(original.length) });
      return true;
    } catch (_) {
      return false;
    }
  }

  let lastInventoryCount = -1;
  let scans = 0;
  function scanApis() {
    scans += 1;
    const entries = [];
    try {
      Object.getOwnPropertyNames(window).forEach(function (key) {
        if (key.indexOf('noname.') === 0) {
          entries.push(diag.apiToken('window|' + key));
          wrapFunction(window, key, 'window|' + key);
        }
      });
    } catch (_) {}
    try {
      const object = window.noname;
      if (object && (typeof object === 'object' || typeof object === 'function')) {
        Object.keys(object).forEach(function (key) {
          entries.push(diag.apiToken('object|' + key));
          wrapFunction(object, key, 'object|' + key);
        });
      }
    } catch (_) {}
    if (entries.length !== lastInventoryCount) {
      lastInventoryCount = entries.length;
      emit('api_inventory', { count: diag.countBucket(entries.length), sample: entries.slice(0, 12) });
    }
    if (scans < 80) setTimeout(scanApis, 500);
    else emit('api_scan_complete', { scans: diag.countBucket(scans), inventoryCount: diag.countBucket(entries.length) });
  }

  emit('payload_executed', {
    elapsed: diag.durationBucket(Date.now() - diag.startedAt),
    readyState: document.readyState,
    remoteInstalled: !!window.__REMOTE_SCRIPT_INSTALLED__,
    controlLoaded: !!window.__GG_V2_CONTROL_LOADED__
  });
  scanApis();

  // Generic observation-only dynamic script / JSONP probe. It does not know or
  // store any endpoint name, parameter name, identifier, page text, or result body.
  (function installDynamicScriptProbe() {
    if (window.__GG_PRIVATE_DYNAMIC_SCRIPT_PROBE__) return;
    window.__GG_PRIVATE_DYNAMIC_SCRIPT_PROBE__ = true;

    const originalCreateElement = document.createElement;
    const seenScripts = typeof WeakMap === 'function' ? new WeakMap() : null;
    let sequence = 0;
    let lastActionAt = 0;
    let lastActionSequence = 0;

    function discoverCallback(value) {
      try {
        const parsed = new URL(String(value), location.href);
        let callback = '';
        let queryCount = 0;
        parsed.searchParams.forEach(function (item) {
          queryCount += 1;
          if (!callback && item && typeof window[item] === 'function') callback = item;
        });
        return {
          route: diag.routeToken(parsed.href),
          callbackName: callback,
          callback: callback ? diag.callbackToken(callback) : 'C0',
          queryCount: diag.countBucket(queryCount)
        };
      } catch (_) {
        return { route: diag.routeToken(value), callbackName: '', callback: 'C0', queryCount: '0' };
      }
    }

    function callbackState(name, previousRef) {
      if (!name) return { type: 'missing', hasOriginal: false, sameAsPrevious: false, ref: null };
      let value;
      try { value = window[name]; } catch (_) { return { type: 'unreadable', hasOriginal: false, sameAsPrevious: false, ref: null }; }
      return {
        type: typeof value,
        hasOriginal: !!(value && value.__ggOriginalCallback),
        sameAsPrevious: !!previousRef && previousRef === value,
        ref: value
      };
    }

    function publicState(state) {
      return {
        type: /^(function|undefined|object|string|number|boolean)$/.test(state.type) ? state.type : 'other',
        hasOriginal: !!state.hasOriginal,
        sameAsPrevious: !!state.sameAsPrevious
      };
    }

    function observeScript(script, value, source) {
      const text = String(value == null ? '' : value);
      if (!text) return;
      const meta = discoverCallback(text);
      const prior = seenScripts && seenScripts.get(script);
      if (prior && prior.route === meta.route && Date.now() - prior.at < 250) return;

      const currentSequence = ++sequence;
      const before = callbackState(meta.callbackName, prior && prior.callbackRef);
      const record = {
        sequence: currentSequence,
        at: Date.now(),
        route: meta.route,
        callbackName: meta.callbackName,
        callbackRef: before.ref
      };
      if (seenScripts) seenScripts.set(script, record);
      lastActionAt = record.at;
      lastActionSequence = currentSequence;

      emit('dynamic_script_start', {
        sequenceClass: diag.countBucket(currentSequence),
        source: /^(property|attribute|mutation)$/.test(source) ? source : 'other',
        route: meta.route,
        callback: meta.callback,
        queryCount: meta.queryCount,
        callbackBefore: publicState(before),
        connected: !!script.isConnected
      });

      if (!script.__ggPrivateProbeEvents) {
        script.__ggPrivateProbeEvents = true;
        script.addEventListener('load', function () {
          const state = callbackState(meta.callbackName, before.ref);
          emit('dynamic_script_load', {
            sequenceClass: diag.countBucket(currentSequence),
            route: meta.route,
            callback: meta.callback,
            duration: diag.durationBucket(Date.now() - record.at),
            callbackAfter: publicState(state),
            connected: !!script.isConnected
          });
        });
        script.addEventListener('error', function () {
          const state = callbackState(meta.callbackName, before.ref);
          emit('dynamic_script_error', {
            sequenceClass: diag.countBucket(currentSequence),
            route: meta.route,
            callback: meta.callback,
            duration: diag.durationBucket(Date.now() - record.at),
            callbackAfter: publicState(state),
            connected: !!script.isConnected
          });
        });
      }

      [0, 100, 500, 1500].forEach(function (delay) {
        setTimeout(function () {
          const state = callbackState(meta.callbackName, before.ref);
          emit('callback_state', {
            sequenceClass: diag.countBucket(currentSequence),
            delay: diag.durationBucket(delay),
            callback: meta.callback,
            state: publicState(state),
            documentState: document.readyState,
            visibility: document.visibilityState === 'hidden' ? 'hidden' : 'visible'
          });
        }, delay);
      });
    }

    function patchScript(script) {
      if (!script || script.__ggPrivateDynamicScriptPatched) return script;
      script.__ggPrivateDynamicScriptPatched = true;

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
        emit('dynamic_probe_error', { stage: 'property', error: shape(error) });
      }

      try {
        const existingSetAttribute = script.setAttribute;
        script.setAttribute = function (name, value) {
          if (String(name).toLowerCase() === 'src') observeScript(this, value, 'attribute');
          return existingSetAttribute.apply(this, arguments);
        };
      } catch (error) {
        emit('dynamic_probe_error', { stage: 'attribute', error: shape(error) });
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
                observeScript(child, child.getAttribute('src'), 'mutation');
              });
            }
          });
        });
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (error) {
      emit('dynamic_probe_error', { stage: 'observer', error: shape(error) });
    }

    function recentAction() {
      return {
        recentAction: lastActionAt > 0,
        actionAge: lastActionAt > 0 ? diag.durationBucket(Date.now() - lastActionAt) : 'none',
        actionSequenceClass: diag.countBucket(lastActionSequence)
      };
    }

    window.addEventListener('beforeunload', function () {
      emit('navigation_beforeunload', recentAction());
    }, true);
    window.addEventListener('pagehide', function (event) {
      const detail = recentAction();
      detail.persisted = !!event.persisted;
      emit('navigation_pagehide_after_action', detail);
    }, true);
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
      if (!target) return;
      emit('ui_action', {
        targetKind: String(target.tagName).toLowerCase() === 'a' ? 'link' : String(target.tagName).toLowerCase() === 'button' ? 'button' : 'other',
        recentDynamicAction: lastActionAt > 0 && Date.now() - lastActionAt < 5000
      });
    }, true);

    emit('dynamic_script_probe_installed', { enabled: true });
  })();

  setTimeout(function () {
    let shadowRoots = 0;
    try {
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i += 1) if (all[i].shadowRoot) shadowRoots += 1;
    } catch (_) {}
    emit('dom_snapshot', {
      readyState: document.readyState,
      scripts: diag.countBucket(document.scripts ? document.scripts.length : 0),
      frames: diag.countBucket(window.frames ? window.frames.length : 0),
      forms: diag.countBucket(document.forms ? document.forms.length : 0),
      buttons: diag.countBucket(document.querySelectorAll('button,[role="button"]').length),
      inputs: diag.countBucket(document.querySelectorAll('input,textarea,select').length),
      shadowRoots: diag.countBucket(shadowRoots)
    });
  }, 1500);
})();
