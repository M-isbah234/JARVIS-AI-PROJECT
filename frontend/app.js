// J.A.R.V.I.S. Client Controller & WebSocket Telemetry Synchronizer
// 100% Real Hardware Data & Dynamic Device Pairing

let ws = null;
let isPowerOn = false;
let isDeviceConnected = false;
let isVoiceListening = false;

// DOM Elements
const btnPowerToggle = document.getElementById('btnPowerToggle');
const powerStateText = document.getElementById('powerStateText');
const hardwareType = document.getElementById('hardwareType');
const plugNetDot = document.getElementById('plugNetDot');
const plugModel = document.getElementById('plugModel');
const plugIp = document.getElementById('plugIp');

const valWatts = document.getElementById('valWatts');
const fillWatts = document.getElementById('fillWatts');
const valKwh = document.getElementById('valKwh');
const valVolts = document.getElementById('valVolts');
const valAmps = document.getElementById('valAmps');

const sliderBrightness = document.getElementById('sliderBrightness');
const brightVal = document.getElementById('brightVal');
const btnScanNet = document.getElementById('btnScanNet');
const devicesList = document.getElementById('devicesList');

const inputTargetIp = document.getElementById('inputTargetIp');
const inputTapoUser = document.getElementById('inputTapoUser');
const inputTapoPass = document.getElementById('inputTapoPass');
const btnManualPair = document.getElementById('btnManualPair');
const pairStatusMessage = document.getElementById('pairStatusMessage');

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const btnVoiceToggle = document.getElementById('btnVoiceToggle');
const voiceBtnText = document.getElementById('voiceBtnText');

// 1. WebSocket Telemetry & Chat Loop with Serverless/Vercel Fallback
let wsRetryCount = 0;
const MAX_WS_RETRIES = 4;

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[J.A.R.V.I.S. WS] Connected to Core Telemetry.');
      wsRetryCount = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'telemetry') {
          updateHardwareUI(msg.data);
        } else if (msg.type === 'chat_message') {
          appendChatMessage('assistant', msg.reply);
          speakResponse(msg.reply);
        }
      } catch (e) {
        console.error('[WS Parse Error]:', e);
      }
    };

    ws.onclose = () => {
      plugNetDot.classList.remove('on');
      wsRetryCount++;
      if (wsRetryCount <= MAX_WS_RETRIES) {
        console.warn(`[J.A.R.V.I.S. WS] Connection inactive. Retry ${wsRetryCount}/${MAX_WS_RETRIES}...`);
        setTimeout(initWebSocket, 3000);
      } else {
        console.log('[J.A.R.V.I.S.] Operating in Serverless HTTP Telemetry Sync mode.');
      }
    };

    ws.onerror = () => {
      // Gracefully handled by onclose and HTTP fallback
    };
  } catch (err) {
    console.warn('[J.A.R.V.I.S.] WebSocket unavailable, defaulting to HTTP Sync.');
  }
}

// Fallback HTTP polling for serverless clouds (Vercel) and sleeping websockets
async function pollTelemetryFallback() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    const res = await fetch('/api/plug/status');
    const data = await res.json();
    if (data && data.data) {
      updateHardwareUI(data.data);
    }
  } catch (e) {
    // Hardware offline or server sleep
  }
}

