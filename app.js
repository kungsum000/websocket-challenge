'use strict';

// Strict mode membantu JavaScript mendeteksi kesalahan penggunaan variabel.

// ══════════════════════════════════════════════
// KONEKSI REALTIME — WebSocket ke server PHP
// ══════════════════════════════════════════════
// const dipakai untuk nilai konfigurasi yang tidak perlu diganti.
const configuredWsUrl = window.RAB_WS_URL || new URLSearchParams(location.search).get('ws');
// Template string memilih ws atau wss sesuai protokol halaman yang sedang dibuka.
const WS_URL = configuredWsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;
const PROJECT_ID = new URLSearchParams(location.search).get('project') || 'default';

// let dipakai untuk nilai yang akan berubah selama aplikasi berjalan.
let ws = null;

// ─────────────────────────────────────────────
// MODUL PRE-DEFINED — 8 modul RAB standar konstruksi
// Dibuat otomatis saat pertama kali project dibuka
// ─────────────────────────────────────────────
// Array [] menyimpan daftar object {} yang mewakili modul bawaan.
const PREDEFINED_MODULES = [
  { name: 'Pekerjaan Persiapan',  paletteIdx: 0 },
  { name: 'Pekerjaan Pondasi',    paletteIdx: 1 },
  { name: 'Pekerjaan Struktur',   paletteIdx: 2 },
  { name: 'Pekerjaan Dinding',    paletteIdx: 3 },
  { name: 'Pekerjaan Atap',       paletteIdx: 4 },
  { name: 'Pekerjaan Lantai',     paletteIdx: 5 },
  { name: 'Pekerjaan Finishing',  paletteIdx: 6 },
  { name: 'Pekerjaan MEP',        paletteIdx: 7 },
];
let wsReconnectDelay = 1000;

const DEBOUNCE = 80;
const LOCK_TTL = 3000;

// User ID & Color
const myId    = 'user_' + Math.random().toString(36).slice(2, 7);
const myColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
const myName  = prompt('Masukan nama anda') || 'User';

// STATE
// State adalah data sementara yang menjadi sumber tampilan aplikasi.
let tableData    = [];  // Semua baris + module headers (_type:'moduleHeader')
let activeLocks  = {};  // Sel yang sedang diedit
let remoteEditors = {};
let debounceMap  = {};
let editDirtyMap = {};
let presenceData = {};
const remoteEditHistory = {};
const undoStack = [];
const changedModuleIds = new Set();

// Module modal state
let openModuleId = null; // moduleId yang sedang terbuka di modal

