/**
 * Popup logic cho AMIS Chat Sender
 */

// --- State ---
let conversations = [];

// --- Danh sách người nhận mặc định (sửa ở đây) ---
const DEFAULT_CONVERSATIONS = [
  { id: '685b586d35628401eb5faa87', name: 'ndquang' },
  { id: '68342bd75d6309d2992eba6a', name: 'nxhung' },
  { id: '68536960cd604ecf8276b9a5', name: 'pvdat' },
];

// --- Storage ---
const STORAGE_KEY = 'amis_conversations';
const SENDER_KEY = 'amis_sender_info';

async function loadConversations() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  if (r[STORAGE_KEY] && r[STORAGE_KEY].length > 0) {
    conversations = r[STORAGE_KEY];
  } else {
    // Lần đầu dùng → load danh sách default
    conversations = [...DEFAULT_CONVERSATIONS];
  }
}
async function saveConversations() {
  await chrome.storage.local.set({ [STORAGE_KEY]: conversations });
}
async function loadSenderInfo() {
  const r = await chrome.storage.local.get(SENDER_KEY);
  if (r[SENDER_KEY]) {
    dom.senderId.value = r[SENDER_KEY].id || '';
    dom.senderName.value = r[SENDER_KEY].name || '';
  }
}
async function saveSenderInfo() {
  await chrome.storage.local.set({
    [SENDER_KEY]: { id: dom.senderId.value.trim(), name: dom.senderName.value.trim() },
  });
}

// --- DOM Refs ---
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  userBar: $('#user-bar'),
  senderId: $('#sender-id-input'),
  senderName: $('#sender-name-input'),
  convId: $('#conv-id'),
  convName: $('#conv-name'),
  btnAdd: $('#btn-add'),
  convList: $('#conv-list'),
  msgContent: $('#msg-content'),
  btnSelectAll: $('#btn-select-all'),
  btnCopySend: $('#btn-copy-send'),
  btnSend: $('#btn-send'),
  sendResult: $('#send-result'),
  errorBanner: $('#error-banner'),
};

// --- Communication ---
async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    if (
      e.message.includes('Receiving end does not exist') ||
      e.message.includes('Could not establish connection')
    ) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await sleep(100);
      return await chrome.tabs.sendMessage(tabId, message);
    }
    throw e;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Init ---
async function init() {
  // Load saved data trước
  await loadSenderInfo();
  await loadConversations();

  // Set defaults nếu chưa có
  if (!dom.senderId.value) {
    dom.senderId.value = '930fe185-0493-4c17-bf32-bf2595fa9cef';
    dom.senderName.value = 'Phan Ngọc Toản';
    await saveSenderInfo();
  }

  dom.userBar.textContent =
    `👤 ${dom.senderName.value || 'Unknown'} (${dom.senderId.value || 'no ID'})`;

  // Thử lấy context từ trang AMIS (không bắt buộc)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith('https://misajsc.amis.vn')) {
      const resp = await sendToContent(tab.id, { action: 'getContextData' });
      if (resp && resp.success) {
        dom.userBar.textContent += ' ✅ Connected';
      }
    }
  } catch (_) {
    // Không sao — dùng sender đã lưu
  }

  renderConvList();
  updateButtons();
}

function showError(msg) {
  dom.errorBanner.textContent = '⚠ ' + msg;
  dom.errorBanner.classList.remove('hidden');
}

// --- Render ---
function renderConvList() {
  if (conversations.length === 0) {
    dom.convList.innerHTML = '<div class="empty-hint">Chưa có conversation nào.</div>';
    return;
  }

  dom.convList.innerHTML = conversations
    .map(
      (c, i) => `
      <label class="item-row checkable">
        <input type="checkbox" class="conv-check" value="${i}" checked>
        <span class="item-info">
          <strong>${esc(c.name)}</strong>
          <code class="item-id">${esc(c.id)}</code>
        </span>
        <button class="btn btn-sm btn-danger" data-action="delete" data-index="${i}">✕</button>
      </label>`
    )
    .join('');

  // Bind delete
  dom.convList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); // Ngăn checkbox toggle
      deleteConv(parseInt(btn.dataset.index));
    });
  });

  updateSelectAllLabel();
}

function getSelectedConvs() {
  return Array.from($$('.conv-check:checked')).map((cb) => conversations[parseInt(cb.value)]);
}

function updateSelectAllLabel() {
  const checks = $$('.conv-check');
  const checked = $$('.conv-check:checked');
  dom.btnSelectAll.textContent =
    checks.length > 0 && checked.length === checks.length
      ? 'Bỏ chọn tất cả'
      : 'Chọn tất cả';
}

