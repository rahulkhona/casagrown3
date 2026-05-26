/**
 * CasaGrown Chat Widget — Embeddable JavaScript widget
 *
 * Usage: <script src="https://casagrown.com/widget.js" data-booth-id="uuid"></script>
 *
 * Self-contained, uses Shadow DOM for style isolation.
 * No dependencies — works on any website.
 */
(function() {
  'use strict';

  // Get config from script tag
  var script = document.currentScript;
  var boothId = script && script.getAttribute('data-booth-id');
  if (!boothId) { console.error('CasaGrown Widget: Missing data-booth-id'); return; }

  // Derive API URL from script source
  var scriptSrc = (script && script.src) || '';
  var origin = scriptSrc.replace(/\/widget\.js.*/, '');
  // Default to production Supabase URL; override in dev via data attribute
  var SUPABASE_URL = (script && script.getAttribute('data-api-url'))
    || (origin.indexOf('localhost') !== -1 ? 'http://localhost:54321' : 'https://mbjnbtajfaqlisdtntdl.supabase.co');
  var WIDGET_API = SUPABASE_URL + '/functions/v1/widget-chat';

  var sessionToken = null;
  try { sessionToken = localStorage.getItem('cg_widget_' + boothId); } catch(e) {}
  var isOpen = false;
  var messages = [];
  var boothName = '';
  var sending = false;

  // Create shadow DOM container
  var container = document.createElement('div');
  container.id = 'casagrown-widget';
  var shadow = container.attachShadow({ mode: 'closed' });
  document.body.appendChild(container);

  // Styles (fully isolated in shadow DOM)
  var style = document.createElement('style');
  style.textContent = [
    '* { box-sizing: border-box; margin: 0; padding: 0; }',

    '.cg-bubble {',
    '  position: fixed; bottom: 20px; right: 20px;',
    '  width: 60px; height: 60px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #065f46, #059669);',
    '  color: white; border: none; cursor: pointer;',
    '  box-shadow: 0 4px 20px rgba(5, 150, 105, 0.4);',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 28px; z-index: 999999;',
    '  transition: transform 0.2s, box-shadow 0.2s;',
    '}',
    '.cg-bubble:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(5, 150, 105, 0.5); }',

    '.cg-panel {',
    '  position: fixed; bottom: 90px; right: 20px;',
    '  width: 380px; max-width: calc(100vw - 40px);',
    '  height: 520px; max-height: calc(100vh - 120px);',
    '  background: white; border-radius: 16px;',
    '  box-shadow: 0 8px 40px rgba(0,0,0,0.15);',
    '  display: flex; flex-direction: column;',
    '  z-index: 999998; overflow: hidden;',
    '  animation: cg-slide-up 0.3s ease;',
    '}',

    '@keyframes cg-slide-up {',
    '  from { opacity: 0; transform: translateY(20px); }',
    '  to { opacity: 1; transform: translateY(0); }',
    '}',

    '.cg-header {',
    '  background: linear-gradient(135deg, #065f46, #059669);',
    '  color: white; padding: 16px 20px;',
    '  display: flex; justify-content: space-between; align-items: center;',
    '  flex-shrink: 0;',
    '}',
    '.cg-header-text h3 { font-size: 15px; font-weight: 700; font-family: -apple-system, system-ui, sans-serif; }',
    '.cg-header-text p { font-size: 11px; opacity: 0.8; margin-top: 2px; font-family: -apple-system, system-ui, sans-serif; }',
    '.cg-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; }',

    '.cg-messages {',
    '  flex: 1; overflow-y: auto; padding: 16px;',
    '  display: flex; flex-direction: column; gap: 12px;',
    '  font-family: -apple-system, system-ui, sans-serif;',
    '}',

    '.cg-msg {',
    '  max-width: 85%; padding: 10px 14px;',
    '  border-radius: 12px; font-size: 14px; line-height: 1.5;',
    '  word-wrap: break-word;',
    '}',
    '.cg-msg-bot {',
    '  background: #f3f4f6; color: #1f2937;',
    '  align-self: flex-start; border-bottom-left-radius: 4px;',
    '}',
    '.cg-msg-user {',
    '  background: linear-gradient(135deg, #065f46, #059669); color: white;',
    '  align-self: flex-end; border-bottom-right-radius: 4px;',
    '}',
    '.cg-msg-typing {',
    '  background: #f3f4f6; color: #9ca3af;',
    '  align-self: flex-start; font-style: italic;',
    '}',

    '.cg-input-area {',
    '  padding: 12px 16px; border-top: 1px solid #e5e7eb;',
    '  display: flex; gap: 8px; flex-shrink: 0;',
    '}',
    '.cg-input {',
    '  flex: 1; padding: 10px 14px; border: 1px solid #d1d5db;',
    '  border-radius: 24px; font-size: 14px; outline: none;',
    '  font-family: -apple-system, system-ui, sans-serif;',
    '}',
    '.cg-input:focus { border-color: #059669; }',
    '.cg-send {',
    '  width: 40px; height: 40px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #065f46, #059669);',
    '  color: white; border: none; cursor: pointer;',
    '  font-size: 16px; display: flex; align-items: center; justify-content: center;',
    '  flex-shrink: 0;',
    '}',
    '.cg-send:disabled { opacity: 0.5; cursor: default; }',

    '.cg-powered {',
    '  text-align: center; padding: 8px; flex-shrink: 0;',
    '  font-size: 10px; color: #9ca3af;',
    '  font-family: -apple-system, system-ui, sans-serif;',
    '}',
    '.cg-powered a { color: #059669; text-decoration: none; }',
  ].join('\n');
  shadow.appendChild(style);

  function render() {
    // Clear existing UI elements
    var existingBubble = shadow.querySelector('.cg-bubble');
    var existingPanel = shadow.querySelector('.cg-panel');
    if (existingBubble) existingBubble.remove();
    if (existingPanel) existingPanel.remove();

    // ── Bubble ──
    var bubble = document.createElement('button');
    bubble.className = 'cg-bubble';
    bubble.innerHTML = isOpen ? '&#x2715;' : '&#x1F4AC;';
    bubble.onclick = function() { isOpen = !isOpen; render(); };
    shadow.appendChild(bubble);

    if (!isOpen) return;

    // ── Panel ──
    var panel = document.createElement('div');
    panel.className = 'cg-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'cg-header';

    var headerText = document.createElement('div');
    headerText.className = 'cg-header-text';
    var h3 = document.createElement('h3');
    h3.textContent = '\uD83C\uDF31 ' + (boothName || 'Farm Stand');
    var p = document.createElement('p');
    p.textContent = 'Powered by CasaGrown';
    headerText.appendChild(h3);
    headerText.appendChild(p);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cg-close';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.onclick = function() { isOpen = false; render(); };

    header.appendChild(headerText);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Messages
    var msgContainer = document.createElement('div');
    msgContainer.className = 'cg-messages';

    if (messages.length === 0) {
      var welcome = document.createElement('div');
      welcome.className = 'cg-msg cg-msg-bot';
      welcome.textContent = 'Hi there! \uD83D\uDC4B Welcome to ' + (boothName || 'our farm stand') + '. Ask me about our products, pricing, or how to order!';
      msgContainer.appendChild(welcome);
    }

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var el = document.createElement('div');
      el.className = 'cg-msg cg-msg-' + msg.role;
      el.textContent = msg.text;
      msgContainer.appendChild(el);
    }

    panel.appendChild(msgContainer);

    // Input
    var inputArea = document.createElement('div');
    inputArea.className = 'cg-input-area';

    var input = document.createElement('input');
    input.className = 'cg-input';
    input.placeholder = 'Ask about products...';

    var sendBtn = document.createElement('button');
    sendBtn.className = 'cg-send';
    sendBtn.innerHTML = '&#x2191;';
    sendBtn.disabled = sending;

    function doSend() {
      var text = input.value.trim();
      if (!text || sending) return;
      sending = true;

      messages.push({ role: 'user', text: text });
      input.value = '';
      render();

      // Show typing indicator
      messages.push({ role: 'typing', text: 'Thinking...' });
      render();

      // Scroll to bottom
      setTimeout(function() {
        var mc = shadow.querySelector('.cg-messages');
        if (mc) mc.scrollTop = mc.scrollHeight;
      }, 50);

      // Call API
      fetch(WIDGET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booth_id: boothId, session_token: sessionToken, message: text })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        // Remove typing indicator
        messages = messages.filter(function(m) { return m.role !== 'typing'; });

        if (data.response) {
          messages.push({ role: 'bot', text: data.response });
          if (data.session_token) {
            sessionToken = data.session_token;
            try { localStorage.setItem('cg_widget_' + boothId, sessionToken); } catch(e) {}
          }
          if (data.booth_name) boothName = data.booth_name;
        } else {
          messages.push({ role: 'bot', text: data.error || 'Sorry, I had trouble responding. Please try again.' });
        }
        sending = false;
        render();
        setTimeout(function() {
          var mc = shadow.querySelector('.cg-messages');
          if (mc) mc.scrollTop = mc.scrollHeight;
        }, 50);
      })
      .catch(function() {
        messages = messages.filter(function(m) { return m.role !== 'typing'; });
        messages.push({ role: 'bot', text: "Sorry, I'm having connection issues. Please try again." });
        sending = false;
        render();
      });
    }

    sendBtn.onclick = doSend;
    input.onkeydown = function(e) { if (e.key === 'Enter') doSend(); };

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    // Powered by
    var powered = document.createElement('div');
    powered.className = 'cg-powered';
    powered.innerHTML = 'Powered by <a href="https://casagrown.com" target="_blank" rel="noopener">CasaGrown</a>';
    panel.appendChild(powered);

    shadow.appendChild(panel);

    // Auto-scroll and focus
    setTimeout(function() {
      msgContainer.scrollTop = msgContainer.scrollHeight;
      input.focus();
    }, 100);
  }

  render();
})();
