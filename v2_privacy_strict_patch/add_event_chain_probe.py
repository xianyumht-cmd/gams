from pathlib import Path

MODULE = Path("v2/android/client")
PRELUDE = MODULE / "src/main/assets/diagnostic-prelude.js"
LOGGER = MODULE / "src/main/java/com/jinli/ggsecure/DiagnosticLogger.java"
BUILD = MODULE / "build.gradle.kts"

prelude = PRELUDE.read_text(encoding="utf-8")
anchor = "  function lifecycle(name, detail) { emit('lifecycle_' + name, detail || {}); }\n"
if prelude.count(anchor) != 1:
    raise SystemExit("event-chain insertion anchor mismatch")

probe = r'''  // Anonymous event-chain probe. It records only session ordinals and broad
  // control-flow facts; no element text, selector, class, id, function name or source.
  (function installPrivateEventChainProbe() {
    if (window.__GG_EVENT_CHAIN__) return;

    const actionableTypes = ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'];
    const actionable = Object.create(null);
    actionableTypes.forEach(function (type) { actionable[type] = true; });

    const targetIds = typeof WeakMap === 'function' ? new WeakMap() : null;
    const listenerEntries = typeof WeakMap === 'function' ? new WeakMap() : null;
    const eventStates = typeof WeakMap === 'function' ? new WeakMap() : null;
    let targetSequence = 0;
    let listenerSequence = 0;
    let actionSequence = 0;

    function eventType(value) {
      const type = String(value || '').toLowerCase();
      return actionable[type] ? type : 'other';
    }

    function phaseName(value) {
      if (value === 1) return 'capture';
      if (value === 2) return 'target';
      if (value === 3) return 'bubble';
      return 'none';
    }

    function targetKind(target) {
      if (target === window) return 'window';
      if (target === document) return 'document';
      if (target && target.nodeType === 1) return 'element';
      return 'other';
    }

    function targetToken(target) {
      if (!target || !targetIds) return 'T0';
      try {
        const known = targetIds.get(target);
        if (known) return known;
        const created = 'T' + (++targetSequence);
        targetIds.set(target, created);
        return created;
      } catch (_) {
        return 'T0';
      }
    }

    function optionCapture(options) {
      return options === true || !!(options && typeof options === 'object' && options.capture);
    }

    function optionFlag(options, name) {
      return !!(options && typeof options === 'object' && options[name]);
    }

    function listenerCallable(listener) {
      return typeof listener === 'function' || !!(listener && typeof listener.handleEvent === 'function');
    }

    function eventState(event) {
      if (!event || !eventStates) return null;
      let state = eventStates.get(event);
      if (state) return state;
      state = {
        action: 'U' + (++actionSequence),
        listenerCalls: 0,
        listenerThrows: 0,
        preventDefaultCalls: 0,
        stopCalls: 0,
        immediateStopCalls: 0,
        captureSeen: false,
        bubbleSeen: false,
        settled: false
      };
      eventStates.set(event, state);
      return state;
    }

    function pathDepth(event) {
      try {
        if (event && typeof event.composedPath === 'function') return countBucket(event.composedPath().length);
      } catch (_) {}
      return 'unknown';
    }

    function propertyHandlerCount(event) {
      let count = 0;
      try {
        const type = eventType(event && event.type);
        const property = 'on' + type;
        const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
        for (let i = 0; i < path.length && i < 32; i += 1) {
          try { if (typeof path[i][property] === 'function') count += 1; } catch (_) {}
        }
      } catch (_) {}
      return countBucket(count);
    }

    function broadEventDetail(event, state) {
      const target = event && event.target;
      return {
        action: state ? state.action : 'U0',
        type: eventType(event && event.type),
        target: targetToken(target),
        targetKind: targetKind(target),
        trusted: !!(event && event.isTrusted),
        defaultPrevented: !!(event && event.defaultPrevented),
        phase: phaseName(event && event.eventPhase),
        pathDepth: pathDepth(event),
        propertyHandlers: propertyHandlerCount(event),
        targetDisabled: !!(target && target.disabled),
        targetInert: !!(target && target.inert),
        targetConnected: !!(target && target.isConnected)
      };
    }

    const proto = typeof EventTarget !== 'undefined' && EventTarget.prototype;
    if (!proto || typeof proto.addEventListener !== 'function' || typeof proto.removeEventListener !== 'function') return;
    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;

    function findEntry(listener, target, type, capture) {
      if (!listenerEntries || !listener || (typeof listener !== 'object' && typeof listener !== 'function')) return null;
      const list = listenerEntries.get(listener);
      if (!list) return null;
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        if (entry.target === target && entry.type === type && entry.capture === capture) return entry;
      }
      return null;
    }

    function callListener(listener, thisValue, event) {
      if (typeof listener === 'function') return listener.call(thisValue, event);
      return listener.handleEvent.call(listener, event);
    }

    proto.addEventListener = function (type, listener, options) {
      const normalized = eventType(type);
      if (!actionable[normalized] || !listenerCallable(listener) || listener.__ggEventChainInternal) {
        return originalAdd.apply(this, arguments);
      }

      const capture = optionCapture(options);
      let entry = findEntry(listener, this, normalized, capture);
      if (!entry) {
        const owner = this;
        entry = {
          id: 'L' + (++listenerSequence),
          target: owner,
          type: normalized,
          capture: capture,
          wrapper: null
        };
        entry.wrapper = function (event) {
          const state = eventState(event);
          if (state) state.listenerCalls += 1;
          const started = performance.now();
          emit('action_listener_enter', {
            action: state ? state.action : 'U0',
            listener: entry.id,
            type: normalized,
            owner: targetToken(owner),
            ownerKind: targetKind(owner),
            phase: phaseName(event && event.eventPhase),
            defaultPrevented: !!(event && event.defaultPrevented)
          });
          try {
            const result = callListener(listener, this, event);
            emit('action_listener_exit', {
              action: state ? state.action : 'U0',
              listener: entry.id,
              type: normalized,
              duration: durationBucket(performance.now() - started),
              defaultPrevented: !!(event && event.defaultPrevented),
              result: shape(result, 0)
            });
            return result;
          } catch (error) {
            if (state) state.listenerThrows += 1;
            emit('action_listener_throw', {
              action: state ? state.action : 'U0',
              listener: entry.id,
              type: normalized,
              error: shape(error, 0),
              duration: durationBucket(performance.now() - started)
            });
            throw error;
          }
        };
        let list = listenerEntries.get(listener);
        if (!list) {
          list = [];
          listenerEntries.set(listener, list);
        }
        list.push(entry);
        emit('action_listener_registered', {
          listener: entry.id,
          type: normalized,
          owner: targetToken(owner),
          ownerKind: targetKind(owner),
          capture: capture,
          once: optionFlag(options, 'once'),
          passive: optionFlag(options, 'passive')
        });
      }
      return originalAdd.call(this, type, entry.wrapper, options);
    };

    proto.removeEventListener = function (type, listener, options) {
      const normalized = eventType(type);
      const capture = optionCapture(options);
      const entry = actionable[normalized] ? findEntry(listener, this, normalized, capture) : null;
      if (entry) {
        emit('action_listener_removed', {
          listener: entry.id,
          type: normalized,
          owner: targetToken(this),
          ownerKind: targetKind(this),
          capture: capture
        });
        return originalRemove.call(this, type, entry.wrapper, options);
      }
      return originalRemove.apply(this, arguments);
    };

    function wrapEventControl(name, stateField) {
      try {
        const original = Event.prototype[name];
        if (typeof original !== 'function') return;
        Event.prototype[name] = function () {
          const type = eventType(this && this.type);
          if (actionable[type]) {
            const state = eventState(this);
            if (state) state[stateField] += 1;
            emit('action_control', {
              action: state ? state.action : 'U0',
              type: type,
              operation: name === 'preventDefault' ? 'preventDefault' : name === 'stopImmediatePropagation' ? 'stopImmediatePropagation' : 'stopPropagation',
              phase: phaseName(this && this.eventPhase),
              defaultPrevented: !!(this && this.defaultPrevented)
            });
          }
          return original.apply(this, arguments);
        };
      } catch (_) {}
    }

    wrapEventControl('preventDefault', 'preventDefaultCalls');
    wrapEventControl('stopPropagation', 'stopCalls');
    wrapEventControl('stopImmediatePropagation', 'immediateStopCalls');

    function internal(listener) {
      listener.__ggEventChainInternal = true;
      return listener;
    }

    actionableTypes.forEach(function (type) {
      originalAdd.call(document, type, internal(function (event) {
        const state = eventState(event);
        if (!state) return;
        state.captureSeen = true;
        emit('action_capture', broadEventDetail(event, state));
        setTimeout(function () {
          if (state.settled) return;
          state.settled = true;
          emit('action_settled', {
            action: state.action,
            type: eventType(event && event.type),
            target: targetToken(event && event.target),
            captureSeen: state.captureSeen,
            bubbleSeen: state.bubbleSeen,
            listenerCalls: countBucket(state.listenerCalls),
            listenerThrows: countBucket(state.listenerThrows),
            preventDefaultCalls: countBucket(state.preventDefaultCalls),
            stopCalls: countBucket(state.stopCalls),
            immediateStopCalls: countBucket(state.immediateStopCalls),
            defaultPrevented: !!(event && event.defaultPrevented),
            propertyHandlers: propertyHandlerCount(event)
          });
        }, 0);
      }), true);

      originalAdd.call(document, type, internal(function (event) {
        const state = eventState(event);
        if (!state) return;
        state.bubbleSeen = true;
        emit('action_bubble', {
          action: state.action,
          type: eventType(event && event.type),
          target: targetToken(event && event.target),
          defaultPrevented: !!(event && event.defaultPrevented)
        });
      }), false);
    });

    window.__GG_EVENT_CHAIN__ = {
      installed: true,
      listenerCount: function () { return listenerSequence; },
      targetCount: function () { return targetSequence; }
    };
    emit('event_chain_probe_installed', { types: countBucket(actionableTypes.length) });
  })();

'''