// Palet warna & ikon untuk kartu modul
const MODULE_PALETTES = [
  { bg: '#06141B', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-6h6v6"/></svg>', image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80' },
  { bg: '#11212D', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V9h12v11M4 9h16L12 4 4 9Zm6 5h4"/></svg>', image: 'https://images.unsplash.com/photo-1590725121839-892b458a74fe?auto=format&fit=crop&w=900&q=80' },
  { bg: '#253745', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V7l8-4 8 4v13M8 20v-6h8v6M8 9h.01M12 9h.01M16 9h.01"/></svg>', image: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=900&q=80' },
  { bg: '#4A5C6A', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5h16v15M8 9h8M8 13h8M8 17h5"/></svg>', image: 'https://images.unsplash.com/photo-1531835551805-16d864c8d311?auto=format&fit=crop&w=900&q=80' },
  { bg: '#9BA8AB', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 12 9-7 9 7M5 11v9h14v-9M8 20v-5h8v5"/></svg>', image: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=900&q=80' },
  { bg: '#CCD0CF', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16h12M8 13h8M10 10h4M12 5v5"/></svg>', image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80' },
  { bg: '#253745', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V8h12v12M9 8V5h6v3M9 12h6M9 16h6"/></svg>', image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=80' },
  { bg: '#4A5C6A', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V8h14v12M8 8V5h8v3M8 12h8M8 16h8"/></svg>', image: 'https://images.unsplash.com/photo-1558008258-3256797b43f3?auto=format&fit=crop&w=900&q=80' },
];

// DOM refs
const modulesGrid     = document.getElementById('modulesGrid');
const tableLoading    = document.getElementById('tableLoading');
const totalValueEl    = document.getElementById('totalValue');
const syncDot         = document.getElementById('syncDot');
const syncText        = document.getElementById('syncText');
const toastCont       = document.getElementById('toastContainer');
const userAvatarBadge = document.getElementById('userAvatarBadge');
const moduleModal     = document.getElementById('moduleModal');
const modalTableBody  = document.getElementById('modalTableBody');
const modalModuleName = document.getElementById('modalModuleName');
const modalModuleMeta = document.getElementById('modalModuleMeta');
const modalTotal      = document.getElementById('modalTotal');
const modalIcon       = document.getElementById('modalIcon');
const btnUndo         = document.getElementById('btnUndo');

// DOM refs modal tambah pekerjaan
const addModuleModal      = document.getElementById('addModuleModal');
const btnAddModule        = document.getElementById('btnAddModule');
const btnCloseAddModule   = document.getElementById('btnCloseAddModule');
const btnCancelAddModule  = document.getElementById('btnCancelAddModule');
const btnConfirmAddModule = document.getElementById('btnConfirmAddModule');
const inputModuleName     = document.getElementById('inputModuleName');

// ─────────────────────────────────────────────
// INISIALISASI
// ─────────────────────────────────────────────
// IIFE langsung menjalankan inisialisasi tanpa menunggu pemanggilan manual.
(function init() {
  userAvatarBadge.style.background = myColor;
  userAvatarBadge.textContent = myName.charAt(0);
  userAvatarBadge.title = myName;

  // Event listener menghubungkan aksi user dengan function aplikasi.
  document.getElementById('btnExport').addEventListener('click', exportCSV);
  btnUndo.addEventListener('click', undoLastEdit);
  document.getElementById('btnCloseModal').addEventListener('click', closeModuleModal);
  document.getElementById('modalBtnAddRow').addEventListener('click', () => {
    if (openModuleId) addNewRow(openModuleId);
  });

  if (btnAddModule) btnAddModule.addEventListener('click', openAddModuleModal);
  if (btnCloseAddModule) btnCloseAddModule.addEventListener('click', closeAddModuleModal);
  if (btnCancelAddModule) btnCancelAddModule.addEventListener('click', closeAddModuleModal);
  if (btnConfirmAddModule) btnConfirmAddModule.addEventListener('click', confirmAddModule);
  if (inputModuleName) {
    inputModuleName.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmAddModule();
      if (e.key === 'Escape') closeAddModuleModal();
    });
  }
  if (addModuleModal) {
    addModuleModal.addEventListener('click', e => {
      if (e.target === addModuleModal) closeAddModuleModal();
    });
  }

  // Tutup modal saat klik overlay (di luar modal box)
  moduleModal.addEventListener('click', e => {
    if (e.target === moduleModal) closeModuleModal();
  });

  // Escape tutup modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (addModuleModal && addModuleModal.classList.contains('open')) {
        closeAddModuleModal();
      } else if (openModuleId) {
        closeModuleModal();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && openModuleId) {
      e.preventDefault();
      undoLastEdit();
    }
  });

  const titleEl = document.getElementById('projectName');
  let projectNameDebounce;
  if (titleEl) {
    titleEl.addEventListener('input', () => {
      clearTimeout(projectNameDebounce);
      projectNameDebounce = setTimeout(() => {
        wsSend({ type: 'projectName', payload: titleEl.textContent.trim() || 'Proyek Baru' });
      }, 300);
    });
  }

  window.addEventListener('beforeunload', () => {
    if (openModuleId) {
      wsSend({ type: 'saveState' });
      releaseModuleLock(openModuleId);
    }
    clearMyLocks();
  });

  connectWS();
  setSyncState('connecting');
  updateUndoButton();
})();

// ─────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────
function connectWS() {
  // WebSocket membuka koneksi realtime ke server PHP Ratchet.
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    wsReconnectDelay = 1000;
    setSyncState('ok');
    // JSON.stringify mengubah object JavaScript menjadi teks JSON untuk dikirim.
    ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, userId: myId }));
    sendHeartbeat();
    if (window.__heartbeatInterval) clearInterval(window.__heartbeatInterval);
    window.__heartbeatInterval = setInterval(sendHeartbeat, 3000);
  };

  ws.onmessage = (event) => {
    // JSON.parse mengubah teks JSON dari server menjadi object JavaScript.
    const msg = JSON.parse(event.data);

    if (msg.type === 'state') {
      tableData    = msg.data || [];
      activeLocks  = msg.locks || {};
      remoteEditors = {};
      presenceData = msg.presence || {};

      renderModules();
      updateTotal();
      renderPresence();
      syncAllModuleBrokers(); // tampilkan broker untuk lock yang sudah ada

      const titleEl = document.getElementById('projectName');
      if (titleEl && msg.projectName) titleEl.textContent = msg.projectName;
      return;
    }

    if (msg.type === 'rowUpdate') {
      // ✅ Edit 1 sel → hanya 1 baris yang dikirim & di-broadcast
      const updatedRow = msg.payload;
      if (updatedRow && updatedRow.id != null) {
        const idx = tableData.findIndex(i => i.id === updatedRow.id);
        if (idx !== -1) {
          tableData[idx] = updatedRow;
          patchRow(updatedRow);        // update sel di modal (jika terbuka)
          updateTotal();
          updateModalTotal();
          updateCardInfo(updatedRow.moduleId);
        }
        if (msg.editor?.key && msg.editor.userId !== myId) {
          activeLocks[msg.editor.key] = msg.editor;
          remoteEditors[msg.editor.key] = msg.editor;
          syncRemoteLocks();
          syncAllModuleBrokers();
        }
      }
      return;
    }

    if (msg.type === 'data') {
      tableData = msg.payload || [];
      if (msg.editor?.key && msg.editor.userId !== myId) {
        activeLocks[msg.editor.key] = msg.editor;
        remoteEditors[msg.editor.key] = msg.editor;
      }
      renderModules();
      updateTotal();
      syncRemoteLocks();
      syncAllModuleBrokers();
      // Refresh modal jika sedang terbuka
      if (openModuleId) refreshModal(openModuleId);
      return;
    }

    if (msg.type === 'locks') {
      activeLocks = msg.payload || {};
      syncRemoteLocks();
      syncAllModuleBrokers();
      return;
    }

    if (msg.type === 'editorStart') {
      if (msg.editor?.key && msg.editor.userId !== myId) {
        if (!msg.editor.key.startsWith('__module_')) rememberRemoteEdit(msg.editor);
        activeLocks[msg.editor.key] = msg.editor;
        remoteEditors[msg.editor.key] = msg.editor;
        syncRemoteLocks();
        syncAllModuleBrokers(); // ← broker banner muncul di atas kartu
      }
      return;
    }

    if (msg.type === 'editorStop') {
      if (msg.key) {
        delete activeLocks[msg.key];
        delete remoteEditors[msg.key];
        syncRemoteLocks();
        syncAllModuleBrokers();
      }
      return;
    }

    if (msg.type === 'presence') {
      presenceData = msg.payload || {};
      renderPresence();
      return;
    }

    if (msg.type === 'action') {
      showToast(msg.text, 'info');
      return;
    }

    if (msg.type === 'projectName') {
      const titleEl = document.getElementById('projectName');
      if (!titleEl) return;
      if (document.activeElement !== titleEl && msg.payload) {
        titleEl.textContent = msg.payload;
      }
      return;
    }
  };

  ws.onclose = () => {
    setSyncState('offline');
    setTimeout(connectWS, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 10000);
  };

  ws.onerror = () => ws.close();
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function saveToStorage(editor = null) {
  setSyncState('syncing');
  wsSend({ type: 'data', payload: tableData, editor });
  setTimeout(() => setSyncState('ok'), 200);
}

function saveLocksToStorage() {
  wsSend({ type: 'locks', payload: activeLocks });
}

function clearMyLocks() {
  for (const key in activeLocks) {
    if (activeLocks[key].userId === myId) delete activeLocks[key];
  }
  saveLocksToStorage();
}

