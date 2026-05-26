(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const state = {
    payload: null,
    queue: [],
    index: 0,
    done: {},
    panel: null,
    highlighted: null,
    lastReport: null,
    settlingTagId: '',
    settings: {
      autoAdvance: true,
      autoCopy: true,
      autoRows: true
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
    console.log('[CueLab Paste Assistant]', message);
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
      coda: 'coda',
      breakdown: 'breakdown',
      build: 'build-up',
      'build-up': 'build-up',
      drop: 'drop',
      interlude: 'interlude',
      'pre-hook': 'pre-hook',
      'post-hook': 'post-hook',
      'pre-verse': 'pre-verse',
      'main theme': 'main theme',
      'secondary theme': 'secondary theme',
      'first statement': 'first statement',
      'second statement': 'second statement',
      'final statement': 'final statement',
      'final hook': 'final hook',
      development: 'development',
      recapitulation: 'recapitulation',
      turnaround: 'turnaround',
      vamp: 'vamp',
      tag: 'tag',
      transition: 'transition',
      'drum break': 'drum break',
      pause: 'pause'
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
    if (/\boutro\b/.test(v)) return 'outro';
    if (/\bcoda\b/.test(v)) return 'coda';
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

  function normalizeTransferQueue(queue) {
    if (!Array.isArray(queue)) return [];
    return queue.map((item, index) => ({
      id: item.id || `transfer-${index + 1}`,
      label: item.label || `Field ${index + 1}`,
      value: clean(item.value),
      kind: item.kind || 'text',
      target: item.target || null
    })).filter((item) => item.value && item.target);
  }

  function buildQueue(payload) {
    const exportedQueue = normalizeTransferQueue(payload.transfer_queue);
    if (exportedQueue.length) return exportedQueue;
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

  function setNativeValue(el, value) {
    if (!el) return false;
    const text = String(value || '');
    if (el.isContentEditable) {
      el.focus();
      el.textContent = text;
    } else {
      el.focus();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, text);
      else el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function key(el, keyName) {
    if (!el) return;
    ['keydown', 'keypress', 'keyup'].forEach((type) => {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: keyName,
        code: keyName === 'Enter' ? 'Enter' : keyName,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  function waitMs(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function visibleElement(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function exactTagCandidate(tag) {
    const wanted = norm(tag);
    const selectors = [
      '[role="option"]',
      '[role="listbox"] button',
      '[role="listbox"] [data-value]',
      '[role="listbox"] [data-radix-collection-item]',
      '[cmdk-item]',
      '[data-radix-collection-item]',
      '[data-slot="command-item"]'
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(','))).filter(visibleElement);
    return candidates.find((candidate) => {
      const value = candidate.getAttribute('data-value') || candidate.getAttribute('value') || candidate.textContent;
      return norm(value) === wanted;
    }) || null;
  }

  function clearTagQuery(input) {
    if (!input) return;
    setNativeValue(input, '');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function commitExactTag(input, tag) {
    if (!input || !clean(tag)) return false;
    input.focus();
    setNativeValue(input, tag);
    await waitMs(180);
    let candidate = exactTagCandidate(tag);
    if (!candidate) {
      await waitMs(220);
      candidate = exactTagCandidate(tag);
    }
    if (!candidate) {
      clearTagQuery(input);
      return false;
    }
    candidate.click();
    await waitMs(100);
    return true;
  }

  function targetValue(target) {
    if (!target) return '';
    if (target.isContentEditable) return clean(target.textContent);
    return clean(target.value);
  }

  function targetContainerText(target) {
    if (!target) return '';
    let node = target;
    for (let i = 0; i < 5 && node && node !== document.body; i += 1, node = node.parentElement) {
      if (node.textContent && node.textContent.length < 1200) return norm(node.textContent);
    }
    return norm(target.textContent || target.value || '');
  }

  function itemAlreadyMatches(item, target) {
    if (!item || !target) return false;
    if (item.kind === 'tag') return targetContainerText(target).indexOf(norm(item.value)) >= 0;
    return targetValue(target) === clean(item.value);
  }

  async function fillQueueItem(item) {
    const target = resolveTarget(item);
    if (!target) return { status: 'missing', item };
    if (itemAlreadyMatches(item, target)) {
      await markDone(item.id);
      return { status: 'skipped', item };
    }
    if (item.kind === 'tag') {
      const selected = await commitExactTag(target, item.value);
      if (!selected) return { status: 'unsupported', item };
      const committedTarget = resolveTarget(item);
      if (!committedTarget || !itemAlreadyMatches(item, committedTarget)) {
        return { status: 'unconfirmed', item };
      }
    } else {
      setNativeValue(target, item.value);
      if (item.target && item.target.suffix === 'section_type') key(target, 'Enter');
      else target.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    await markDone(item.id);
    return { status: 'filled', item };
  }

  function preflightReport() {
    const expectedRows = state.payload && Array.isArray(state.payload.sections) ? state.payload.sections.length : 0;
    const rowsFound = sectionCount();
    const missing = [];
    let found = 0;
    state.queue.forEach((item) => {
      if (resolveTarget(item)) found += 1;
      else missing.push(item.label);
    });
    const qaWarnings = state.payload && state.payload.qa_review && Array.isArray(state.payload.qa_review.warnings)
      ? state.payload.qa_review.warnings
      : ['Bridge has no Golden Check record. Review it manually before submitting.'];
    return {
      rowsFound,
      expectedRows,
      queueTotal: state.queue.length,
      fieldsFound: found,
      missing,
      qaWarnings,
      ready: !!state.queue.length && rowsFound >= expectedRows && !missing.length && !qaWarnings.length
    };
  }

  function reportHtml(report) {
    if (!report) return '';
    const missingText = report.missing.length ? report.missing.slice(0, 5).join(', ') + (report.missing.length > 5 ? ` +${report.missing.length - 5}` : '') : 'none';
    const cls = report.ready ? 'ready' : 'warn';
    const qaText = report.qaWarnings.length ? `${report.qaWarnings.length} review note${report.qaWarnings.length === 1 ? '' : 's'}` : 'clear';
    return `
      <div class="agpa-preflight ${cls}">
        <div><strong>Rows</strong><span>${report.rowsFound} / ${report.expectedRows}</span></div>
        <div><strong>Fields</strong><span>${report.fieldsFound} / ${report.queueTotal}</span></div>
        <div><strong>Missing</strong><span>${esc(missingText)}</span></div>
        <div><strong>Golden Check</strong><span>${esc(qaText)}</span></div>
      </div>
    `;
  }

  async function verifyTransfer() {
    if (!state.payload) {
      status('Import bridge data before verifying.');
      return null;
    }
    const result = { matched: 0, missing: [], different: [] };
    state.queue.forEach((item) => {
      const target = resolveTarget(item);
      if (!target) {
        result.missing.push(item.label);
      } else if (itemAlreadyMatches(item, target)) {
        result.matched += 1;
      } else {
        result.different.push(item.label);
      }
    });
    state.lastReport = {
      type: 'verify',
      message: `${result.matched} matched, ${result.different.length} different, ${result.missing.length} missing.`,
      detail: result.different.concat(result.missing).slice(0, 8).join(', ')
    };
    render();
    status(`Verification: ${state.lastReport.message}`);
    return result;
  }

  function currentItem() {
    return state.queue[state.index] || null;
  }

  function queueComplete() {
    return !!state.queue.length && state.queue.every((item) => state.done[item.id]);
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
    if (queueComplete()) return;
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

  function unique(values) {
    return values.filter((value, index) => value && values.indexOf(value) === index);
  }

  function committedTags(input) {
    if (!input || !input.parentElement) return [];
    const container = input.parentElement;
    const values = Array.from(container.children)
      .filter((element) => element !== input && !element.contains(input) && visibleElement(element))
      .map((element) => clean(element.textContent).replace(/[x×✕]\s*$/i, '').trim())
      .filter((value) => value && norm(value) !== norm(input.placeholder || 'Add...'));
    return unique(values);
  }

  function capturedTextField(label) {
    const target = fieldByLabel(label, 'text');
    return target ? targetValue(target) : '';
  }

  function capturedTagField(label, fallbackIndex) {
    const target = fieldByLabel(label, 'tag') || globalTagInputs()[fallbackIndex] || null;
    return committedTags(target);
  }

  function captureCompletedForm() {
    const count = sectionCount();
    const sections = [];
    for (let index = 0; index < count; index += 1) {
      const tags = tagInputsForRow(index);
      sections.push({
        id: `S${index + 1}`,
        start: targetValue(byIdSuffix(index, 'start_time')),
        label: targetValue(byIdSuffix(index, 'section_type')),
        description: targetValue(byIdSuffix(index, 'narrative_description')),
        instruments: committedTags(tags[0]).join(', '),
        vibe_tags: committedTags(tags[1]).join(', '),
        melody: targetValue(byIdSuffix(index, 'melody'))
      });
    }
    const globalFields = {
      'Tempo': capturedTextField('Tempo'),
      'Key': capturedTextField('Key'),
      'Setting / Occasion / Listening Context': capturedTextField('Setting'),
      'Harmony': capturedTextField('Harmony'),
      'Chords': capturedTextField('Chords'),
      'Rhythm & Groove': capturedTextField('Rhythm & Groove'),
      'Genre / Era / Scene': capturedTagField('Genre', 0).join(', '),
      'Dominant Instruments': capturedTagField('Dominant Instruments', 1).join(', '),
      'Playing Style': capturedTextField('Playing Style'),
      'Wow Factor': capturedTextField('Wow Factor'),
      'Emotion & Vibe': capturedTextField('Emotion & Vibe'),
      'Mix & Production': capturedTextField('Mix & Production'),
      'Sonic Fidelity': capturedTextField('Sonic Fidelity'),
      'Vocal Expression': capturedTextField('Vocal Expression'),
      'Lyrical Meaning / Evocation': capturedTextField('Lyrical Evocation')
    };
    return {
      schema: 'section-analyst-pass-v1',
      source: 'beatpulse-completed-form-capture',
      captured_at: new Date().toISOString(),
      pass_phase: 'dashboard_capture',
      track: state.payload && state.payload.track ? state.payload.track : { title: document.title, artist: '' },
      sections,
      global_fields: globalFields,
      capture_notes: [
        'Captured from the currently rendered BeatPulse form by CueLab Paste Assistant.',
        'Import this JSON into CueLab to recover or compare dashboard-completed values.',
        'Check tag fields if BeatPulse has uncommitted text or hidden chips.'
      ]
    };
  }

  function downloadJsonFile(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function completedCaptureFilename(payload) {
    const title = payload.track && payload.track.title ? payload.track.title : 'beatpulse-completed-form';
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 45) || 'beatpulse'}-cuelab-capture.json`;
  }

  function downloadCompletedCapture() {
    const payload = captureCompletedForm();
    downloadJsonFile(completedCaptureFilename(payload), payload);
    status(`Captured ${payload.sections.length} completed section row${payload.sections.length === 1 ? '' : 's'} for CueLab import or transfer testing.`);
    return payload;
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 45)));
  }

  async function addMissingRows(options = {}) {
    const expected = state.payload && Array.isArray(state.payload.sections) ? state.payload.sections.length : 0;
    if (!expected) {
      status('No section data loaded.');
      return;
    }
    const button = addSectionButton();
    if (!button) {
      status('Could not find the BeatPulse Add section button.');
      return;
    }
    let guard = 0;
    while (sectionCount() < expected && guard < 50) {
      guard += 1;
      button.click();
      await waitFrame();
    }
    if (!options.quiet) status(`Section rows ready: ${sectionCount()} / ${expected}.`);
    render();
    highlightCurrent({ instant: !!options.quiet });
  }

  async function fillAllVisibleFields() {
    if (!state.payload) {
      await loadState();
    }
    if (!state.payload) {
      openPanel();
      status('Import bridge data before using Fill All.');
      return;
    }
    openPanel();
    if (state.settings.autoRows) await addMissingRows({ quiet: true });
    const stats = { filled: 0, skipped: 0, missing: 0, unsupported: 0, unconfirmed: 0 };
    for (const item of state.queue) {
      const result = await fillQueueItem(item);
      stats[result.status] = (stats[result.status] || 0) + 1;
      await waitFrame();
    }
    const nextOpen = state.queue.findIndex((item) => !state.done[item.id]);
    state.index = nextOpen >= 0 ? nextOpen : Math.max(0, state.queue.length - 1);
    await persistIndex();
    state.lastReport = {
      type: 'fill',
      message: `${stats.filled} filled, ${stats.skipped} already matched, ${stats.missing} missing, ${stats.unsupported} exact tags not found, ${stats.unconfirmed} unconfirmed.`,
      detail: (stats.unsupported || stats.unconfirmed) ? 'No unmatched tags were inserted. Review unavailable tags, then run Verify Transfer.' : 'Review the dashboard before submitting.'
    };
    render();
    highlightCurrent({ instant: true });
    status(`Fill All complete: ${state.lastReport.message}`);
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
    const complete = queueComplete();
    const percent = total ? (complete ? 100 : Math.round(((state.index + 1) / total) * 100)) : 0;
    const track = state.payload && state.payload.track ? state.payload.track : {};
    const title = clean(track.title) || 'No bridge loaded';
    const subtitle = state.payload ? `${clean(track.artist) || 'BeatPulse'} - ${total} queue item${total === 1 ? '' : 's'}` : 'Import a CueLab bridge JSON from the extension popup.';
    const preflight = state.payload ? preflightReport() : null;
    const report = state.lastReport ? `<div class="agpa-transfer-report"><strong>${esc(state.lastReport.message)}</strong>${state.lastReport.detail ? `<span>${esc(state.lastReport.detail)}</span>` : ''}</div>` : '';

    state.panel.innerHTML = `
      <div class="agpa-head">
        <div class="agpa-mark">CL</div>
        <div class="agpa-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>
        <button class="agpa-icon-btn" type="button" data-agpa="close" title="Hide">×</button>
      </div>
      <div class="agpa-body">
        ${state.payload ? `
          ${reportHtml(preflight)}
          ${report}
          <div class="agpa-progress">
            <div class="agpa-progress-row"><span>${state.index + 1} / ${total}</span><span>${copied} pasted</span></div>
            <div class="agpa-track"><div class="agpa-fill" style="width:${percent}%"></div></div>
          </div>
          <div class="agpa-current">
            <div class="agpa-field-label"><span>${esc(complete ? 'Complete' : (item ? item.label : 'Complete'))}</span><span>${esc(complete ? '' : (item ? item.kind : ''))}</span></div>
            <div class="agpa-field-value">${esc(complete ? 'Queue complete. Run Verify Transfer before submitting.' : (item ? item.value : 'Queue complete.'))}</div>
          </div>
          <div class="agpa-actions">
            <button class="agpa-primary agpa-fill-all" type="button" data-agpa="fill-all">Fill Exact Matches</button>
            <button class="agpa-primary" type="button" data-agpa="copy">Copy Current</button>
            <button type="button" data-agpa="prev">Back</button>
            <button type="button" data-agpa="next">Next</button>
            <button type="button" data-agpa="focus">Find Field</button>
          </div>
          <div class="agpa-settings">
            <label><input type="checkbox" data-agpa-setting="autoAdvance" ${state.settings.autoAdvance ? 'checked' : ''}> Auto next</label>
            <label><input type="checkbox" data-agpa-setting="autoCopy" ${state.settings.autoCopy ? 'checked' : ''}> Copy next</label>
            <label><input type="checkbox" data-agpa-setting="autoRows" ${state.settings.autoRows ? 'checked' : ''}> Auto rows</label>
          </div>
          <div class="agpa-row-actions">
            <button type="button" data-agpa="rows">Prepare Rows</button>
            <button type="button" data-agpa="verify">Verify Transfer</button>
            <button type="button" data-agpa="capture">Capture Form</button>
          </div>
          <div class="agpa-queue">${queuePreview()}</div>
        ` : '<div class="agpa-empty">Open the extension popup and import a CueLab bridge JSON. Then this panel will guide the paste queue.</div>'}
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
        if (action === 'fill-all') await fillAllVisibleFields();
        if (action === 'verify') await verifyTransfer();
        if (action === 'capture') downloadCompletedCapture();
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

  async function completeManualItem(item) {
    if (!item || !currentItem() || currentItem().id !== item.id) return;
    if (item.kind === 'tag') {
      const target = resolveTarget(item);
      if (!target || !itemAlreadyMatches(item, target)) {
        state.settlingTagId = '';
        status(`Commit ${item.label} in BeatPulse, then the queue will continue.`);
        return;
      }
    }
    state.settlingTagId = '';
    await markDone(item.id);
    if (queueComplete()) {
      render();
      removeHighlight();
      status('Paste queue complete. Run Verify Transfer before submitting.');
      return;
    }
    if (state.settings.autoAdvance) {
      await nextItem({ copy: state.settings.autoCopy });
    } else {
      render();
    }
  }

  document.addEventListener('paste', (event) => {
    const item = currentItem();
    if (!item || !state.panel || state.panel.hidden) return;
    const target = resolveTarget(item);
    if (!target || event.target !== target) return;
    if (item.kind === 'tag') {
      state.settlingTagId = item.id;
      setTimeout(async () => {
        const activeTarget = resolveTarget(item);
        if (activeTarget && currentItem() && currentItem().id === item.id && !itemAlreadyMatches(item, activeTarget) && targetValue(activeTarget)) {
          const selected = await commitExactTag(activeTarget, item.value);
          if (!selected) {
            status(`No exact BeatPulse tag found for "${item.value}". Nothing was inserted.`);
          }
        }
        await completeManualItem(item);
      }, 100);
      return;
    }
    setTimeout(() => completeManualItem(item), 60);
  }, true);

  document.addEventListener('keydown', (event) => {
    const item = currentItem();
    if (!item || item.kind !== 'tag' || event.key !== 'Enter' || !state.panel || state.panel.hidden) return;
    const target = resolveTarget(item);
    if (!target || event.target !== target) return;
    event.preventDefault();
    event.stopPropagation();
    state.settlingTagId = item.id;
    (async () => {
      const selected = await commitExactTag(target, item.value);
      if (!selected) {
        status(`No exact BeatPulse tag found for "${item.value}". Nothing was inserted.`);
      }
      await completeManualItem(item);
    })();
  }, true);

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AGPA_CAPTURE_COMPLETED') {
      const response = { ok: true, payload: captureCompletedForm() };
      if (typeof sendResponse === 'function') {
        sendResponse(response);
        return true;
      }
      return Promise.resolve(response);
    }
    (async () => {
      if (message.type === 'AGPA_PAYLOAD_UPDATED') {
        state.payload = message.payload || null;
        state.queue = state.payload ? buildQueue(state.payload) : [];
        state.index = 0;
        state.done = {};
        state.lastReport = null;
        await persistIndex();
        openPanel();
        if (state.payload && state.settings.autoRows) await addMissingRows({ quiet: true });
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
      if (message.type === 'AGPA_ADD_ROWS') {
        if (!state.payload) await loadState();
        openPanel();
        await addMissingRows();
      }
      if (message.type === 'AGPA_FILL_ALL') {
        if (!state.payload) await loadState();
        await fillAllVisibleFields();
      }
      if (message.type === 'AGPA_VERIFY') {
        if (!state.payload) await loadState();
        openPanel();
        await verifyTransfer();
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
