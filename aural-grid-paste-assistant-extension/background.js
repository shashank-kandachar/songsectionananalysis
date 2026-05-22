const api = typeof browser !== 'undefined' ? browser : chrome;

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

async function activeBeatpulseTab() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) return null;
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await activeBeatpulseTab();
  if (!tab) return;
  try {
    await tabsSendMessage(tab.id, message);
  } catch (error) {
    // The content script may not be present on non-Beatpulse pages.
  }
}

api.commands.onCommand.addListener((command) => {
  const typeByCommand = {
    'copy-current': 'AGPA_COPY_CURRENT',
    'next-item': 'AGPA_NEXT',
    'prev-item': 'AGPA_PREV',
    'toggle-panel': 'AGPA_TOGGLE_PANEL'
  };
  if (typeByCommand[command]) {
    sendToActiveTab({ type: typeByCommand[command] });
  }
});