function sendHeartbeat() {
  wsSend({ type: 'presence', userId: myId, entry: { name: myName, color: myColor, ts: Date.now() } });
}

function renderPresence() {
  const container = document.getElementById('presenceAvatars');
  if (!container) return;
  container.innerHTML = '';
  const now = Date.now();
  for (const pId in presenceData) {
    if (pId === myId) continue;
    const p = presenceData[pId];
    if (now - p.ts <= 10000) {
      const div = document.createElement('div');
      div.className = 'presence-avatar';
      div.style.background = p.color;
      div.textContent = p.name.charAt(0);
      div.dataset.name = p.name;
      container.appendChild(div);
    }
  }
}

/* ════════════════════════════════════════════
   MODULE HELPERS
   ════════════════════════════════════════════ */

function getModuleHeaders() {
  return tableData.filter(r => r._type === 'moduleHeader');
}

function getModuleRows(moduleId) {
  // filter() menghasilkan array baru yang hanya berisi baris modul tertentu.
  return tableData.filter(r => !r._type && r.moduleId === moduleId);
}

// Pastikan semua modul pre-defined ada. Jika belum ada (project baru),
// buat semua 8 modul sekaligus. Row lama tanpa moduleId → masuk modul pertama.
function ensureDefaultModule() {
  let headers = getModuleHeaders();

  if (headers.length === 0) {
    // Project baru — buat semua modul pre-defined
    PREDEFINED_MODULES.forEach((m, idx) => {
      const moduleId = `mod_preset_${idx}`;
      headers.push({
        id:         `__${moduleId}`,
        _type:      'moduleHeader',
        moduleId,
        name:       m.name,
        paletteIdx: m.paletteIdx,
      });
    });
    // Sisipkan semua header di awal tableData
    tableData.unshift(...headers);
  }

  // Assign row lama yang belum punya moduleId ke modul pertama
  const firstId = headers[0].moduleId;
  tableData.forEach(r => { if (!r._type && !r.moduleId) r.moduleId = firstId; });
}

function getModulePalette(header) {
  const predefinedIndex = PREDEFINED_MODULES.findIndex(module => module.name === header.name);
  const idx = predefinedIndex >= 0
    ? PREDEFINED_MODULES[predefinedIndex].paletteIdx
    : (header.paletteIdx ?? 0) % MODULE_PALETTES.length;
  return MODULE_PALETTES[idx];
}

/* ════════════════════════════════════════════
   TAMBAH PEKERJAAN MODAL FUNCTIONS
   ════════════════════════════════════════════ */

function openAddModuleModal() {
  if (!addModuleModal) return;
  if (inputModuleName) inputModuleName.value = '';
  addModuleModal.classList.add('open');
  if (inputModuleName) setTimeout(() => inputModuleName.focus(), 100);
}

function closeAddModuleModal() {
  if (!addModuleModal) return;
  addModuleModal.classList.remove('open');
}

function confirmAddModule() {
  if (!inputModuleName) return;
  const name = inputModuleName.value.trim();
  if (!name) {
    showToast('Nama pekerjaan tidak boleh kosong', 'warn');
    inputModuleName.focus();
    return;
  }

  const moduleId = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const headers = getModuleHeaders();
  const paletteIdx = headers.length % MODULE_PALETTES.length;

  const newHeader = {
    id: `__${moduleId}`,
    _type: 'moduleHeader',
    moduleId: moduleId,
    name: name,
    paletteIdx: paletteIdx,
  };

  const newRow = {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    moduleId: moduleId,
    uraian: 'Bahan Utama',
    volume: 1,
    satuan: 'ls',
    harga_satuan: 0,
    jumlah: 0,
    keterangan: '',
  };

  tableData.push(newHeader, newRow);
  saveToStorage({ userId: myId, name: myName });
  wsSend({ type: 'action', text: `${myName} menambahkan pekerjaan ${name}` });

  renderModules();
  updateTotal();
  closeAddModuleModal();
  showToast(`Pekerjaan "${name}" berhasil ditambahkan`, 'success');
}

/* ════════════════════════════════════════════
   RENDER MODULES — tabel utama
   ════════════════════════════════════════════ */

function renderModules() {
  ensureDefaultModule();
  modulesGrid.innerHTML = '';
  tableLoading.style.display = 'none';

  const headers = getModuleHeaders();

  // Buat struktur tabel
  const table = document.createElement('table');
  table.className = 'modules-main-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-center" style="width:48px">No.</th>
        <th>Nama Pekerjaan</th>
        <th class="col-center">Jumlah Bahan</th>
        <th class="col-right">Total Biaya</th>
        <th class="col-center">Status</th>
        <th class="col-right" style="padding-right:20px">Aksi</th>
      </tr>
    </thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  headers.forEach((header, idx) => {
    if (header.paletteIdx === undefined) header.paletteIdx = idx;
    // Baris broker (tersembunyi, muncul jika ada lock)
    const brokerTr = document.createElement('tr');
    brokerTr.className = 'module-broker-row';
    brokerTr.dataset.moduleBrokerRow = header.moduleId;
    brokerTr.style.display = 'none';
    const brokerTd = document.createElement('td');
    brokerTd.colSpan = 6;
    brokerTr.appendChild(brokerTd);
    tbody.appendChild(brokerTr);

    // Baris data modul
    tbody.appendChild(createModuleCard(header, idx + 1));
  });

  modulesGrid.appendChild(table);
  syncAllModuleBrokers();
}