// 2. Hardware UI Synchronization (Real Data Only)
function updateHardwareUI(data) {
  if (!data) return;
  isDeviceConnected = Boolean(data.connected);
  isPowerOn = isDeviceConnected && Boolean(data.is_on);

  // Power orb
  btnPowerToggle.classList.toggle('active', isPowerOn);
  btnPowerToggle.classList.toggle('offline', !isDeviceConnected);
  powerStateText.textContent = isDeviceConnected ? (isPowerOn ? 'ON' : 'OFF') : 'OFFLINE';
  powerStateText.classList.toggle('on', isPowerOn);
  
  if (data.model) plugModel.textContent = isDeviceConnected ? data.model : 'Disconnected';
  if (data.ip) plugIp.textContent = isDeviceConnected ? data.ip : 'None';
  
  hardwareType.textContent = isDeviceConnected ? 'REAL HARDWARE (CONNECTED)' : 'HARDWARE OFFLINE (NO MOCK)';
  hardwareType.style.color = isDeviceConnected ? '#00e5ff' : '#ff4444';
  plugNetDot.classList.toggle('on', isDeviceConnected);

  // Energy Telemetry - Real values only (0.0 if not connected)
  if (data.energy) {
    const w = isDeviceConnected ? (data.energy.current_watts || 0) : 0.0;
    valWatts.innerHTML = `${w.toFixed(1)} <span class="unit">W</span>`;
    
    const pct = isDeviceConnected ? Math.min(100, Math.max(0, (w / 2000) * 100)) : 0;
    fillWatts.style.width = `${pct}%`;

    const kwh = isDeviceConnected ? (data.energy.today_kwh || 0) : 0.0;
    const v = isDeviceConnected ? (data.energy.voltage_v || 0) : 0.0;
    const a = isDeviceConnected ? (data.energy.current_a || 0) : 0.0;

    valKwh.innerHTML = `${kwh.toFixed(3)} <span class="unit">kWh</span>`;
    valVolts.innerHTML = `${v.toFixed(1)} <span class="unit">V</span>`;
    valAmps.innerHTML = `${a.toFixed(2)} <span class="unit">A</span>`;
  }

  // Brightness
  if (data.brightness !== undefined && isDeviceConnected) {
    sliderBrightness.value = data.brightness;
    brightVal.textContent = `${data.brightness}%`;
  } else if (!isDeviceConnected) {
    sliderBrightness.value = 0;
    brightVal.textContent = `0%`;
  }
}

// 3. Dynamic Pairing Controls
async function pairDevice(ip, username, password) {
  const cleanIp = (ip || '').trim();
  if (!cleanIp) {
    showPairStatus('Please enter a target device IP address.', false);
    return;
  }

  showPairStatus(`Contacting hardware at ${cleanIp}...`, null);
  btnManualPair.disabled = true;
  btnManualPair.textContent = 'CONNECTING...';

  try {
    const res = await fetch('/api/plug/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: cleanIp,
        username: username ? username.trim() : undefined,
        password: password ? password.trim() : undefined
      })
    });
    const result = await res.json();
    if (result.ok && result.data) {
      showPairStatus(`✔ PAIRED: Connected to ${result.data.model || 'Smart Plug'} (${cleanIp})`, true);
      updateHardwareUI(result.data);
      appendChatMessage('assistant', `Wireless link established, Sir. Paired with ${result.data.model} at ${cleanIp}. Real-time telemetry is now active.`);
    } else {
      showPairStatus(`✖ FAILED: ${result.error || 'Connection timed out'}`, false);
      appendChatMessage('assistant', `Pairing failed for ${cleanIp}. Verify the plug is powered on and that 'Third-Party Compatibility' is enabled in your Tapo App.`);
    }
  } catch (err) {
    showPairStatus(`✖ NETWORK ERROR: ${err.message}`, false);
  } finally {
    btnManualPair.disabled = false;
    btnManualPair.textContent = '⚡ PAIR & CONNECT';
  }
}

function showPairStatus(msg, isSuccess) {
  if (!pairStatusMessage) return;
  pairStatusMessage.textContent = msg;
  pairStatusMessage.className = 'pair-status-msg ' + (isSuccess === true ? 'success' : isSuccess === false ? 'error' : '');
}

btnManualPair.addEventListener('click', () => {
  pairDevice(inputTargetIp.value, inputTapoUser.value, inputTapoPass.value);
});

inputTargetIp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pairDevice(inputTargetIp.value, inputTapoUser.value, inputTapoPass.value);
});

