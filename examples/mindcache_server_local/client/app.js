const tagsEl = document.getElementById('tags');
const entriesEl = document.getElementById('entries');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const apiBaseInput = document.getElementById('apiBase');
const matchModeSelect = document.getElementById('matchMode');
const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');

const state = {
  allTags: [],
  selectedTags: new Set(),
  entries: []
};

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function apiBase() {
  return apiBaseInput.value.trim().replace(/\/$/, '');
}

function renderTags() {
  if (state.allTags.length === 0) {
    tagsEl.innerHTML = '<span class="hint">No tags found.</span>';
    return;
  }

  tagsEl.innerHTML = state.allTags
    .map((tag) => {
      const active = state.selectedTags.has(tag);
      const className = active ? 'tag active' : 'tag';
      return `<button class="${className}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
    })
    .join('');
}

function renderEntries() {
  const selected = Array.from(state.selectedTags).sort();
  const mode = matchModeSelect.value;

  if (state.entries.length === 0) {
    const filterText = selected.length > 0
      ? `No keys matched [${selected.join(', ')}] (${mode}).`
      : 'No keys found.';
    summaryEl.textContent = filterText;
    entriesEl.innerHTML = '';
    return;
  }

  const label = selected.length > 0
    ? `Showing ${state.entries.length} key(s) for tags [${selected.join(', ')}], match=${mode}.`
    : `Showing all ${state.entries.length} key(s).`;
  summaryEl.textContent = label;

  entriesEl.innerHTML = state.entries
    .map((entry) => {
      const tags = (entry.attributes?.contentTags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ');
      return `
        <article class="item">
          <div class="key">${escapeHtml(entry.key)}</div>
          <div class="hint">raw key: ${escapeHtml(entry.rawKey)} | file: ${escapeHtml(entry.fileId)}</div>
          <div class="tags" style="margin-top:8px;">${tags || '<span class="hint">no tags</span>'}</div>
        </article>
      `;
    })
    .join('');
}

async function fetchTags() {
  const response = await fetch(`${apiBase()}/v1/tags`);
  if (!response.ok) {
    throw new Error(`Failed fetching tags: ${response.status}`);
  }

  const body = await response.json();
  state.allTags = Array.isArray(body.tags) ? body.tags : [];

  for (const tag of Array.from(state.selectedTags)) {
    if (!state.allTags.includes(tag)) {
      state.selectedTags.delete(tag);
    }
  }
}

async function fetchEntries() {
  const selectedTags = Array.from(state.selectedTags).sort();
  const params = new URLSearchParams();
  if (selectedTags.length > 0) {
    params.set('tags', selectedTags.join(','));
  }
  params.set('match', matchModeSelect.value);

  const response = await fetch(`${apiBase()}/v1/entries?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed fetching entries: ${response.status}`);
  }

  const body = await response.json();
  state.entries = Array.isArray(body.entries) ? body.entries : [];
}

async function refresh() {
  statusEl.textContent = 'Loading...';

  try {
    await fetchTags();
    await fetchEntries();
    renderTags();
    renderEntries();
    statusEl.textContent = `Loaded ${state.allTags.length} tags.`;
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  }
}

tagsEl.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const tag = target.dataset.tag;
  if (!tag) {
    return;
  }

  if (state.selectedTags.has(tag)) {
    state.selectedTags.delete(tag);
  } else {
    state.selectedTags.add(tag);
  }

  renderTags();
  await refresh();
});

refreshBtn.addEventListener('click', () => {
  void refresh();
});

clearBtn.addEventListener('click', () => {
  state.selectedTags.clear();
  void refresh();
});

matchModeSelect.addEventListener('change', () => {
  void refresh();
});

apiBaseInput.addEventListener('change', () => {
  void refresh();
});

void refresh();