// ─────────────────────────────────────────────
// Buat BARIS TABEL untuk 1 modul (tampilan tabel utama)
// Klik baris / tombol Edit → buka modal (logika tidak berubah)
// ─────────────────────────────────────────────
function createModuleCard(header, rowNo) {
  const moduleId = header.moduleId;
  const palette  = getModulePalette(header);
  const rows     = getModuleRows(moduleId);
  const total    = rows.reduce((s, r) => s + (r.jumlah || 0), 0);
  const hasData  = rows.length > 0;

  const tr = document.createElement('tr');
  tr.className = 'module-row';
  tr.dataset.moduleCard = moduleId;

  // ── Col 1: No ──
  const tdNo = document.createElement('td');
  tdNo.className = 'col-mod-no';
  tdNo.textContent = rowNo ?? '';

  // ── Col 2: Nama Pekerjaan (ikon + nama) ──
  const tdName = document.createElement('td');
  tdName.className = 'col-mod-name';
  const nameCell = document.createElement('div');
  nameCell.className = 'mod-name-cell';
  const iconThumb = document.createElement('div');
  iconThumb.className = 'mod-icon-thumb';
  iconThumb.style.backgroundColor = palette.bg;
  iconThumb.style.backgroundImage = `linear-gradient(135deg, rgba(6,20,27,.1), rgba(6,20,27,.55)), url("${palette.image}")`;
  iconThumb.innerHTML = palette.icon;
  const nameText = document.createElement('span');
  nameText.className = 'mod-name-text';
  nameText.textContent = header.name;
  nameCell.appendChild(iconThumb);
  nameCell.appendChild(nameText);
  tdName.appendChild(nameCell);

  // ── Col 3: Jumlah Bahan ──
  const tdCount = document.createElement('td');
  tdCount.className = 'col-mod-count';
  const badge = document.createElement('span');
  badge.className = 'mod-badge';
  badge.dataset.cardRowcount = moduleId;
  badge.textContent = `${rows.length} bahan`;
  tdCount.appendChild(badge);

  // ── Col 4: Total Biaya ──
  const tdTotal = document.createElement('td');
  tdTotal.className = 'col-mod-total';
  const totalSpan = document.createElement('span');
  totalSpan.className = 'mod-total-val';
  totalSpan.dataset.cardTotal = moduleId;
  totalSpan.textContent = formatCurrency(total);
  tdTotal.appendChild(totalSpan);

  // ── Col 5: Status ──
  const tdStatus = document.createElement('td');
  tdStatus.className = 'col-mod-status';
  const statusBadge = document.createElement('span');
  statusBadge.className = `mod-status-badge ${hasData ? 'has-data' : 'empty'}`;
  statusBadge.dataset.cardStatus = moduleId;
  statusBadge.textContent = hasData ? 'Ada Data' : 'Kosong';
  tdStatus.appendChild(statusBadge);

  // ── Col 6: Aksi ──
  const tdAction = document.createElement('td');
  tdAction.className = 'col-mod-action';
  const btnEdit = document.createElement('button');
  btnEdit.className = 'btn-mod-edit';
  btnEdit.dataset.moduleEditBtn = moduleId;
  btnEdit.innerHTML = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none">
    <path d="M9.5 1.5l3 3-8 8H1.5v-3l8-8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  </svg> Edit`;
  btnEdit.addEventListener('click', e => {
    e.stopPropagation();
    openModuleModal(moduleId);
  });
  tdAction.appendChild(btnEdit);

  tr.appendChild(tdNo);
  tr.appendChild(tdName);
  tr.appendChild(tdCount);
  tr.appendChild(tdTotal);
  tr.appendChild(tdStatus);
  tr.appendChild(tdAction);

  return tr;
}

// Update info di baris tabel (rowcount + total + status) tanpa rebuild
function updateCardInfo(moduleId) {
  const rows    = getModuleRows(moduleId);
  const total   = rows.reduce((s, r) => s + (r.jumlah || 0), 0);
  const hasData = rows.length > 0;

  const countEl  = document.querySelector(`[data-card-rowcount="${moduleId}"]`);
  const totalEl  = document.querySelector(`[data-card-total="${moduleId}"]`);
  const statusEl = document.querySelector(`[data-card-status="${moduleId}"]`);

  if (countEl) countEl.textContent = `${rows.length} bahan`;
  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (statusEl) {
    statusEl.textContent = hasData ? 'Ada Data' : 'Kosong';
    statusEl.className = `mod-status-badge ${hasData ? 'has-data' : 'empty'}`;
  }
}

/* ════════════════════════════════════════════
   MODULE MODAL — tabel editing muncul di overlay
   ════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// Buka modal untuk modul tertentu
// Langsung broadcast editorStart dengan key __module_<moduleId>
// agar user lain langsung tahu modul ini sedang dibuka
// ─────────────────────────────────────────────
function openModuleModal(moduleId) {
  // Jika sudah ada modal terbuka, tutup dulu
  if (openModuleId && openModuleId !== moduleId) closeModuleModal();

  openModuleId = moduleId;
  refreshModal(moduleId);
  moduleModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // ── Broadcast module-level lock via editorStart ──
  // Pakai key khusus: '__module_mod_xxx' agar tidak bentrok dengan key sel biasa
  wsSend({
    type: 'editorStart',
    editor: {
      key: `__module_${moduleId}`,
      userId: myId,
      name: myName,
      color: myColor,
      ts: Date.now(),
    },
  });
  // Simpan di lokal DAN kirim ke server via locks message
  // → server menyimpan lock ini, sehingga User B yang join belakangan juga dapat info ini
  activeLocks[`__module_${moduleId}`] = { userId: myId, name: myName, color: myColor, ts: Date.now() };
  saveLocksToStorage(); // ← kunci ini sekarang disimpan di server!
}

// ─────────────────────────────────────────────
// Tutup modal & lepas module-level lock
// ─────────────────────────────────────────────
function closeModuleModal() {
  if (!openModuleId) return;
  const moduleId = openModuleId;
  wsSend({ type: 'saveState' }); // ✅ Simpan seluruh perubahan ke DB SQLite saat modal ditutup
  if (changedModuleIds.delete(moduleId)) {
    const module = getModuleHeaders().find(header => header.moduleId === moduleId);
    wsSend({ type: 'action', text: `${myName} mengedit modul ${module?.name || 'ini'}` });
  }
  releaseModuleLock(moduleId);
  openModuleId = null;
  moduleModal.classList.remove('open');
  document.body.style.overflow = '';
}

function releaseModuleLock(moduleId) {
  wsSend({
    type: 'editorStop',
    key: `__module_${moduleId}`,
    userId: myId,
    editor: {
      key: `__module_${moduleId}`,
      moduleId: moduleId,
      userId: myId,
      name: myName,
      color: myColor,
    },
  });
  delete activeLocks[`__module_${moduleId}`];
  saveLocksToStorage(); // ← beritahu server bahwa lock sudah dilepas
  syncAllModuleBrokers();
}

// ─────────────────────────────────────────────
// Render isi modal (header info + tbody)
// ─────────────────────────────────────────────
function refreshModal(moduleId) {
  const header  = getModuleHeaders().find(h => h.moduleId === moduleId);
  const rows    = getModuleRows(moduleId);
  const palette = getModulePalette(header || { paletteIdx: 0 });
  const total   = rows.reduce((s, r) => s + (r.jumlah || 0), 0);

  // Header modal
  modalModuleName.textContent = header?.name || 'Modul';
  modalModuleMeta.textContent = `${rows.length} bahan yang dibutuhkan`;
  modalTotal.textContent = formatCurrency(total);
  modalIcon.innerHTML = palette.icon;
  modalIcon.style.background = palette.bg;

  // Tbody: beri data-module-tbody agar addNewRow / patchRow bisa menemukan elemen
  modalTableBody.dataset.moduleTbody = moduleId;
  modalTableBody.innerHTML = '';

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'modal-empty-row';
    tr.dataset.emptyFor = moduleId;
    tr.innerHTML = `<td colspan="8">Belum ada bahan. Klik "+ Tambah Bahan" untuk memulai.</td>`;
    modalTableBody.appendChild(tr);
  } else {
    rows.forEach(row => modalTableBody.appendChild(createRow(row)));
  }
}

function updateModalTotal() {
  if (!openModuleId) return;
  const rows  = getModuleRows(openModuleId);
  const total = rows.reduce((s, r) => s + (r.jumlah || 0), 0);
  modalTotal.textContent = formatCurrency(total);
  modalModuleMeta.textContent = `${rows.length} bahan yang dibutuhkan`;
}

/* ════════════════════════════════════════════
   RENDER ROW — baris tabel (dipakai di modal)
   ════════════════════════════════════════════ */

