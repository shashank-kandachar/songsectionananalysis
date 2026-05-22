(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const state = {
    payload: null,
    queue: [],
    index: 0,
    done: {},
    panel: null,
    highlighted: null,
    settings: {
      autoAdvance: true,
      autoCopy: true
    }
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function splitTags(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    return String(value || '').split(/[,;|]/).map(clean).filter(Boolean);
  }

  function storageGet(keys) {
    try {
      const maybePromise = api.storage.local.get(keys);
      if (maybePromise && typeof maybePromise.then === 'function') return maybePromise;
    } catch (error) {
      // Fall back to callback-style extension APIs.
    }
    return new Promise((resolve) => api.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    try {
      const maybePromise = api.storage.local.set(values);
      if (maybePromise && typeof maybePromise.then === 'function') return maybePromise;
    } catch (error) {
      // Fall back to callback-style extension APIs.
    }
    return new Promise((resolve) => api.storage.local.set(values, resolve));
  }

  function status(message) {
    const el = document.querySelector('#agpa-status');
    if (el) el.textContent = message;
    console.log('[Aural Grid Paste Assistant]', message);
  }

  function sectionTypeValue(label) {
    const v = clean(label)
      .toLowerCase()
      .replace(/[()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+(no\.?|#)?\d+$/, '')
      .trim();
    const map = {
      'pre-chorus': 'pre-chorus',
      'pre chorus': 'pre-chorus',
      'post-chorus': 'post-chorus',
      'post chorus': 'post-chorus',
      'middle 8': 'bridge',
      instrumental: 'instrumental',
      solo: 'solo',
      refrain: 'refrain',
      hook: 'hook',
      chorus: 'chorus',
      verse: 'verse',
      bridge: 'bridge',
      intro: 'intro',
      outro: 'outro',
      coda: 'outro',
      breakdown: 'breakdown',
      build: 'build',
      drop: 'drop',
      interlude: 'interlude'
    };
    if (/\bsolo\b/.test(v)) return 'solo';
    if (/\bverse\b/.test(v)) return 'verse';
    if (/\bpre\s*chorus\b/.test(v)) return 'pre-chorus';
    if (/\bpost\s*chorus\b/.test(v)) return 'post-chorus';
    if (/\bchorus\b/.test(v)) return 'chorus';
    if (/\bhook\b/.test(v)) return 'hook';
    if (/\brefrain\b/.test(v)) return 'refrain';
    if (/\bbridge\b/.test(v) || /\bmiddle\s*8\b/.test(v)) return 'bridge';
    if (/\bintro\b/.test(v)) return 'intro';
    if (/\boutro\b/.test(v) || /\bcoda\b/.test(v)) return 'outro';
    return map[v] || v || 'section';
  }

  function addQueueItem(items, item) {
    const value = clean(item.value);
    if (!value) return;
    items.push({
      id: item.id || `item-${items.length + 1}`,
      label: item.label,
      value,
      kind: item.kind || 'text',
      target: item.target
    });
  }

  function addTagItems(items, base, tags) {
    splitTags(tags).forEach((tag, tagIndex) => {
      addQueueItem(items, {
        id: `${base.id}-tag-${tagIndex + 1}`,
        label: `${base.label} ${tagIndex + 1}`,
        value: tag,
        kind: 'tag',
        target: base.target
      });
    });
  }

  function buildQueue(payload) {
    const items = [];
    (payload.sections || []).forEach((section, index) => {
      const n = index + 1;
      const prefix = `S${n}`;
      addQueueItem(items, {
        id: `s${n}-start`,
        label: `${prefix} Timestamp`,
        value: section.start || section.start_time,
        target: { type: 'section', index, suffix: 'start_time' }
      });
      addQueueItem(items, {
        id: `s${n}-type`,
        label: `${prefix} Section Type`,
        value: section.section_type || sectionTypeValue(section.label || section.section_type),
        target: { type: 'section', index, suffix: 'section_type' }
      });
      addQueueItem(items, {
        id: `s${n}-narration`,
        label: `${prefix} Narration`,
        value: section.narrative_description || section.description,
        target: { type: 'section', index, suffix: 'narrative_description' }
      });
      addTagItems(items, {
        id: `s${n}-instruments`,
        label: `${prefix} Instrument`,
        target: { type: 'sectionTag', index, tagIndex: 0 }
      }, section.instruments || section.instrumentation);
      addTagItems(items, {
        id: `s${n}-vibes`,
        label: `${prefix} Vibe Tag`,
        target: { type: 'sectionTag', index, tagIndex: 1 }
      }, section.vibe_tags || section.vibeTags);
      addQueueItem(items, {
        id: `s${n}-melody`,
        label: `${prefix} Melody`,
        value: section.melody,
        target: { type: 'section', index, suffix: 'melody' }
      });
    });

    const globals = payload.beatpulse_global_fields || {};
    const textGlobals = [
      ['tempo', 'Tempo', 'Tempo'],
      ['key', 'Key', 'Key'],
      ['setting', 'Setting', 'Setting'],
      ['harmony', 'Harmony', 'Harmony'],
      ['chords', 'Chords', 'Chords'],
      ['rhythm_groove', 'Rhythm & Groove', 'Rhythm & Groove'],
      ['playing_style', 'Playing Style', 'Playing Style'],
      ['wow_factor', 'Wow Factor', 'Wow Factor'],
      ['emotion_vibe', 'Emotion & Vibe', 'Emotion & Vibe'],
      ['mix_production', 'Mix & Production', 'Mix & Production'],
      ['sonic_fidelity', 'Sonic Fidelity', 'Sonic Fidelity'],
      ['vocal_expression', 'Vocal Expression', 'Vocal Expression'],
      ['lyrical_evocation', 'Lyrical Evocation', 'Lyrical Evocation']
    ];
    textGlobals.forEach(([key, label, targetLabel]) => {
      addQueueItem(items, {
        id: `global-${key}`,
        label: `Global ${label}`,
        value: globals[key],
        target: { type: 'globalText', label: targetLabel }
      });
    });
    addTagItems(items, {
      id: 'global-genre',
      label: 'Global Genre',
      target: { type: 'globalTag', label: 'Genre', fallbackIndex: 0 }
    }, globals.genre_era_scene);
    addTagItems(items, {
      id: 'global-dominant-instruments',
      label: 'Global Dominant Instrument',
      target: { type: 'globalTag', label: 'Dominant Instruments', fallbackIndex: 1 }
    }, globals.dominant_instruments);
    return items;
  }

  function byIdSuffix(index, suffix) {
    return document.querySelector(`[id$="_${index}_${suffix}"]`);
  }

  function sectionRow(index) {
    const start = byIdSuffix(index, 'start_time');
    if (!start) return null;
    let row = start.closest('.flex.gap-3.items-center') || start.closest('[class*="items-center"]') || start.parentElement;
    let parent = row;
    while (parent && parent !== document.body) {
      if (parent.querySelector(`[id$="_${index}_section_type"]`) && parent.querySelector(`[id$="_${index}_narrative_description"]`)) return parent;
      parent = parent.parentElement;
    }
    return row;
  }

  function tagInputsForRow(index) {
    const row = sectionRow(index);
    if (!row) return [];
    return Array.from(row.querySelectorAll('input[placeholder="Add..."]'));
  }

  function isInsideSectionRow(el) {
    let node = el;
    for (let i = 0; i < 7 && node && node !== document.body; i += 1, node = node.parentElement) {
      if (node.querySelector && node.querySelector('input[id$="_start_time"]') && node.querySelector('textarea[id$="_narrative_description"]')) {
        const rect = node.getBoundingClientRect();
        if (rect.height < 180) return true;
      }
    }
    return false;
  }

  function globalTagInputs() {
    return Array.from(document.querySelectorAll('input[placeholder="Add..."]')).filter((input) => !isInsideSectionRow(input));
  }

  function norm(value) {
    return clean(value).toLowerCase().replace(/[*:]/g, '').replace(/&/g, 'and');
  }

  function labelText(el) {
    return norm(el.textContent || el.getAttribute('aria-label') || '');
  }

  function fieldContainerByLabel(label) {
    const target = norm(label);
    const candidates = Array.from(document.querySelectorAll('label,h1,h2,h3,h4,h5,h6,legend,span,div'))
      .filter((el) => {
        const text = labelText(el);
        return text && text.length < 140;
      })
      .sort((a, b) => labelText(a).length - labelText(b).length);
    const hit = candidates.find((el) => {
      const text = labelText(el);
      return text === target || text.indexOf(target) >= 0;
    });
    if (!hit) return null;
    let node = hit;
    for (let i = 0; i < 6 && node; i += 1, node = node.parentElement) {
      if (node.querySelector && node.querySelector('input,textarea,select,[contenteditable="true"]')) return node;
    }
    return hit.parentElement;
  }

  function fieldByLabel(label, kind) {
    const container = fieldContainerByLabel(label);
    if (!container) return null;
    if (kind === 'tag') return container.querySelector('input[placeholder="Add..."]');
    return container.querySelector('textarea,input:not([type="hidden"])');
  }

  function resolveTarget(item) {
    if (!item || !item.target) return null;
    const target = item.target;
    if (target.type === 'section') return byIdSuffix(target.index, target.suffix);
    if (target.type === 'sectionTag') return tagInputsForRow(target.index)[target.tagIndex] || null;
    if (target.type === 'globalText') return fieldByLabel(target.label, 'text');
    if (target.type === 'globalTag') return fieldByLabel(target.label, 'tag') || globalTagInputs()[target.fallbackIndex] || null;
    return null;
  }

  function currentItem() {
    return state.queue[state.index] || null;
  }

  async function persistIndex() {
    await storageSet({ agpaQueueIndex: state.index, agpaDone: state.done });
  }

  function removeHighlight() {
    if (state.highlighted) state.highlighted.classList.remove('agpa-highlight');
    state.highlighted = null;
  }

  function highlightCurrent(options = {}) {
    removeHighlight();
    const item = currentItem();
    const target = resolveTarget(item);
    if (!target) {
      if (item) status(`Could not find dashboard field for ${item.label}.`);
      return;
    }
    state.highlighted = target;
    target.classList.add('agpa-highlight');
    target.scrollIntoView({ block: 'center', behavior: options.instant ? 'auto' : 'smooth' });
    if (typeof target.focus === 'function') target.focus({ preventScroll: true });
  }

  async function copyCurrent(options = {}) {
    const item = currentItem();
    if (!item) {
      status('No queue item is selected.');
      return false;
    }
    try {
      await navigator.clipboard.writeText(item.value);
      highlightCurrent({ instant: !!options.instant });
      status(`Copied: ${item.label}`);
      return true;
    } catch (error) {
      status('Clipboard copy was blocked. Use the panel value preview and copy manually.');
      return false;
    }
  }

  async function setIndex(nextIndex, options = {}) {
    if (!state.queue.length) return;
    state.index = Math.max(0, Math.min(nextIndex, state.queue.length - 1));
    await persistIndex();
    render();
    highlightCurrent({ instant: options.instant });
    if (options.copy) await copyCurrent({ instant: true });
  }

  async function nextItem(options = {}) {
    await setIndex(state.index + 1, options);
  }

  async function prevItem() {
    await setIndex(state.index - 1);
  }

  async function markDone(id) {
    if (!id) return;
    state.done[id] = true;
    await persistIndex();
  }

  function addSectionButton() {
    return Array.from(document.querySelectorAll('button,[role="button"]')).find((btn) => /add\s+section/i.test(clean(btn.textContent || btn.getAttribute('aria-label') || '')));
  }

  function sectionCount() {
    return document.querySelectorAll('input[id$="_start_time"]').length;
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 45)));
  }

  async function addMissingRows() {
    const expected = state.payload && Array.isArray(state.payload.sections) ? state.payload.sections.length : 0;
    if (!expected) {
      status('No section data loaded.');
      return;
    }
    const button = addSectionButton();
    if (!button) {
      status('Could not find the Beatpulse Add section button.');
      return;
    }
    let guard = 0;
    while (sectionCount() < expected && guard < 50) {
      guard += 1;
      button.click();
      await waitFrame();
    }
    status(`Section rows ready: ${sectionCount()} / ${expected}.`);
    highlightCurrent();
  }

  function queuePreview() {
    const start = Math.max(0, state.index - 2);
    const end = Math.min(state.queue.length, state.index + 5);
    return state.queue.slice(start, end).map((item, offset) => {
      const actualIndex = start + offset;
      const classes = ['agpa-queue-row'];
      if (actualIndex === state.index) classes.push('current');
      if (state.done[item.id]) classes.push('done');
      return `<div class="${classes.join(' ')}"><div class="agpa-index">${actualIndex + 1}</div><div class="agpa-queue-text">${esc(item.label)}: ${esc(item.value)}</div></div>`;
    }).join('');
  }

  function render() {
    if (!state.panel) return;
    const item = currentItem();
    const total = state.queue.length;
    const copied = Object.keys(state.done).length;
    const percent = total ? Math.round(((state.index + 1) / total) * 100) : 0;
    const track = state.payload && state.payload.track ? state.payload.track : {};
    const title = clean(track.title) || 'No bridge loaded';
    const subtitle = state.payload ? `${clean(track.artist) || 'Beatpulse'} - ${total} queue item${total === 1 ? '' : 's'}` : 'Import an Aural Grid bridge JSON from the extension popup.';

    state.panel.innerHTML = `
      <div class="agpa-head">
        <div class="agpa-mark">AG</div>
        <div class="agpa-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>
        <button class="agpa-icon-btn" type="button" data-agpa="close" title="Hide">×</button>
      </div>
      <div class="agpa-body">
        ${state.payload ? `
          <div class="agpa-progress">
            <div class="agpa-progress-row"><span>${state.index + 1} / ${total}</span><span>${copied} pasted</span></div>
            <div class="agpa-track"><div class="agpa-fill" style="width:${percent}%"></div></div>
          </div>
          <div class="agpa-current">
            <div class="agpa-field-label"><span>${esc(item ? item.label : 'Complete')}</span><span>${esc(item ? item.kind : '')}</span></div>
            <div class="agpa-field-value">${esc(item ? item.value : 'Queue complete.')}</div>
          </div>
          <div class="agpa-actions">
            <button class="agpa-primary" type="button" data-agpa="copy">Copy Current</button>
            <button type="button" data-agpa="prev">Back</button>
            <button type="button" data-agpa="next">Next</button>
            <button type="button" data-agpa="focus">Find Field</button>
          </div>
          <div class="agpa-settings">
            <label><input type="checkbox" data-agpa-setting="autoAdvance" ${state.settings.autoAdvance ? 'checked' : ''}> Auto next</label>
            <label><input type="checkbox" data-agpa-setting="autoCopy" ${state.settings.autoCopy ? 'checked' : ''}> Copy next</label>
          </div>
          <div class="agpa-row-actions">
            <button type="button" data-agpa="rows">Add Missing Rows</button>
            <button type="button" data-agpa="done">Mark Pasted</button>
          </div>
          <div class="agpa-queue">${queuePreview()}</div>
        ` : '<div class="agpa-empty">Open the extension popup and import an Aural Grid bridge JSON. Then this panel will guide the paste queue.</div>'}
        <div id="agpa-status" class="agpa-status">Ready.</div>
      </div>
    `;
  }

  function openPanel() {
    if (!state.panel) {
      state.panel = document.createElement('div');
      state.panel.id = 'agpa-panel';
      document.documentElement.appendChild(state.panel);
      state.panel.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-agpa]');
        if (!button) return;
        const action = button.dataset.agpa;
        if (action === 'close') {
          state.panel.hidden = true;
          removeHighlight();
        }
        if (action === 'copy') await copyCurrent();
        if (action === 'prev') await prevItem();
        if (action === 'next') await nextItem();
        if (action === 'focus') highlightCurrent();
        if (action === 'rows') await addMissingRows();
        if (action === 'done') {
          const item = currentItem();
          await markDone(item && item.id);
          await nextItem({ copy: state.settings.autoCopy });
        }
      });
      state.panel.addEventListener('change', async (event) => {
        const checkbox = event.target.closest('[data-agpa-setting]');
        if (!checkbox) return;
        state.settings[checkbox.dataset.agpaSetting] = checkbox.checked;
        await storageSet({ agpaSettings: state.settings });
        render();
      });
    }
    state.panel.hidden = false;
    render();
    highlightCurrent({ instant: true });
  }

  function togglePanel() {
    if (!state.panel || state.panel.hidden) openPanel();
    else {
      state.panel.hidden = true;
      removeHighlight();
    }
  }

  async function loadState() {
    const data = await storageGet(['agpaPayload', 'agpaQueueIndex', 'agpaDone', 'agpaSettings']);
    state.payload = data.agpaPayload || null;
    state.settings = Object.assign({}, state.settings, data.agpaSettings || {});
    state.queue = state.payload ? buildQueue(state.payload) : [];
    state.index = Math.max(0, Math.min(Number(data.agpaQueueIndex) || 0, Math.max(0, state.queue.length - 1)));
    state.done = data.agpaDone || {};
  }

  document.addEventListener('paste', async (event) => {
    const item = currentItem();
    if (!item || !state.panel || state.panel.hidden) return;
    const target = resolveTarget(item);
    if (!target || event.target !== target) return;
    await markDone(item.id);
    if (state.settings.autoAdvance) {
      setTimeout(() => {
        nextItem({ copy: state.settings.autoCopy });
      }, 140);
    } else {
      render();
    }
  }, true);

  api.runtime.onMessage.addListener((message) => {
    (async () => {
      if (message.type === 'AGPA_PAYLOAD_UPDATED') {
        state.payload = message.payload || null;
        state.queue = state.payload ? buildQueue(state.payload) : [];
        state.index = 0;
        state.done = {};
        await persistIndex();
        openPanel();
      }
      if (message.type === 'AGPA_SETTINGS') {
        state.settings = Object.assign({}, state.settings, message.settings || {});
        render();
      }
      if (message.type === 'AGPA_OPEN_PANEL') {
        await loadState();
        openPanel();
      }
      if (message.type === 'AGPA_TOGGLE_PANEL') {
        await loadState();
        togglePanel();
      }
      if (message.type === 'AGPA_COPY_CURRENT') {
        if (!state.payload) await loadState();
        openPanel();
        await copyCurrent();
      }
      if (message.type === 'AGPA_NEXT') {
        if (!state.payload) await loadState();
        openPanel();
        await nextItem();
      }
      if (message.type === 'AGPA_PREV') {
        if (!state.payload) await loadState();
        openPanel();
        await prevItem();
      }
    })();
  });

  loadState().then(() => {
    if (state.payload) openPanel();
  });
})();
