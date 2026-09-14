const PREFIX = 'site:';
const NOTE_MAX = 280;
const BACKEND_PREF_KEY = 'site_marker_backend_pref'; // always stored in local

let currentHost = null;
let existingMark = null;

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// ---- backend preference (which radio is selected) ----

async function getBackendPref() {
  const result = await browser.storage.local.get(BACKEND_PREF_KEY);
  return result[BACKEND_PREF_KEY] || 'sync'; // default matches prior behavior
}

async function setBackendPref(value) {
  await browser.storage.local.set({ [BACKEND_PREF_KEY]: value });
}

// ---- mark storage, spanning both backends ----

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

async function getAllMarks() {
  const [localAll, syncAll] = await Promise.all([
    browser.storage.local.get(null),
    browser.storage.sync.get(null)
  ]);
  const marks = {};
  for (const [key, val] of Object.entries(localAll)) {
    if (key.startsWith(PREFIX)) marks[key.slice(PREFIX.length)] = { ...val, backend: 'local' };
  }
  for (const [key, val] of Object.entries(syncAll)) {
    if (key.startsWith(PREFIX)) marks[key.slice(PREFIX.length)] = { ...val, backend: 'sync' };
  }
  return marks;
}

// Saves to the chosen backend and removes the key from the OTHER backend,
// so a site is never duplicated across both stores.
async function setMark(host, mark, backend) {
  const key = PREFIX + host;
  const target = backend === 'sync' ? browser.storage.sync : browser.storage.local;
  const other = backend === 'sync' ? browser.storage.local : browser.storage.sync;
  await target.set({ [key]: mark });
  await other.remove(key).catch(() => {});
}

async function removeMark(host) {
  const key = PREFIX + host;
  await Promise.all([
    browser.storage.local.remove(key),
    browser.storage.sync.remove(key)
  ]);
}

// ---- storage usage labels ----

async function refreshStorageLabels() {
  try {
    const [localUsed, syncUsed] = await Promise.all([
      browser.storage.local.getBytesInUse(null),
      browser.storage.sync.getBytesInUse(null)
    ]);
    // QUOTA_BYTES is documented as 102400 for storage.sync, but isn't
    // reliably exposed as a live property in every Firefox build - fall
    // back to the documented constant instead of risking NaN.
    const syncQuota =
      typeof browser.storage.sync.QUOTA_BYTES === 'number'
        ? browser.storage.sync.QUOTA_BYTES
        : 102400;
    const syncFreeKB = Math.max(0, (syncQuota - syncUsed) / 1024).toFixed(1);
    const syncQuotaKB = (syncQuota / 1024).toFixed(0);
    const localUsedKB = (localUsed / 1024).toFixed(1);

    document.getElementById('local-label-text').textContent =
      `Local storage (Unlimited) \u2014 ${localUsedKB} KB used`;
    document.getElementById('sync-label-text').textContent =
      `Sync across devices (${syncFreeKB} KB free of ${syncQuotaKB} KB)`;
  } catch (e) {
    document.getElementById('sync-label-text').textContent =
      'Sync across devices (usage unavailable)';
  }
}

// ---- list rendering ----

async function refreshList() {
  const marks = await getAllMarks();
  const ul = document.getElementById('list');
  ul.innerHTML = '';
  const hosts = Object.keys(marks).sort();
  if (hosts.length === 0) {
    ul.innerHTML = '<li style="opacity:.6">No sites marked yet</li>';
  } else {
    hosts.forEach((host) => {
      const mark = marks[host];
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = host + ' \u2014 ' + mark.label;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = mark.backend;
      span.appendChild(tag);
      const btn = document.createElement('button');
      btn.textContent = '\u2715';
      btn.onclick = async () => {
        await removeMark(host);
        await refreshList();
        await refreshStorageLabels();
        if (host === currentHost) {
          document.getElementById('unmark').style.display = 'none';
          existingMark = null;
        }
        browser.runtime.sendMessage({ type: 'recheck' });
      };
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }
  await refreshStorageLabels();
}

// ---- note character counter ----

function updateNoteCounter() {
  const note = document.getElementById('note');
  const counter = document.getElementById('note-counter');
  if (note.value.length > NOTE_MAX) {
    note.value = note.value.slice(0, NOTE_MAX);
  }
  counter.textContent = `${note.value.length}/${NOTE_MAX}`;
}

// ---- init ----

async function init() {
  const noteEl = document.getElementById('note');
  noteEl.setAttribute('maxlength', String(NOTE_MAX));
  noteEl.addEventListener('input', updateNoteCounter);
  updateNoteCounter();

  // set up radio buttons
  const pref = await getBackendPref();
  document.getElementById('backend-local').checked = pref === 'local';
  document.getElementById('backend-sync').checked = pref === 'sync';
  document.querySelectorAll('input[name="backend"]').forEach((radio) => {
    radio.addEventListener('change', async (e) => {
      if (e.target.checked) await setBackendPref(e.target.value);
    });
  });
  await refreshStorageLabels();

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentHost = hostnameOf(tab.url);
  document.getElementById('host').textContent = currentHost || '(no host on this page)';

  existingMark = currentHost ? await getMark(currentHost) : null;
  if (existingMark) {
    document.getElementById('label').value = existingMark.label;
    noteEl.value = existingMark.note || '';
    updateNoteCounter();
    document.getElementById('unmark').style.display = 'block';
    // reflect where this specific mark actually lives right now
    document.getElementById('backend-local').checked = existingMark.backend === 'local';
    document.getElementById('backend-sync').checked = existingMark.backend === 'sync';
  }

  document.getElementById('save').onclick = async () => {
    if (!currentHost) return;
    const backend = document.querySelector('input[name="backend"]:checked').value;
    const note = noteEl.value.slice(0, NOTE_MAX);
    await setMark(currentHost, {
      label: document.getElementById('label').value,
      note,
      dateAdded: existingMark ? existingMark.dateAdded : Date.now()
    }, backend);
    await setBackendPref(backend);
    await refreshList();
    document.getElementById('unmark').style.display = 'block';
    browser.runtime.sendMessage({ type: 'recheck' });
  };

  document.getElementById('unmark').onclick = async () => {
    await removeMark(currentHost);
    document.getElementById('unmark').style.display = 'none';
    existingMark = null;
    await refreshList();
    browser.runtime.sendMessage({ type: 'recheck' });
  };

  await refreshList();
}

init();