function createRow(item) {
  const tr = document.createElement('tr');
  tr.dataset.id = item.id;
  tr.classList.add('row-new');

  const columns = [
    { key: 'no',           editable: false, type: 'number',   align: 'center', cssClass: 'td-no' },
    { key: 'uraian',       editable: true,  type: 'text',     align: 'left'   },
    { key: 'volume',       editable: true,  type: 'number',   align: 'right'  },
    { key: 'satuan',       editable: true,  type: 'text',     align: 'center' },
    { key: 'harga_satuan', editable: true,  type: 'currency', align: 'right'  },
    { key: 'jumlah',       editable: false, type: 'currency', align: 'right',  computed: true },
    { key: 'keterangan',   editable: true,  type: 'text',     align: 'left'   },
  ];

  for (const col of columns) {
    const td = document.createElement('td');
    td.dataset.field = col.key;
    if (col.cssClass) td.className = col.cssClass;

    if (col.computed) {
      td.innerHTML = `<span class="cell-editable cell-numeric cell-formatted positive" style="pointer-events:none;user-select:none;">${formatCurrency(item.jumlah)}</span>`;
    } else if (col.editable) {
      const div = document.createElement('div');
      div.className = 'cell-editable';
      div.contentEditable = 'true';
      div.spellcheck = false;
      div.dataset.field    = col.key;
      div.dataset.itemId   = item.id;
      div.dataset.type     = col.type;
      div.dataset.moduleId = item.moduleId;

      if (col.type === 'currency' || col.type === 'number') div.classList.add('cell-numeric');
      if (col.align === 'center') div.classList.add('cell-center');

      div.textContent = displayValue(item[col.key], col.type);
      div.addEventListener('focus',   onCellFocus);
      div.addEventListener('blur',    onCellBlur);
      div.addEventListener('input',   onCellInput);
      div.addEventListener('keydown', onCellKeydown);

      // Tampilkan lock jika sudah ada
      const lockKey = `${item.id}_${col.key}`;
      const remoteLock = remoteEditors[lockKey] || activeLocks[lockKey];
      if (remoteLock && remoteLock.userId !== myId) {
        div.classList.add('editing-other');
        addTypingLabel(div, remoteLock);
      }

      td.appendChild(div);
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'display:block; padding:10px 14px; color:var(--text-muted);';
      if (col.type === 'number') {
        span.style.fontFamily = "'JetBrains Mono', monospace";
        span.style.fontSize = '.75rem';
        span.style.textAlign = 'center';
      }
      span.textContent = item[col.key];
      td.appendChild(span);
    }
    tr.appendChild(td);
  }

  const tdAct = document.createElement('td');
  tdAct.className = 'td-action col-act';
  tdAct.innerHTML = `
    <button class="btn-del-row" data-id="${item.id}" title="Hapus bahan">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>`;
  tdAct.querySelector('.btn-del-row').addEventListener('click', () => deleteRow(item.id));
  tr.appendChild(tdAct);

  return tr;
}

function patchRow(item) {
  const tr = document.querySelector(`tr[data-id="${item.id}"]`);
  if (!tr) return;

  tr.querySelectorAll('[data-field]').forEach(cell => {
    const field = cell.dataset.field;
    const lockKey = `${item.id}_${field}`;
    const activeLock = remoteEditors[lockKey] || activeLocks[lockKey];
    const isOtherLocked = activeLock && activeLock.userId !== myId;

    if (document.activeElement === cell) return;

    if (field === 'jumlah') {
      const span = cell.querySelector('span');
      if (span) span.textContent = formatCurrency(item.jumlah);
    } else if (cell.contentEditable === 'true') {
      const newVal = displayValue(item[field], cell.dataset.type);
      if (cell.textContent !== newVal) cell.textContent = newVal;

      if (isOtherLocked) {
        if (!cell.classList.contains('editing-other') || !cell.parentElement.querySelector('.typing-label')) {
          cell.classList.add('editing-other');
          addTypingLabel(cell, activeLock);
        }
      } else {
        cell.classList.remove('editing-other');
        cell.parentElement.querySelector('.typing-label')?.remove();
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }
    }
  });
}

/* ════════════════════════════════════════════
   CELL EVENTS
   ════════════════════════════════════════════ */