prelude = prelude.replace("const BUILD = '2026.08.06.private-v1';", "const BUILD = '2026.08.06.private-event-chain-v1';", 1)
prelude = prelude.replace(anchor, probe + anchor, 1)
PRELUDE.write_text(prelude, encoding="utf-8")

logger = LOGGER.read_text(encoding="utf-8")
old_tokens = 'actual.matches("^[RQCSEAV][0-9]{1,5}$")'
new_tokens = 'actual.matches("^[RQCSEAVLTU][0-9]{1,5}$")'
if logger.count(old_tokens) != 1:
    raise SystemExit("anonymous token whitelist anchor mismatch")
logger = logger.replace(old_tokens, new_tokens, 1)
old_enum = 'return value.matches("(?i)^(GET|POST|'
new_enum = 'return value.matches("(?i)^(click|pointerdown|pointerup|touchstart|touchend|mousedown|mouseup|capture|target|bubble|none|window|document|element|preventDefault|stopPropagation|stopImmediatePropagation|GET|POST|'
if logger.count(old_enum) != 1:
    raise SystemExit("safe enum whitelist anchor mismatch")
logger = logger.replace(old_enum, new_enum, 1)
LOGGER.write_text(logger, encoding="utf-8")

build = BUILD.read_text(encoding="utf-8")
if build.count("versionCode = 29") != 1:
    raise SystemExit("code29 export-fix baseline mismatch")
if build.count('versionName = "2.0.18-private-diagnostic-exportfix"') != 1:
    raise SystemExit("export-fix versionName baseline mismatch")
build = build.replace("versionCode = 29", "versionCode = 30", 1)
build = build.replace(
    'versionName = "2.0.18-private-diagnostic-exportfix"',
    'versionName = "2.0.19-private-event-chain"',
    1,
)
BUILD.write_text(build, encoding="utf-8")

final_prelude = PRELUDE.read_text(encoding="utf-8")
for marker in (
    "event_chain_probe_installed",
    "action_listener_registered",
    "action_listener_enter",
    "action_listener_exit",
    "action_listener_throw",
    "action_control",
    "action_capture",
    "action_bubble",
    "action_settled",
    "listenerEntries",
    "originalRemove.call(this, type, entry.wrapper, options)",
):
    if marker not in final_prelude:
        raise SystemExit("missing event-chain marker: " + marker)

for forbidden in ("innerText", "textContent", "className", "outerHTML", "function.name"):
    if forbidden in final_prelude:
        raise SystemExit("event-chain privacy guard failed: " + forbidden)

print("Applied anonymous event-chain probe, versionCode=30")