function updateButtons() {
  const hasConvs = conversations.length > 0;
  dom.btnSelectAll.disabled = !hasConvs;
  dom.btnSend.disabled = !hasConvs;
  dom.btnCopySend.disabled = !hasConvs;
}

// --- Actions ---
function addConv() {
  const id = dom.convId.value.trim();
  const name = dom.convName.value.trim();
  if (!id) return alert('Vui lòng nhập Conversation ID.');
  if (conversations.some((c) => c.id === id)) return alert('ID đã tồn tại.');

  conversations.push({ id, name: name || id });
  conversations.sort((a, b) => a.name.localeCompare(b.name));
  saveConversations();
  renderConvList();
  updateButtons();
  dom.convId.value = '';
  dom.convName.value = '';
  dom.convId.focus();
}

function deleteConv(index) {
  if (!confirm(`Xóa "${conversations[index].name}"?`)) return;
  conversations.splice(index, 1);
  saveConversations();
  renderConvList();
  updateButtons();
}

async function doSend(content) {
  const selected = getSelectedConvs();
  const senderId = dom.senderId.value.trim();
  const senderName = dom.senderName.value.trim();

  if (!senderId || !senderName) return alert('Vui lòng điền Sender ID và Name.');
  if (selected.length === 0) return alert('Vui lòng chọn ít nhất 1 conversation.');
  if (!content) return alert('Không có nội dung để gửi.');

  const names = selected.map((c) => c.name).join(', ');
  if (!confirm(`Gửi đến ${selected.length} người: ${names}?\n\nNội dung: ${content.substring(0, 200)}`))
    return;

  await saveSenderInfo();

  dom.btnSend.disabled = true;
  dom.btnCopySend.disabled = true;
  dom.sendResult.innerHTML = '<div class="status-info">⏳ Đang gửi...</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await sendToContent(tab.id, {
      action: 'sendMessages',
      messages: selected.map((c) => ({
        conversationId: c.id,
        conversationName: c.name,
        content,
      })),
      senderId,
      senderName,
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
      ${results
        .map(
          (r) => `
        <div class="result-row ${r.success ? 'ok' : 'err'}">
          <strong>${esc(r.conversationName)}</strong>
          <code>${esc(r.conversationId)}</code>
          ${r.success ? '✅' : `❌ ${r.status || ''} ${typeof r.data === 'object' ? JSON.stringify(r.data) : r.data || r.error || ''}`}
        </div>`
        )
        .join('')}`;
  } catch (e) {
    dom.sendResult.innerHTML = `<div class="status-error">Lỗi: ${esc(e.message)}</div>`;
  } finally {
    dom.btnSend.disabled = false;
    dom.btnCopySend.disabled = false;
    updateButtons();
  }
}

// --- Copy & Gửi Context ---
async function copyAndSendContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await sendToContent(tab.id, { action: 'getContextData' });

    if (!response || !response.success || !response.data) {
      alert('Không đọc được contextData. Hãy mở trang AMIS và đăng nhập.');
      return;
    }

    const ctxJson = JSON.stringify(response.data, null, 2);

    // Gửi context làm nội dung tin nhắn
    await doSend(ctxJson);
  } catch (e) {
    alert('Lỗi: ' + e.message + ' — Hãy mở trang AMIS rồi thử lại.');
  }
}

// --- Send custom message ---
async function sendMessage() {
  const content = dom.msgContent.value.trim();
  if (!content) return alert('Vui lòng nhập nội dung tin nhắn.');
  await doSend(content);
}

// --- Events ---
dom.btnAdd.addEventListener('click', addConv);
dom.convId.addEventListener('keydown', (e) => e.key === 'Enter' && addConv());
dom.convName.addEventListener('keydown', (e) => e.key === 'Enter' && addConv());

dom.btnSelectAll.addEventListener('click', () => {
  const checks = $$('.conv-check');
  const allChecked = Array.from(checks).every((c) => c.checked);
  checks.forEach((c) => (c.checked = !allChecked));
  updateSelectAllLabel();
});

dom.convList.addEventListener('change', (e) => {
  if (e.target.classList.contains('conv-check')) updateSelectAllLabel();
});

dom.btnCopySend.addEventListener('click', copyAndSendContext);
dom.btnSend.addEventListener('click', sendMessage);

dom.senderId.addEventListener('change', () => {
  saveSenderInfo();
  dom.userBar.textContent = `👤 ${dom.senderName.value || 'Unknown'} (${dom.senderId.value || 'no ID'})`;
});
dom.senderName.addEventListener('change', () => {
  saveSenderInfo();
  dom.userBar.textContent = `👤 ${dom.senderName.value || 'Unknown'} (${dom.senderId.value || 'no ID'})`;
});

// --- Utility ---
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Boot ---
init();