function onCellFocus(e) {
  const cell = e.currentTarget;
  const key = `${cell.dataset.itemId}_${cell.dataset.field}`;
  editDirtyMap[key] = false;
  cell.classList.add('editing-you');
  sendLock(cell.dataset.itemId, cell.dataset.field, true);
  sendEditorPresence(cell, true);
  selectAllContent(cell);
}

function onCellBlur(e) {
  const cell = e.currentTarget;
  const key = `${cell.dataset.itemId}_${cell.dataset.field}`;
  const wasDirty = editDirtyMap[key];
  cell.classList.remove('editing-you');
  removeTypingLabel(cell);
  sendLock(cell.dataset.itemId, cell.dataset.field, false);
  sendEditorPresence(cell, false);

  clearTimeout(debounceMap[key]);
  saveCell(cell);
  delete editDirtyMap[key];

  if (wasDirty) {
    const item = tableData.find(i => i.id === parseInt(cell.dataset.itemId));
    if (item?.moduleId) changedModuleIds.add(item.moduleId);
  }
}

function onCellInput(e) {
  const cell = e.currentTarget;
  const key = `${cell.dataset.itemId}_${cell.dataset.field}`;
  editDirtyMap[key] = true;
  if (cell.dataset.field === 'volume' || cell.dataset.field === 'harga_satuan') {
    updateComputedJumlah(cell);
  }
  sendLock(cell.dataset.itemId, cell.dataset.field, true);
  clearTimeout(debounceMap[key]);
  debounceMap[key] = setTimeout(() => saveCell(cell), DEBOUNCE);
}

function onCellKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const nextTr = e.currentTarget.closest('tr')?.nextElementSibling;
    if (nextTr) nextTr.querySelector(`[data-field="${e.currentTarget.dataset.field}"]`)?.focus();
  }
  if (e.key === 'Escape') e.currentTarget.blur();
}

/* ════════════════════════════════════════════
   CRUD & LOCK
   ════════════════════════════════════════════ */

function saveCell(cell) {
  // Membaca nilai dari DOM, memperbarui state, lalu mengirim perubahan ke server.
  const itemId = parseInt(cell.dataset.itemId);
  const field  = cell.dataset.field;
  let rawValue = cell.textContent.trim();

  if (cell.dataset.type === 'number' || cell.dataset.type === 'currency') {
    rawValue = parseFloat(rawValue.replace(/[^0-9.-]/g, '')) || 0;
  }

  const itemIndex = tableData.findIndex(i => i.id === itemId);
  if (itemIndex === -1) return;
  const item = tableData[itemIndex];
  if (item[field] === rawValue) return;
  const beforeValue = item[field];
  const beforeJumlah = item.jumlah;

  const patch = { [field]: rawValue };
  if (field === 'volume' || field === 'harga_satuan') {
    const vol  = field === 'volume' ? rawValue : item.volume;
    const hsat = field === 'harga_satuan' ? rawValue : item.harga_satuan;
    patch.jumlah = vol * hsat;
  }

  // Object.assign menggabungkan property patch ke object item.
  Object.assign(item, patch);
  undoStack.push({
    itemId,
    moduleId: item.moduleId,
    field,
    before: beforeValue,
    after: rawValue,
    beforeJumlah: field === 'volume' || field === 'harga_satuan' ? beforeJumlah : undefined,
    afterJumlah: patch.jumlah,
  });
  updateUndoButton();
  updateTotal();
  updateModalTotal();
  updateCardInfo(item.moduleId);

  // ✅ Kirim 1 baris yang berubah (persist: false agar TIDAK tulis DB per sel)
  wsSend({
    type: 'rowUpdate',
    payload: item,
    persist: false,
    editor: { key: `${itemId}_${field}`, userId: myId, name: myName, color: myColor, ts: Date.now() },
  });
  setSyncState('syncing');
  setTimeout(() => setSyncState('ok'), 200);
}

function updateUndoButton() {
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
}

function undoLastEdit() {
  const lastEdit = undoStack.pop();
  updateUndoButton();
  if (!lastEdit) return;

  const item = tableData.find(row => row.id === lastEdit.itemId);
  if (!item || item.moduleId !== openModuleId || item[lastEdit.field] !== lastEdit.after) {
    showToast('Undo dibatalkan karena bahan sudah berubah', 'warn');
    return;
  }

  item[lastEdit.field] = lastEdit.before;
  if (lastEdit.afterJumlah !== undefined) item.jumlah = lastEdit.beforeJumlah;
  patchRow(item);
  updateTotal();
  updateModalTotal();
  updateCardInfo(item.moduleId);
  wsSend({
    type: 'rowUpdate',
    payload: item,
    persist: false,
    editor: { key: `${item.id}_${lastEdit.field}`, userId: myId, name: myName, color: myColor, ts: Date.now() },
  });
  showToast('Perubahan terakhir dibatalkan', 'info');
}

function sendLock(itemId, field, isLocking) {
  const key = `${itemId}_${field}`;
  if (isLocking) {
    activeLocks[key] = { userId: myId, name: myName, color: myColor, ts: Date.now() };
  } else {
    delete activeLocks[key];
  }
  saveLocksToStorage();
}

function sendEditorPresence(cell, isEditing) {
  const key = `${cell.dataset.itemId}_${cell.dataset.field}`;
  const item = tableData.find(row => row.id === parseInt(cell.dataset.itemId));
  const fieldLabels = {
    uraian: 'Nama Bahan', volume: 'Volume', satuan: 'Satuan',
    harga_satuan: 'Harga Satuan', keterangan: 'Keterangan',
  };
  wsSend(isEditing
    ? { type: 'editorStart', editor: {
        key, userId: myId, name: myName, color: myColor, ts: Date.now(),
        moduleId: cell.dataset.moduleId,
        itemNo: item?.no || '?',
        field: cell.dataset.field,
        fieldLabel: fieldLabels[cell.dataset.field] || cell.dataset.field,
      } }
    : { type: 'editorStop',  key, userId: myId });
}

