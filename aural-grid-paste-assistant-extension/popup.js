const api = typeof browser !== 'undefined' ? browser : chrome;

const statusEl = document.querySelector('#payload-status');
const fileEl = document.querySelector('#bridge-file');
const autoAdvanceEl = document.querySelector('#auto-advance');
const autoCopyEl = document.querySelector('#auto-copy');
const autoRowsEl = document.querySelector('#auto-rows');

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function storageRemove(keys) {
  try {
    const maybePromise = api.storage.local.remove(keys);
    if (maybePromise && typeof maybePromise.then === 'function') return maybePromise;
  } catch (error) {
    // Fall back to callback-style extension APIs.
  }
  return new Promise((resolve) => api.storage.local.remove(keys, resolve));
}

function tabsQuery(query) {
  try {
    const maybePromise = api.tabs.query(query);
    if (maybePromise && typeof maybePromise.then === 'function') return maybePromise;
  } catch (error) {
    // Fall back to callback-style extension APIs.
  }
  return new Promise((resolve) => api.tabs.query(query, resolve));
}

function tabsSendMessage(tabId, message) {
  try {
    const maybePromise = api.tabs.sendMessage(tabId, message);
    if (maybePromise && typeof maybePromise.then === 'function') return maybePromise;
  } catch (error) {
    // Fall back to callback-style extension APIs.
  }
  return new Promise((resolve) => api.tabs.sendMessage(tabId, message, resolve));
}

async function activeTab() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function sendToTab(message) {
  const tab = await activeTab();
  if (!tab || !tab.id) return;
  try {
    await tabsSendMessage(tab.id, message);
  } catch (error) {
    statusEl.textContent = 'Open a Beatpulse assignment page, then try again.';
  }
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Bridge file is not valid JSON.');
  if (raw.schema === 'aural-grid-beatpulse-bridge-v1') return raw;
  const globals = raw.global_fields || raw.globalAnalysis || {};
  return {
    schema: 'aural-grid-beatpulse-bridge-v1',
    exported_at: raw.exported_at || new Date().toISOString(),
    track: raw.track || {},
    sections: (raw.sections || []).map((section, index) => ({
      id: section.id || `S${index + 1}`,
      start: section.start || section.start_time || '',
      label: section.label || section.section_type || '',
      section_type: section.section_type || section.label || '',
      narrative_description: section.narrative_description || section.description || '',
      instruments: section.instruments || [],
      vibe_tags: section.vibe_tags || section.vibeTags || [],
      melody: section.melody || ''
    })),
    global_fields: globals,
    beatpulse_global_fields: raw.beatpulse_global_fields || globals,
    transfer_queue: Array.isArray(raw.transfer_queue) ? raw.transfer_queue : []
  };
}

function payloadSummary(payload) {
  if (!payload) return 'No bridge loaded yet.';
  const track = payload.track || {};
  const title = clean(track.title) || 'Untitled track';
  const artist = clean(track.artist);
  const sections = Array.isArray(payload.sections) ? payload.sections.length : 0;
  return `${title}${artist ? ` - ${artist}` : ''}. ${sections} section${sections === 1 ? '' : 's'} loaded.`;
}

async function refresh() {
  const data = await storageGet(['agpaPayload', 'agpaSettings']);
  statusEl.textContent = payloadSummary(data.agpaPayload);
  const settings = data.agpaSettings || {};
  autoAdvanceEl.checked = settings.autoAdvance !== false;
  autoCopyEl.checked = settings.autoCopy !== false;
  autoRowsEl.checked = settings.autoRows !== false;
}

async function saveSettings() {
  const settings = {
    autoAdvance: autoAdvanceEl.checked,
    autoCopy: autoCopyEl.checked,
    autoRows: autoRowsEl.checked
  };
  await storageSet({ agpaSettings: settings });
  await sendToTab({ type: 'AGPA_SETTINGS', settings });
}

async function importPayloadText(text, sourceLabel) {
  try {
    const payload = normalizePayload(JSON.parse(text));
    await storageSet({ agpaPayload: payload, agpaQueueIndex: 0 });
    statusEl.textContent = `${payloadSummary(payload)} Imported from ${sourceLabel}.`;
    await sendToTab({ type: 'AGPA_PAYLOAD_UPDATED', payload });
  } catch (error) {
    statusEl.textContent = error.message || 'Could not import bridge JSON.';
  }
}

fileEl.addEventListener('change', async () => {
  const file = fileEl.files && fileEl.files[0];
  fileEl.value = '';
  if (!file) return;
  await importPayloadText(await file.text(), 'file');
});

autoAdvanceEl.addEventListener('change', saveSettings);
autoCopyEl.addEventListener('change', saveSettings);
autoRowsEl.addEventListener('change', saveSettings);

document.querySelector('#import-clipboard').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    await importPayloadText(text, 'clipboard');
  } catch (error) {
    statusEl.textContent = 'Clipboard import was blocked. Use the Bridge JSON file import.';
  }
});
document.querySelector('#open-assistant').addEventListener('click', () => sendToTab({ type: 'AGPA_OPEN_PANEL' }));
document.querySelector('#fill-all').addEventListener('click', () => sendToTab({ type: 'AGPA_FILL_ALL' }));
document.querySelector('#verify-transfer').addEventListener('click', () => sendToTab({ type: 'AGPA_VERIFY' }));
document.querySelector('#add-rows').addEventListener('click', () => sendToTab({ type: 'AGPA_ADD_ROWS' }));
document.querySelector('#copy-current').addEventListener('click', () => sendToTab({ type: 'AGPA_COPY_CURRENT' }));
document.querySelector('#next-item').addEventListener('click', () => sendToTab({ type: 'AGPA_NEXT' }));
document.querySelector('#prev-item').addEventListener('click', () => sendToTab({ type: 'AGPA_PREV' }));
document.querySelector('#clear-data').addEventListener('click', async () => {
  await storageRemove(['agpaPayload', 'agpaQueueIndex']);
  statusEl.textContent = 'Bridge data cleared.';
  await sendToTab({ type: 'AGPA_PAYLOAD_UPDATED', payload: null });
});

refresh();
