const PREFIX = 'site:';

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// Checks BOTH stores and merges - a mark may live in either backend
// depending on which was selected when it was last saved.
async function getMark(host) {
  const key = PREFIX + host;
  const [localRes, syncRes] = await Promise.all([
    browser.storage.local.get(key),
    browser.storage.sync.get(key)
  ]);
  if (syncRes[key]) return { ...syncRes[key], backend: 'sync' };
  if (localRes[key]) return { ...localRes[key], backend: 'local' };
  return null;
}

function showBanner(label, note) {
  if (document.getElementById('__site_marker_banner__')) return;
  const bar = document.createElement('div');
  bar.id = '__site_marker_banner__';
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
    'background:#d93025;color:#fff;font:14px/1.4 -apple-system,sans-serif;' +
    'padding:10px 16px;display:flex;justify-content:space-between;' +
    'align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.3)';
  bar.innerHTML =
    '<span><strong>\u26A0 ' + (label || 'Marked site') + '</strong>' +
    (note ? ' \u2014 ' + note : '') + '</span>';
  const btn = document.createElement('button');
  btn.textContent = '\u2715';
  btn.style.cssText =
    'background:transparent;border:none;color:#fff;font-size:16px;' +
    'cursor:pointer;margin-left:12px';
  btn.onclick = () => bar.remove();
  bar.appendChild(btn);
  document.documentElement.appendChild(bar);
}

async function checkTab(tabId, url) {
  const host = hostnameOf(url);
  if (!host) return;

  const mark = await getMark(host);

  if (mark) {
    browser.action.setBadgeText({ tabId, text: '!' });
    browser.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        func: showBanner,
        args: [mark.label, mark.note]
      });
    } catch (e) {
      // fails on privileged pages (about:, addons.mozilla.org, etc) - expected
    }
  } else {
    browser.action.setBadgeText({ tabId, text: '' });
  }
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkTab(tabId, tab.url);
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.url) checkTab(tabId, tab.url);
  } catch (e) {}
});

// re-check the active tab right after a mark is added/removed from the popup,
// and re-check whenever either store changes (local edit, or a sync pull
// from another device)
browser.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type === 'recheck') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) checkTab(tab.id, tab.url);
  }
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' && area !== 'local') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) checkTab(tab.id, tab.url);
});