function rememberRemoteEdit(editor) {
  if (!editor.moduleId || !editor.field) return;
  const historyKey = `${editor.userId}_${editor.moduleId}`;
  const editedParts = remoteEditHistory[historyKey] || [];
  const partKey = `${editor.itemNo}_${editor.field}`;
  if (!editedParts.some(part => part.key === partKey)) {
    editedParts.push({
      key: partKey,
      itemNo: editor.itemNo,
      fieldLabel: editor.fieldLabel || editor.field,
    });
  }
  remoteEditHistory[historyKey] = editedParts;
}

// ─────────────────────────────────────────────
// Tambah baris baru ke modul (lewat modal)
// ─────────────────────────────────────────────
function addNewRow(moduleId) {
  const moduleRows = getModuleRows(moduleId);
  const maxNo = moduleRows.reduce((m, i) => Math.max(m, i.no || 0), 0);
  const newItem = {
    id: Date.now(), moduleId,
    no: maxNo + 1, uraian: '', volume: 0,
    satuan: 'unit', harga_satuan: 0, jumlah: 0, keterangan: ''
  };

  tableData.push(newItem);

  // Hapus empty row placeholder
  const emptyRow = document.querySelector(`tr[data-empty-for="${moduleId}"]`);
  if (emptyRow) emptyRow.remove();

  // Tambah ke tbody modal
  const tbody = document.querySelector(`[data-module-tbody="${moduleId}"]`);
  if (tbody) tbody.appendChild(createRow(newItem));

  updateTotal();
  updateModalTotal();
  updateCardInfo(moduleId);
  changedModuleIds.add(moduleId);
  saveToStorage();

  setTimeout(() => {
    const lastTr = tbody?.querySelector('tr:last-child');
    lastTr?.querySelector('.cell-editable[data-field="uraian"]')?.focus();
  }, 50);
}

// addNewModule() dihapus — modul sudah pre-defined otomatis

// deleteModule() dihapus — modul pre-defined tidak bisa dihapus

// ─────────────────────────────────────────────
// Hapus satu baris
// ─────────────────────────────────────────────
function deleteRow(itemId) {
  const item = tableData.find(i => i.id === itemId);
  const moduleId = item?.moduleId;
  if (!confirm('Hapus bahan ini?')) return;

  tableData = tableData.filter(i => i.id !== itemId);
  // Renumber dalam modul saja
  getModuleRows(moduleId).forEach((r, idx) => { r.no = idx + 1; });

  const tr = document.querySelector(`tr[data-id="${itemId}"]`);
  if (tr) {
    tr.style.transition = 'opacity .2s, transform .2s';
    tr.style.opacity = '0';
    tr.style.transform = 'translateX(20px)';
    setTimeout(() => {
      tr.remove();
      // Tampilkan empty state jika modul kosong
      if (getModuleRows(moduleId).length === 0) {
        const tbody = document.querySelector(`[data-module-tbody="${moduleId}"]`);
        if (tbody) {
          const tr2 = document.createElement('tr');
          tr2.className = 'modal-empty-row';
          tr2.dataset.emptyFor = moduleId;
          tr2.innerHTML = `<td colspan="8">Belum ada bahan. Klik "+ Tambah Bahan" untuk memulai.</td>`;
          tbody.appendChild(tr2);
        }
      }
    }, 200);
  }

  updateTotal();
  updateModalTotal();
  updateCardInfo(moduleId);
  saveToStorage();
  showToast('Bahan dihapus', 'info');
  if (moduleId) changedModuleIds.add(moduleId);
}

/* ════════════════════════════════════════════
   COMPUTED & UTILS
   ════════════════════════════════════════════ */

function updateComputedJumlah(editedCell) {
  const itemId = parseInt(editedCell.dataset.itemId);
  const item   = tableData.find(i => i.id === itemId);
  if (!item) return;

  const tr = document.querySelector(`tr[data-id="${itemId}"]`);
  if (!tr) return;

  const vol  = parseFloat(tr.querySelector('[data-field="volume"]')?.textContent) || 0;
  const hsat = parseFloat(tr.querySelector('[data-field="harga_satuan"]')?.textContent.replace(/[^0-9.-]/g, '')) || 0;
  const jml  = vol * hsat;

  const jmlCell = tr.querySelector('[data-field="jumlah"] span');
  if (jmlCell) jmlCell.textContent = formatCurrency(jml);
  item.jumlah = jml;
  updateTotal();
  updateModalTotal();
  updateCardInfo(item.moduleId);
}

function updateTotal() {
  // reduce() menjumlahkan seluruh nilai jumlah dari baris bahan.
  const total = tableData.filter(r => !r._type).reduce((s, i) => s + (i.jumlah || 0), 0);
  if (totalValueEl) totalValueEl.textContent = formatCurrency(total);
}

function addTypingLabel(cell, lockInfo) {
  const parentTd = cell.parentElement;
  parentTd.querySelector('.typing-label')?.remove();
  const label = document.createElement('span');
  label.className = 'typing-label';
  const dot = document.createElement('span');
  dot.className = 'typing-label-dot';
  dot.textContent = (lockInfo.name || '?').charAt(0).toUpperCase();
  label.appendChild(dot);
  const nameText = document.createElement('span');
  nameText.textContent = lockInfo.name;
  label.appendChild(nameText);
  parentTd.style.setProperty('--lock-color', lockInfo.color);
  cell.style.borderColor = lockInfo.color;
  parentTd.style.position = 'relative';
  parentTd.appendChild(label);
}

function removeTypingLabel(cell) {
  const parentTd = cell.parentElement;
  parentTd.querySelector('.typing-label')?.remove();
  parentTd.style.removeProperty('--lock-color');
  cell.style.borderColor = '';
  cell.style.boxShadow = '';
}

// patchRow wrapper: reset border sel tak terkunci
const _origPatchRow = patchRow;
patchRow = function (item) {
  _origPatchRow(item);
  const tr = document.querySelector(`tr[data-id="${item.id}"]`);
  if (!tr) return;
  tr.querySelectorAll('.cell-editable').forEach(cell => {
    if (!cell.classList.contains('editing-other') && !cell.classList.contains('editing-you')) {
      cell.style.borderColor = '';
      cell.style.boxShadow = '';
    }
  });
};

