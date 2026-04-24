/**
 * Rotorua NZ Chatbot Widget
 * Embed with: <script src="/chatbot-widget.js"></script>
 * Optional attribute on <script>: data-api-url="https://your-server.com"
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const scriptTag = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const API_URL = (scriptTag.getAttribute('data-api-url') || '').replace(/\/$/, '');
  const CSS_URL = API_URL + '/chatbot-widget.css';

  const SUGGESTIONS = [
    'What areas are covered?',
    'Hotel occupancy rate?',
    'Motel capacity utilisation?',
    'Latest month data?',
    'Number of establishments?'
  ];

  const WELCOME = 'Kia ora! I can answer questions about accommodation data for the Rotorua region. What would you like to know?';

  // ── Load CSS ─────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('rnz-chat-css')) return;
    const link = document.createElement('link');
    link.id = 'rnz-chat-css';
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────────
  function buildWidget() {
    // Launcher button
    const launcher = document.createElement('button');
    launcher.id = 'rnz-chat-launcher';
    launcher.setAttribute('aria-label', 'Open Rotorua NZ chatbot');
    launcher.innerHTML = `
      <svg class="rnz-icon-chat" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
      <svg class="rnz-icon-close" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;

    // Chat window
    const win = document.createElement('div');
    win.id = 'rnz-chat-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Rotorua NZ chatbot');
    win.innerHTML = `
      <div id="rnz-chat-header">
        <div class="rnz-avatar">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <div class="rnz-title">
          <h3>Rotorua NZ</h3>
          <p>Accommodation Data Assistant</p>
        </div>
        <div class="rnz-status-dot" title="Online"></div>
      </div>
      <div id="rnz-messages" role="log" aria-live="polite"></div>
      <div id="rnz-suggestions"></div>
      <div id="rnz-input-area">
        <textarea
          id="rnz-input"
          placeholder="Ask about accommodation data..."
          rows="1"
          aria-label="Type your message"
          autocomplete="off"
        ></textarea>
        <button id="rnz-send-btn" aria-label="Send message" disabled>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
      <div id="rnz-footer">Powered by Rotorua NZ &bull; Data: accommodation statistics</div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(win);

    return { launcher, win };
  }

  // ── Widget controller ─────────────────────────────────────────────────────────
  function initWidget() {
    injectCSS();
    const { launcher, win } = buildWidget();

    const messagesEl = win.querySelector('#rnz-messages');
    const input = win.querySelector('#rnz-input');
    const sendBtn = win.querySelector('#rnz-send-btn');
    const suggestionsEl = win.querySelector('#rnz-suggestions');

    let isOpen = false;
    let isLoading = false;
    let typingEl = null;

    // ── Toggle open/close ──────────────────────────────────────────────────────
    function openChat() {
      isOpen = true;
      win.classList.add('rnz-visible');
      launcher.classList.add('rnz-open');
      launcher.setAttribute('aria-label', 'Close chatbot');
      // Remove unread badge if present
      const badge = launcher.querySelector('.rnz-badge');
      if (badge) badge.remove();
      input.focus();
    }

    function closeChat() {
      isOpen = false;
      win.classList.remove('rnz-visible');
      launcher.classList.remove('rnz-open');
      launcher.setAttribute('aria-label', 'Open Rotorua NZ chatbot');
    }

    launcher.addEventListener('click', () => isOpen ? closeChat() : openChat());

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) closeChat();
    });

    // ── Message rendering ──────────────────────────────────────────────────────
    function timeStr() {
      return new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
    }

    function appendMessage(text, role) {
      const wrapper = document.createElement('div');
      wrapper.className = `rnz-msg rnz-${role}`;

      const bubble = document.createElement('div');
      bubble.className = 'rnz-bubble';
      bubble.textContent = text;

      const time = document.createElement('div');
      time.className = 'rnz-msg-time';
      time.textContent = timeStr();

      wrapper.appendChild(bubble);
      wrapper.appendChild(time);
      messagesEl.appendChild(wrapper);
      scrollToBottom();
      return wrapper;
    }

    function showTyping() {
      const wrapper = document.createElement('div');
      wrapper.className = 'rnz-msg rnz-bot';
      wrapper.id = 'rnz-typing';
      wrapper.innerHTML = `
        <div class="rnz-bubble rnz-typing-bubble">
          <span></span><span></span><span></span>
        </div>`;
      messagesEl.appendChild(wrapper);
      typingEl = wrapper;
      scrollToBottom();
    }

    function hideTyping() {
      if (typingEl) {
        typingEl.remove();
        typingEl = null;
      }
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ── Suggestions ─────────────────────────────────────────────────────────────
    function renderSuggestions(items) {
      suggestionsEl.innerHTML = '';
      items.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'rnz-suggestion';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          suggestionsEl.innerHTML = '';
          sendMessage(text);
        });
        suggestionsEl.appendChild(btn);
      });
    }

    // ── Send message ─────────────────────────────────────────────────────────────
    async function sendMessage(text) {
      const msg = (text || input.value).trim();
      if (!msg || isLoading) return;

      input.value = '';
      autoResize();
      suggestionsEl.innerHTML = '';
      appendMessage(msg, 'user');
      setLoading(true);
      showTyping();

      try {
        const res = await fetch(API_URL + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });

        const data = await res.json();
        hideTyping();

        if (!res.ok) {
          appendMessage(data.error || 'Something went wrong. Please try again.', 'bot');
        } else {
          appendMessage(data.response, 'bot');
        }
      } catch {
        hideTyping();
        appendMessage('Could not connect to the server. Please check your connection.', 'bot');
      }

      setLoading(false);
    }

    function setLoading(state) {
      isLoading = state;
      sendBtn.disabled = state || input.value.trim().length === 0;
    }

    // ── Input handling ───────────────────────────────────────────────────────────
    function autoResize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    }

    input.addEventListener('input', () => {
      autoResize();
      sendBtn.disabled = isLoading || input.value.trim().length === 0;
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => sendMessage());

    // ── Welcome message on first open ─────────────────────────────────────────
    let welcomed = false;
    launcher.addEventListener('click', () => {
      if (isOpen && !welcomed) {
        welcomed = true;
        setTimeout(() => {
          appendMessage(WELCOME, 'bot');
          renderSuggestions(SUGGESTIONS);
        }, 120);
      }
    });
  }

  // ── Init on DOM ready ────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
