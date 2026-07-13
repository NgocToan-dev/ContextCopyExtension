/**
 * Content script cho AMIS Chat Sender
 * Chạy trên misajsc.amis.vn — đọc localStorage và gọi API gửi tin nhắn
 */

// --- Helpers ---

function generateMessageId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// --- API call ---

async function sendMessages(messages, senderId, senderName) {
  const results = [];

  for (const msg of messages) {
    const messageId = generateMessageId();

    try {
      const response = await fetch(
        'https://misajsc.amis.vn/chat/api/business/v1/messages/send/text',
        {
          method: 'POST',
          headers: {
            'DeviceName': 'Web',
            'Pragma': 'no-cache',
            'Response-Type': 'json',
            'X-Client-App-Code': 'chat',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            conversationId: msg.conversationId,
            conversationType: 3,
            isFirstMessage: false,
            isCrossTenant: false,
            messageId: messageId,
            senderId: senderId,
            senderName: senderName,
            isHandoffMessage: false,
            content: msg.content,
            originalContent: '',
          }),
        }
      );

      let data;
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }

      results.push({
        conversationId: msg.conversationId,
        conversationName: msg.conversationName,
        success: response.ok,
        status: response.status,
        data,
      });
    } catch (e) {
      results.push({
        conversationId: msg.conversationId,
        conversationName: msg.conversationName,
        success: false,
        error: e.message,
      });
    }
  }

  return results;
}

// --- Message listener ---

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Lấy contextData từ localStorage
  if (request.action === 'getContextData') {
    try {
      const raw = localStorage.getItem('contextData');
      const contextData = raw ? JSON.parse(raw) : null;
      sendResponse({ success: true, data: contextData });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  // Gửi tin nhắn
  if (request.action === 'sendMessages') {
    const { messages, senderId, senderName } = request;
    sendMessages(messages, senderId, senderName)
      .then((results) => sendResponse({ success: true, results }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true; // giữ kênh async mở
  }
});
