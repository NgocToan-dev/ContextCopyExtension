/**
 * Popup logic cho AMIS Chat Sender
 */

// --- State ---
let senderId = '';
let senderName = '';
let conversations = [];

// --- Storage helpers ---
const STORAGE_KEY = 'amis_conversations';

async function loadConversations() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  conversations = result[STORAGE_KEY] || [];
}

async function saveConversations() {
  await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
}

// --- DOM refs ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  userBar: $('#user-bar'),
  tabs: $$('.tab'),
  tabContents: $$('.tab-content'),
  convId: $('#conv-id'),
  convName: $('#conv-name'),
  btnAdd: $('#btn-add'),
  convList: $('#conv-list'),
  senderLabel: $('#sender-label'),
  sendList: $('#send-list'),
  msgContent: $('#msg-content'),
  btnSelectAll: $('#btn-select-all'),
  btnSend: $('#btn-send'),
  sendResult: $('#send-result'),
  errorBanner: $('#error-banner'),
};

// --- Init ---

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.startsWith('https://misajsc.amis.vn')) {
      showError('Vui lòng mở extension trên trang misajsc.amis.vn.');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getContextData' });

    if (!response || !response.success || !response.data) {
      showError('Không đọc được contextData. Hãy đăng nhập vào AMIS trước.');
      return;
    }

    const ctx = response.data;
    const user = ctx.User || {};
    senderId = user.misa_id || '';
    const lastName = user.last_name || '';
    const firstName = user.first_name || '';
    senderName = [lastName, firstName].filter(Boolean).join(' ') || user.user_name || 'Unknown';

    dom.userBar.textContent = `👤 ${senderName} (${senderId})`;
    dom.senderLabel.textContent = `Người gửi: ${senderName}`;

    await loadConversations();
    renderAll();
  } catch (e) {
    showError('Lỗi kết nối: ' + e.message + ' — Vui lòng mở extension trên trang AMIS.');
  }
}

function showError(msg) {
  dom.errorBanner.textContent = '⚠ ' + msg;
  dom.errorBanner.classList.remove('hidden');
  dom.userBar.textContent = 'Không khả dụng';
}

// --- Render ---

function renderAll() {
  renderConvList();
  renderSendList();
}

function renderConvList() {
  if (conversations.length === 0) {
    dom.convList.innerHTML = '<div class="empty-hint">Chưa có conversation nào.</div>';
    return;
  }

  dom.convList.innerHTML = conversations
    .map(
      (c, i) => `
      <div class="item-row">
        <span class="item-info">
          <strong>${esc(c.name)}</strong>
          <code class="item-id">${esc(c.id)}</code>
        </span>
        <button class="btn btn-sm btn-danger" data-action="delete" data-index="${i}">✕</button>
      </div>`
    )
    .join('');

  // Bind delete buttons
  dom.convList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteConv(parseInt(btn.dataset.index)));
  });
}

function renderSendList() {
  if (conversations.length === 0) {
    dom.sendList.innerHTML =
      '<div class="empty-hint">Chưa thêm conversation nào. Vào tab Conversations để thêm.</div>';
    dom.btnSend.disabled = true;
    return;
  }

  dom.sendList.innerHTML = conversations
    .map(
      (c, i) => `
      <label class="item-row checkable">
        <input type="checkbox" class="send-check" value="${i}" checked>
        <span class="item-info">
          <strong>${esc(c.name)}</strong>
          <code class="item-id">${esc(c.id)}</code>
        </span>
      </label>`
    )
    .join('');

  dom.btnSend.disabled = false;
  updateSelectAllButton();
}

// --- Actions ---

function addConv() {
  const id = dom.convId.value.trim();
  const name = dom.convName.value.trim();

  if (!id) {
    alert('Vui lòng nhập Conversation ID.');
    return;
  }

  // Check duplicate
  if (conversations.some((c) => c.id === id)) {
    alert('Conversation ID này đã tồn tại.');
    return;
  }

  conversations.push({ id, name: name || id });
  conversations.sort((a, b) => a.name.localeCompare(b.name));
  saveConversations();
  renderAll();

  dom.convId.value = '';
  dom.convName.value = '';
  dom.convId.focus();
}

function deleteConv(index) {
  if (!confirm(`Xóa conversation "${conversations[index].name}"?`)) return;
  conversations.splice(index, 1);
  saveConversations();
  renderAll();
}

function getSelectedConvs() {
  const checks = $$('.send-check:checked');
  return Array.from(checks).map((cb) => conversations[parseInt(cb.value)]);
}

function updateSelectAllButton() {
  const checks = $$('.send-check');
  const checked = $$('.send-check:checked');
  dom.btnSelectAll.textContent =
    checked.length === checks.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
}

async function sendMessages() {
  const selected = getSelectedConvs();
  const content = dom.msgContent.value.trim();

  if (selected.length === 0) {
    alert('Vui lòng chọn ít nhất 1 conversation.');
    return;
  }
  if (!content) {
    alert('Vui lòng nhập nội dung tin nhắn.');
    return;
  }

  const names = selected.map((c) => c.name).join(', ');
  if (!confirm(`Gửi "${content}" đến ${selected.length} người nhận: ${names}?`)) return;

  dom.btnSend.disabled = true;
  dom.btnSend.textContent = '⏳ Đang gửi...';
  dom.sendResult.innerHTML = '<div class="status-info">Đang gửi...</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const payload = {
      messages: selected.map((c) => ({
        conversationId: c.id,
        conversationName: c.name,
        content,
      })),
      senderId,
      senderName,
    };

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'sendMessages',
      ...payload,
    });

    if (!response || !response.success) {
      dom.sendResult.innerHTML = `<div class="status-error">Lỗi: ${response?.error || 'Unknown'}</div>`;
      return;
    }

    const results = response.results;
    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;

    dom.sendResult.innerHTML = `
      <div class="status-summary">
        <span class="status-ok">✅ ${ok} thành công</span>
        ${fail > 0 ? `<span class="status-err">❌ ${fail} thất bại</span>` : ''}
      </div>
      <div class="status-detail">
        ${results
          .map(
            (r) => `
          <div class="result-row ${r.success ? 'ok' : 'err'}">
            <strong>${esc(r.conversationName)}</strong>
            <code>${esc(r.conversationId)}</code>
            ${r.success ? '✅' : `❌ ${r.error || r.status || ''}`}
          </div>`
          )
          .join('')}
      </div>`;

    if (fail === 0) {
      dom.msgContent.value = '';
    }
  } catch (e) {
    dom.sendResult.innerHTML = `<div class="status-error">Lỗi: ${esc(e.message)}</div>`;
  } finally {
    dom.btnSend.disabled = false;
    dom.btnSend.textContent = '▶ Gửi';
  }
}

// --- Events ---

// Tab switching
dom.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    dom.tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    dom.tabContents.forEach((c) => c.classList.remove('active'));
    $(`#tab-${name}`).classList.add('active');
  });
});

// Add conversation
dom.btnAdd.addEventListener('click', addConv);
dom.convId.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addConv();
});
dom.convName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addConv();
});

// Select all / deselect all
dom.btnSelectAll.addEventListener('click', () => {
  const checks = $$('.send-check');
  const allChecked = Array.from(checks).every((c) => c.checked);
  checks.forEach((c) => (c.checked = !allChecked));
  updateSelectAllButton();
});

// Track checkbox changes
dom.sendList.addEventListener('change', (e) => {
  if (e.target.classList.contains('send-check')) {
    updateSelectAllButton();
  }
});

// Send
dom.btnSend.addEventListener('click', sendMessages);

// --- Utility ---
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Boot ---
init();