// 4. Hardware Power & Lighting Controls
btnPowerToggle.addEventListener('click', async () => {
  btnPowerToggle.style.transform = 'scale(0.92)';
  setTimeout(() => btnPowerToggle.style.transform = '', 150);

  if (!isDeviceConnected) {
    showPairStatus('Cannot toggle: No hardware connected. Enter your plug IP above and click PAIR.', false);
    appendChatMessage('assistant', 'Unable to toggle power, Sir. No physical smart plug is currently paired. Please enter your plug\'s IP address above and click Pair.');
    return;
  }

  try {
    const res = await fetch('/api/plug/toggle', { method: 'POST' });
    const data = await res.json();
    if (data.ok && data.data) {
      isPowerOn = data.data.state === 'on';
      btnPowerToggle.classList.toggle('active', isPowerOn);
      powerStateText.textContent = isPowerOn ? 'ON' : 'OFF';
      powerStateText.classList.toggle('on', isPowerOn);
    } else {
      showPairStatus(`Toggle failed: ${data.error || 'Hardware unreachable'}`, false);
    }
  } catch (err) {
    console.error('Error toggling power:', err);
  }
});

sliderBrightness.addEventListener('input', (e) => {
  brightVal.textContent = `${e.target.value}%`;
});

sliderBrightness.addEventListener('change', async (e) => {
  if (!isDeviceConnected) return;
  try {
    await fetch('/api/plug/brightness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness: parseInt(e.target.value, 10) })
    });
  } catch (err) {
    console.error('Error setting brightness:', err);
  }
});

// Color Presets
document.querySelectorAll('.color-dot').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!isDeviceConnected) return;
    const [r, g, b] = btn.getAttribute('data-rgb').split(',').map(Number);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = max === 0 ? 0 : (max - min) / max * 100, v = max / 255 * 100;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    try {
      await fetch('/api/plug/color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hue: Math.round(h), saturation: Math.round(s), value: Math.round(v) })
      });
      appendChatMessage('assistant', `Smart bulb ambience shifted to selected color palette, Sir.`);
    } catch (e) {
      console.error(e);
    }
  });
});

// 5. Wi-Fi Subnet Discovery with 1-Click Pairing
btnScanNet.addEventListener('click', async () => {
  btnScanNet.textContent = 'SCANNING...';
  devicesList.innerHTML = '<div class="device-empty">Broadcasting discovery packet across local subnet...</div>';

  try {
    const res = await fetch('/api/plug/discover');
    const data = await res.json();
    devicesList.innerHTML = '';

    if (data.ok && data.devices && data.devices.length > 0) {
      data.devices.forEach(d => {
        const item = document.createElement('div');
        item.className = 'device-item';
        item.innerHTML = `
          <span class="dev-dot ${d.is_on ? 'on' : ''}"></span>
          <span class="dev-name">${d.alias || d.model} (${d.ip})</span>
          <button class="btn-pair-tag" data-ip="${d.ip}">⚡ PAIR DEVICE</button>
        `;
        item.querySelector('.btn-pair-tag').addEventListener('click', (e) => {
          e.stopPropagation();
          inputTargetIp.value = d.ip;
          pairDevice(d.ip, inputTapoUser.value, inputTapoPass.value);
        });
        devicesList.appendChild(item);
      });
    } else {
      devicesList.innerHTML = '<div class="device-empty" style="color: #ff6b6b; border-color: rgba(255, 85, 85, 0.4);">NO TP-LINK HARDWARE DETECTED ON LOCAL SUBNET. Ensure device is plugged into power and connected to 2.4GHz Wi-Fi.</div>';
    }
  } catch (e) {
    console.error('Discovery error:', e);
    devicesList.innerHTML = `<div class="device-empty" style="color: #ff5555;">Scan error: ${e.message}</div>`;
  } finally {
    btnScanNet.textContent = '⟳ SCAN WI-FI';
  }
});

// 6. Chat System
let lastRenderedAssistant = '';
let lastRenderedTime = 0;