function setSyncState(state) {
  syncDot.className = 'sync-dot';
  if (state === 'ok')         { syncText.textContent = 'Terhubung'; }
  else if (state === 'syncing')  { syncDot.classList.add('syncing'); syncText.textContent = 'Menyimpan...'; }
  else if (state === 'connecting') { syncText.textContent = 'Menghubungkan...'; }
  else if (state === 'offline')  { syncText.textContent = 'Terputus, menyambung ulang...'; }
}

function formatCurrency(val) {
  if (val == null || isNaN(val)) return 'Rp 0';
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

function displayValue(val, type) {
  if (val == null) return '';
  if (type === 'currency') return Math.round(val).toLocaleString('id-ID');
  return String(val);
}

function selectAllContent(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'error' ? 'err' : type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  toastCont.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function exportCSV() {
  // Blob membuat file sementara di browser tanpa upload ke server.
  const modMap = {};
  getModuleHeaders().forEach(h => { modMap[h.moduleId] = h.name; });

  const dataRows = tableData.filter(r => !r._type);
  const headers  = ['No', 'Modul', 'Uraian Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah', 'Keterangan'];
  const rows = dataRows.map(item => [
    item.no,
    `"${modMap[item.moduleId] || item.moduleId}"`,
    `"${item.uraian}"`,
    item.volume, item.satuan, item.harga_satuan, item.jumlah,
    `"${item.keterangan}"`
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'RAB_Estimasi.csv';
  a.click();
}

// ─────────────────────────────────────────────
// Sync lock indicator di sel (warna border + label nama user)
// ─────────────────────────────────────────────
function syncRemoteLocks() {
  document.querySelectorAll('.cell-editable').forEach(cell => {
    const lockKey = `${cell.dataset.itemId}_${cell.dataset.field}`;
    const lockInfo = remoteEditors[lockKey] || activeLocks[lockKey];
    const isOtherLocked = lockInfo && lockInfo.userId !== myId;
    const hasLabel = cell.parentElement.querySelector('.typing-label');

    if (isOtherLocked) {
      cell.classList.add('editing-other');
      if (!hasLabel) addTypingLabel(cell, lockInfo);
    } else if (!cell.classList.contains('editing-you')) {
      cell.classList.remove('editing-other');
      cell.parentElement.querySelector('.typing-label')?.remove();
      cell.style.borderColor = '';
      cell.style.boxShadow = '';
    }
  });
}

/* ════════════════════════════════════════════
   MODULE BROKER BANNER
   Muncul DI ATAS / DI LUAR kartu — realtime tanpa reload
   ════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// Cek apakah modul ini sedang dibuka/diedit oleh user lain.
// Cek key '__module_<moduleId>' yang dikirim saat openModuleModal()
// ─────────────────────────────────────────────
function isModuleLocked(moduleId) {
  // Cek module-level lock (user lain punya modal terbuka)
  const moduleKey = `__module_${moduleId}`;
  const modLock = remoteEditors[moduleKey] || activeLocks[moduleKey];
  if (modLock && modLock.userId !== myId) return modLock;

  // Cek cell-level lock (user lain sedang aktif di sel dalam modul ini)
  const rows   = getModuleRows(moduleId);
  const fields = ['uraian', 'volume', 'satuan', 'harga_satuan', 'keterangan'];
  for (const row of rows) {
    for (const field of fields) {
      const key  = `${row.id}_${field}`;
      const lock = remoteEditors[key] || activeLocks[key];
      if (lock && lock.userId !== myId) return lock;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Re-sync semua broker banner di semua kartu
// Dipanggil setiap kali editorStart / editorStop / locks diterima
// ─────────────────────────────────────────────
function syncAllModuleBrokers() {
  for (const header of getModuleHeaders()) {
    const lockInfo = isModuleLocked(header.moduleId);
    if (lockInfo) showModuleBroker(header.moduleId, lockInfo);
    else          hideModuleBroker(header.moduleId);
  }

  // Update tombol Edit: jika modul dikunci orang lain, tambah class 'locked'
  document.querySelectorAll('[data-module-edit-btn]').forEach(btn => {
    const moduleId = btn.dataset.moduleEditBtn;
    const locked   = isModuleLocked(moduleId);
    if (locked) {
      btn.classList.add('locked');
      btn.title = `Dikunci oleh ${locked.name}`;
    } else {
      btn.classList.remove('locked');
      btn.title = '';
    }
  });
}

// ─────────────────────────────────────────────
// Tampilkan broker banner di baris tabel atas modul
// ─────────────────────────────────────────────
function showModuleBroker(moduleId, userInfo) {
  const brokerRow = document.querySelector(`[data-module-broker-row="${moduleId}"]`);
  if (!brokerRow) return;
  brokerRow.style.display = '';
  const td = brokerRow.querySelector('td');
  if (!td) return;

  let banner = td.querySelector('.module-broker-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'module-broker-banner';
    td.appendChild(banner);
  } else {
    banner.className = 'module-broker-banner';
  }

  banner.innerHTML = `
    <span class="broker-avatar" style="background:${userInfo.color || '#f59e0b'}">
      ${(userInfo.name || '?').charAt(0).toUpperCase()}
    </span>
    <div class="broker-text">
      <strong>${userInfo.name || 'Seseorang'}</strong> sedang mengedit modul ini
    </div>
    <span class="broker-pulse"></span>
  `;

  banner.classList.remove('visible');
  void banner.offsetWidth;
  banner.classList.add('visible');
}

// ─────────────────────────────────────────────
// Sembunyikan broker banner ketika modul sudah bebas
// ─────────────────────────────────────────────
function hideModuleBroker(moduleId) {
  const brokerRow = document.querySelector(`[data-module-broker-row="${moduleId}"]`);
  if (!brokerRow) return;
  const banner = brokerRow.querySelector('.module-broker-banner');
  if (!banner) {
    brokerRow.style.display = 'none';
    return;
  }

  banner.classList.remove('visible');
  setTimeout(() => {
    if (banner.isConnected) banner.remove();
    if (!brokerRow.querySelector('.module-broker-banner')) {
      brokerRow.style.display = 'none';
    }
  }, 350);
}