function appendChatMessage(role, text) {
  if (!text) return;
  const now = Date.now();
  if (role === 'assistant') {
    if (text === lastRenderedAssistant && (now - lastRenderedTime < 3500)) {
      return; // Ignore duplicate assistant response within 3.5 seconds
    }
    lastRenderedAssistant = text;
    lastRenderedTime = now;
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${role}`;
  msgDiv.innerHTML = `
    <div class="msg-author">${role === 'user' ? 'OPERATOR' : 'J.A.R.V.I.S.'}</div>
    <div class="msg-content">${text}</div>
  `;
  chatLog.appendChild(msgDiv);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Speech Synthesis (Audio Output)
let lastSpokenText = '';
let lastSpokenTime = 0;

function speakResponse(text) {
  if (!isVoiceListening || !window.speechSynthesis) return;
  const now = Date.now();
  if (text === lastSpokenText && (now - lastSpokenTime < 3500)) {
    return; // Don't speak identical text twice within 3.5 seconds
  }
  lastSpokenText = text;
  lastSpokenTime = now;
  try {
    window.speechSynthesis.cancel();
    let cleanText = text.replace(/[*#◈_`]/g, '').trim();
    // Pronounce as "Jarvis" in audio while retaining "J.A.R.V.I.S." in written chat
    cleanText = cleanText.replace(/J\.A\.R\.V\.I\.S\.?/gi, 'Jarvis');
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => 
      (v.lang && (v.lang.includes('en-GB') || v.lang.includes('en-US'))) && 
      (v.name.includes('David') || v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Natural'))
    );
    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.debug('TTS note:', e);
  }
}

// Ensure voices are loaded in Chromium browsers
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// Browser Web Speech Recognition (Microphone Input)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let browserRecognizer = null;

if (SpeechRecognition) {
  browserRecognizer = new SpeechRecognition();
  browserRecognizer.continuous = true;
  browserRecognizer.interimResults = false;
  browserRecognizer.lang = 'en-US';

  browserRecognizer.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal) {
      const transcript = lastResult[0].transcript.trim();
      if (transcript) {
        console.log('[Web Speech Captured]:', transcript);
        sendUserMessage(transcript);
      }
    }
  };

  browserRecognizer.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.warn('[Web Speech Error]:', e.error);
    }
  };

  browserRecognizer.onend = () => {
    if (isVoiceListening) {
      try { browserRecognizer.start(); } catch (e) {}
    }
  };
}

async function sendUserMessage(text) {
  const msg = text || chatInput.value.trim();
  if (!msg) return;

  chatInput.value = '';
  appendChatMessage('user', msg);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    // Only append if WebSocket is offline (active WS broadcast handles real-time append)
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      appendChatMessage('assistant', data.response);
      speakResponse(data.response);
    }
  } catch (err) {
    appendChatMessage('assistant', 'Telemetry connection failure. Operating offline, Sir.');
  }
}

btnSend.addEventListener('click', () => sendUserMessage());
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendUserMessage();
});

// Quick Action Chips
document.querySelectorAll('.quick-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const cmd = chip.getAttribute('data-cmd');
    if (cmd === 'scan wi-fi') {
      btnScanNet.click();
    } else {
      sendUserMessage(cmd);
    }
  });
});

// 7. Voice Toggle Button (Hybrid Browser Web Speech + Desktop Fallback)
btnVoiceToggle.addEventListener('click', async () => {
  isVoiceListening = !isVoiceListening;
  btnVoiceToggle.classList.toggle('active', isVoiceListening);
  
  if (isVoiceListening) {
    voiceBtnText.textContent = 'VOICE: ACTIVE';
    
    // 1. Try browser Web Speech first
    if (browserRecognizer) {
      try {
        browserRecognizer.start();
        appendChatMessage('assistant', 'Microphone audio feed initialized. Speak your commands, Sir.');
        speakResponse('Microphone audio feed initialized. Speak your commands, Sir.');
      } catch (err) {
        console.debug('Browser speech start:', err);
      }
    }

    // 2. Also notify backend voice service if running locally
    try {
      await fetch('/api/voice/start', { method: 'POST' });
    } catch (e) {
      // Serverless or background
    }
  } else {
    voiceBtnText.textContent = 'VOICE: STANDBY';
    if (browserRecognizer) {
      try { browserRecognizer.stop(); } catch (e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    try {
      await fetch('/api/voice/stop', { method: 'POST' });
    } catch (e) {}
    appendChatMessage('assistant', 'Voice listeners disengaged.');
  }
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  pollTelemetryFallback();
  setInterval(pollTelemetryFallback, 4000);
});
