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
          speakResponse(msg.reply, isVoiceListening);
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

function setSpeakingVisualState(active) {
  const splash = document.getElementById('splashScreen');
  const splashStatus = document.getElementById('splashStatusText');
  if (splash) {
    splash.classList.toggle('speaking', active);
  }
  if (splashStatus) {
    splashStatus.textContent = active ? 'TRANSMITTING // VOICE CADENCE' : 'NEURAL CORE ONLINE';
  }
  if (neuralVisualizer) {
    neuralVisualizer.setSpeaking(active);
  }
}

let isRecognizing = false;

function speakResponse(text, force = false) {
  if ((!isVoiceListening && !force) || !window.speechSynthesis) return;
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

    // Pulse and dissolve rings into 3D neural web while J.A.R.V.I.S. speaks
    utterance.onstart = () => {
      // Keep microphone active so user can say "Stop" at any moment to interrupt!
      const splash = document.getElementById('splashScreen');
      if (splash) splash.classList.remove('listening');
      setSpeakingVisualState(true);
    };

    const handleSpeechFinish = () => {
      setSpeakingVisualState(false);
      const splash = document.getElementById('splashScreen');
      const splashStatus = document.getElementById('splashStatusText');
      if (isVoiceListening) {
        if (splash) splash.classList.add('listening');
        if (splashStatus) splashStatus.textContent = 'LISTENING... // SPEAK NOW';
        if (browserRecognizer && !isRecognizing) {
          try { browserRecognizer.start(); } catch (e) {}
        }
      } else {
        if (splash) splash.classList.remove('listening');
        if (splashStatus) splashStatus.textContent = 'NEURAL CORE ONLINE';
      }
    };

    utterance.onend = handleSpeechFinish;
    utterance.onerror = handleSpeechFinish;

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.debug('TTS note:', e);
    setSpeakingVisualState(false);
  }
}

// Immediate Stop Interrupt Controller (English, Roman Urdu, Urdu Script, and ASR phonetic mishearings)
function isStopCommand(text) {
  if (!text) return false;
  const clean = text.toLowerCase().trim();
  const enMatch = /\b(stop|quiet|shut\s*up|silence|ruko|chup|ruk\s*jao|bas\s*karo|band\s*karo|khamosh|rocco|record)\b/i.test(clean);
  const urMatch = /[\u0600-\u06FF]/.test(clean) && /(روکو|چپ|رک\s*جاؤ|بس\s*کرو|بند\s*کرو|خاموش)/.test(clean);
  return enMatch || urMatch;
}

// Voice OFF Voice Command Detector ("voice off", "go to sleep", "awaz band karo", "so jao")
function isVoiceOffCommand(text) {
  if (!text) return false;
  const clean = text.toLowerCase().trim();
  const enMatch = /\b(voice\s*off|turn\s*off\s*voice|stop\s*listening|go\s*to\s*sleep|sleep\s*mode|disable\s*voice|standby\s*voice|voice\s*standby|sleep)\b/i.test(clean);
  const urMatch = /\b(awaz\s*band(?:\s*karo)?|so\s*jao|sunna\s*band(?:\s*karo)?|mic\s*band(?:\s*karo)?|khamosh\s*ho\s*jao)\b/i.test(clean) ||
                  (/[\u0600-\u06FF]/.test(clean) && /(آواز\s*بند|سو\s*جاؤ|سننا\s*بند|مائیک\s*بند|خاموش|بند\s*ہو\s*جاؤ)/.test(clean));
  return enMatch || urMatch;
}

function stopSpeakingImmediately() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  setSpeakingVisualState(false);
  const splash = document.getElementById('splashScreen');
  const splashStatus = document.getElementById('splashStatusText');
  if (isVoiceListening) {
    if (splash) splash.classList.add('listening');
    if (splashStatus) splashStatus.textContent = 'SPEECH HALTED // LISTENING';
  }
}

// Active Speech Language (Defaulting to ur-PK which handles both Urdu and code-switched English)
let currentSpeechLang = localStorage.getItem('jarvis_speech_lang') || 'ur-PK';

function setSpeechLanguage(lang, announce = false) {
  currentSpeechLang = lang;
  localStorage.setItem('jarvis_speech_lang', lang);
  if (browserRecognizer) {
    const wasListening = isRecognizing;
    try { browserRecognizer.abort(); } catch (e) {}
    browserRecognizer.lang = lang;
    if (wasListening) {
      setTimeout(() => {
        try { browserRecognizer.start(); } catch (e) {}
      }, 250);
    }
  }
  updateLanguageDisplay();
  if (announce) {
    const label = lang === 'ur-PK' ? 'Urdu & bilingual' : 'English (US)';
    const reply = `Speech recognition language switched to ${label} mode, Sir.`;
    appendChatMessage('assistant', reply);
    speakResponse(reply, true);
  }
}

function updateLanguageDisplay() {
  const langText = document.getElementById('langBtnText');
  const splashLangBtn = document.getElementById('splashLangBtn');
  const label = currentSpeechLang === 'ur-PK' ? 'LANG: URDU (PK)' : 'LANG: EN (US)';
  if (langText) langText.textContent = label;
  if (splashLangBtn) splashLangBtn.textContent = currentSpeechLang === 'ur-PK' ? '🌐 URDU' : '🌐 EN-US';
}

// Ensure voices are loaded in Chromium browsers
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// Browser Web Speech Recognition (Microphone Input with Real-Time Interruption)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let browserRecognizer = null;

if (SpeechRecognition) {
  browserRecognizer = new SpeechRecognition();
  browserRecognizer.continuous = true;
  browserRecognizer.interimResults = true; // Enables instantaneous "Stop" detection while talking
  browserRecognizer.lang = currentSpeechLang;

  browserRecognizer.onstart = () => {
    isRecognizing = true;
    const splash = document.getElementById('splashScreen');
    const splashStatus = document.getElementById('splashStatusText');
    if (isVoiceListening) {
      if (splash) splash.classList.add('listening');
      if (splashStatus && (!window.speechSynthesis || !window.speechSynthesis.speaking)) {
        splashStatus.textContent = 'LISTENING... // SPEAK NOW';
      }
    }
  };

  browserRecognizer.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const transcript = res[0].transcript.trim();

      // PRIORITY 1: IMMEDIATE INTERRUPT - Halt speech whenever user says "Stop", "Ruko", "Chup"
      if (isStopCommand(transcript)) {
        stopSpeakingImmediately();
        if (res.isFinal) {
          appendChatMessage('user', transcript);
          appendChatMessage('assistant', 'Speech output terminated, Sir.');
        }
        return;
      }

      // If J.A.R.V.I.S. is currently speaking out loud, ignore non-stop audio to prevent self-loop echo
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        continue;
      }

      // Only process commands when voice recognition is active
      if (!isVoiceListening) {
        return;
      }

      // PRIORITY 2: TURN VOICE RECOGNITION OFF VIA SPEECH
      if (isVoiceOffCommand(transcript)) {
        if (res.isFinal) {
          console.log('[Voice OFF Command]:', transcript);
          appendChatMessage('user', transcript);
          const reply = currentSpeechLang === 'ur-PK' ? 
            'وائس ریکگنیشن بند کر دی گئی ہے، سر۔' : 
            'Voice listeners disengaged, Sir.';
          appendChatMessage('assistant', reply);
          speakResponse(reply, true);
          setVoiceListeningState(false, false, false);
        }
        return;
      }

      // Process complete user command upon final utterance
      if (res.isFinal && transcript) {
        console.log('[Web Speech Captured]:', transcript);
        handleVoiceCommandOrChat(transcript);
      }
    }
  };

  browserRecognizer.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.warn('[Web Speech Error]:', e.error);
    }
    isRecognizing = false;
  };

  browserRecognizer.onend = () => {
    isRecognizing = false;
    // Automatically re-listen only if voice mode is engaged and not currently outputting audio
    if (isVoiceListening && (!window.speechSynthesis || !window.speechSynthesis.speaking)) {
      try { browserRecognizer.start(); } catch (e) {}
    }
  };
}

// Hardware Panel Drawer State Controller (Voice & UI Activated)
function setHardwarePanelState(open, announce = false) {
  const panel = document.getElementById('hardwarePanel');
  const dockBtn = document.getElementById('btnToggleHardware');
  if (!panel) return;

  if (open) {
    panel.classList.remove('collapsed');
    if (dockBtn) dockBtn.style.display = 'none';
  } else {
    panel.classList.add('collapsed');
    if (dockBtn) dockBtn.style.display = 'flex';
  }

  if (announce) {
    const isUrdu = currentSpeechLang === 'ur-PK';
    const text = open ? 
      (isUrdu ? 'ہارڈویئر اور لائٹنگ پینل کھول دیا گیا ہے، سر۔' : 'Hardware management and lighting matrix deployed, Sir.') :
      (isUrdu ? 'ہارڈویئر پینل بند کر دیا گیا ہے، سر۔' : 'Hardware panel docked, Sir.');
    appendChatMessage('assistant', text);
    speakResponse(text, true);
  }
}

function isHardwareOpenCommand(text) {
  const t = text.trim();
  // Avoid matching device power toggling commands like "turn on lights" or "switch plug"
  if (/\b(turn|switch|power\s*on|power\s*off)\b/i.test(t)) {
    return false;
  }
  const enRegex = /\b(telemetry|energy\s*telemetry|open\s*telemetry|show\s*telemetry|hardware\s*management|open\s*hardware|show\s*hardware|hardware\s*panel|lights\s*panel|smart\s*lights|lights\s*management|open\s*lights|show\s*lights|hardware\s*kholo|lights\s*kholo|hardware\s*dikhao|lights\s*dikhao)\b/i;
  const exactRegex = /^(?:telemetry|hardware|lights|smart\s*plug|smart\s*lights|hardware\s*management)$/i;
  const urduRegex = /[\u0600-\u06FF]/.test(t) && /(ہارڈویئر\s*(?:مینجمنٹ|پینل|کھولو|دکھاؤ)?|لائٹس\s*(?:پینل|کھولو|دکھاؤ)|بجلی\s*پینل)/.test(t);

  return enRegex.test(t) || exactRegex.test(t) || urduRegex;
}

function isHardwareCloseCommand(text) {
  const t = text.trim();
  const enRegex = /\b(close\s*hardware|hide\s*hardware|dock\s*hardware|close\s*lights|hide\s*lights|dock\s*lights|hardware\s*band(?:\s*karo)?|lights\s*band(?:\s*karo)?|band\s*karo\s*hardware)\b/i;
  const urduRegex = /[\u0600-\u06FF]/.test(t) && /(ہارڈویئر\s*بند|لائٹس\s*بند|پینل\s*بند|ہارڈویئر\s*چھپاؤ)/.test(t);

  return enRegex.test(t) || urduRegex;
}

// Voice Command Router (Start Deck, Stand Down, Hardware Drawer, or Bilingual AI Core)
function handleVoiceCommandOrChat(text) {
  const clean = text.trim();
  if (!clean) return;

  const splashScreen = document.getElementById('splashScreen');
  const splashStatus = document.getElementById('splashStatusText');

  // 1. Hardware Drawer Close Command:
  if (isHardwareCloseCommand(clean)) {
    appendChatMessage('user', clean);
    setHardwarePanelState(false, true);
    return;
  }

  // 2. Hardware Drawer Open Command ("hardware management", "lights", etc.):
  if (isHardwareOpenCommand(clean)) {
    // If on splash screen, transition to tactical deck too!
    if (splashScreen) {
      splashScreen.classList.add('hidden');
    }
    if (splashStatus) {
      splashStatus.textContent = 'HARDWARE MATRIX DEPLOYED';
    }
    appendChatMessage('user', clean);
    setHardwarePanelState(true, true);
    return;
  }

  // 3. Transition to Chat & Hardware Deck:
  // "when i say 'Lets start', 'Lets begin', 'Shuru karen', 'Haan bhi', it should transition to the chat and hardware side"
  const isStartCmd = (
    /\b(let'?s\s*start|let'?s\s*begin|shuru\s*kar(?:en|ein|o|iye)?|haan?\s*(?:bhi|bhai|jee|ji)?|han\s*bhi|chalo\s*shuru|sure\s*(?:karen|current|can)|sugar\s*can|shoe\s*can|on\s*the|hun\s*bee|harm\s*be)\b/i.test(clean) ||
    (/[\u0600-\u06FF]/.test(clean) && /(شروع\s*(?:کریں|کرو|کیجیے)?|ہاں\s*(?:بھائی|جی|بھی)|چلو)/.test(clean))
  );

  if (isStartCmd) {
    if (splashScreen) {
      splashScreen.classList.add('hidden');
    }
    if (splashStatus) {
      splashStatus.textContent = 'TACTICAL DECK ENGAGED';
    }
    appendChatMessage('user', clean);
    const reply = "Tactical matrix and dialogue core engaged, Sir. Standing by.";
    appendChatMessage('assistant', reply);
    speakResponse(reply, true);
    return;
  }

  // 4. Return back to Arc Reactor Centerpiece:
  // "when i say 'Standown' it should return back to arc reactor"
  const isStandDownCmd = (
    /\b(stand\s*down|standown|stand-down|return\s*(?:to\s*)?arc|arc\s*core|wapas\s*jao|piche\s*hato)\b/i.test(clean) ||
    (/[\u0600-\u06FF]/.test(clean) && /(واپس\s*جاؤ|کھڑے\s*ہو\s*جاؤ|سٹینڈ\s*ڈاؤن)/.test(clean))
  );

  if (isStandDownCmd) {
    if (splashScreen) {
      splashScreen.classList.remove('hidden');
    }
    if (splashStatus) {
      splashStatus.textContent = 'NEURAL CORE ONLINE';
    }
    appendChatMessage('user', clean);
    const reply = "Standing down to neural core, Sir.";
    appendChatMessage('assistant', reply);
    speakResponse(reply, true);
    return;
  }

  // 5. Regular Command or Dialogue -> Chat Pipeline
  if (splashStatus) {
    splashStatus.textContent = `ANALYZING // "${clean.slice(0, 22).toUpperCase()}"`;
  }
  sendUserMessage(clean);
}

async function sendUserMessage(text) {
  const msg = text || chatInput.value.trim();
  if (!msg) return;

  chatInput.value = '';

  // Check typed commands for start, standdown, hardware, and stop as well
  const splashScreen = document.getElementById('splashScreen');
  if (isStopCommand(msg)) {
    stopSpeakingImmediately();
    appendChatMessage('user', msg);
    appendChatMessage('assistant', 'Speech output terminated, Sir.');
    return;
  }

  if (isHardwareCloseCommand(msg)) {
    appendChatMessage('user', msg);
    setHardwarePanelState(false, true);
    return;
  }

  if (isHardwareOpenCommand(msg)) {
    if (splashScreen) splashScreen.classList.add('hidden');
    appendChatMessage('user', msg);
    setHardwarePanelState(true, true);
    return;
  }

  const isStartCmd = (
    /\b(let'?s\s*start|let'?s\s*begin|shuru\s*kar(?:en|ein|o|iye)?|haan?\s*(?:bhi|bhai|jee|ji)?|han\s*bhi|chalo\s*shuru)\b/i.test(msg) ||
    (/[\u0600-\u06FF]/.test(msg) && /(شروع\s*(?:کریں|کرو|کیجیے)?|ہاں\s*(?:بھائی|جی|بھی)|چلو)/.test(msg))
  );
  if (isStartCmd) {
    if (splashScreen) splashScreen.classList.add('hidden');
    appendChatMessage('user', msg);
    const reply = "Tactical matrix and dialogue core engaged, Sir. Standing by.";
    appendChatMessage('assistant', reply);
    speakResponse(reply, true);
    return;
  }
  const isStandDownCmd = (
    /\b(stand\s*down|standown|stand-down|return\s*(?:to\s*)?arc|arc\s*core|wapas\s*jao|piche\s*hato)\b/i.test(msg) ||
    (/[\u0600-\u06FF]/.test(msg) && /(واپس\s*جاؤ|کھڑے\s*ہو\s*جاؤ|سٹینڈ\s*ڈاؤن)/.test(msg))
  );
  if (isStandDownCmd) {
    if (splashScreen) splashScreen.classList.remove('hidden');
    appendChatMessage('user', msg);
    const reply = "Standing down to neural core, Sir.";
    appendChatMessage('assistant', reply);
    speakResponse(reply, true);
    return;
  }

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
      if (data && data.response) {
        appendChatMessage('assistant', data.response);
        speakResponse(data.response, isVoiceListening);
      }
    }
  } catch (err) {
    appendChatMessage('assistant', 'Telemetry connection failure. Operating offline, Sir.');
    if (isVoiceListening) {
      speakResponse('Telemetry connection failure. Operating offline, Sir.', true);
    }
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

// 7. Master Voice Listener & Speaker State Controller
async function setVoiceListeningState(active, speakGreeting = false, immediateMute = true) {
  isVoiceListening = active;
  const splash = document.getElementById('splashScreen');
  const splashStatus = document.getElementById('splashStatusText');
  const splashVoiceStatus = document.getElementById('splashVoiceStatus');

  if (btnVoiceToggle) btnVoiceToggle.classList.toggle('active', isVoiceListening);
  if (voiceBtnText) voiceBtnText.textContent = isVoiceListening ? 'VOICE: ACTIVE' : 'VOICE: STANDBY';

  if (isVoiceListening) {
    if (splash) splash.classList.add('listening');
    if (splashVoiceStatus) splashVoiceStatus.textContent = 'MICROPHONE ACTIVE // LISTENING FOR COMMAND';

    // Proactively request browser microphone permission
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('Microphone permission request:', err);
      }
    }

    // Start Web Speech Recognition
    if (browserRecognizer && !isRecognizing) {
      try { browserRecognizer.start(); } catch (e) {}
    }

    // Notify backend voice service if running locally
    try {
      fetch('/api/voice/start', { method: 'POST' });
    } catch (e) {}

    if (speakGreeting) {
      if (splashStatus) splashStatus.textContent = 'TRANSMITTING // INITIALIZING';
      appendChatMessage('assistant', 'Microphone audio feed initialized. Standing by for your commands, Sir.');
      speakResponse('I am listening, Sir. How may I assist you?', true);
    } else {
      if (splashStatus) splashStatus.textContent = 'LISTENING... // SPEAK NOW';
    }
  } else {
    if (splash) splash.classList.remove('listening');
    if (splashStatus) splashStatus.textContent = 'NEURAL CORE ONLINE';
    if (splashVoiceStatus) splashVoiceStatus.textContent = 'VOICE LISTENERS STANDING BY // CLICK LOGO TO SPEAK';

    if (browserRecognizer && isRecognizing) {
      try { browserRecognizer.stop(); } catch (e) {}
    }
    if (immediateMute && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    try {
      fetch('/api/voice/stop', { method: 'POST' });
    } catch (e) {}
    if (immediateMute) {
      appendChatMessage('assistant', 'Voice listeners disengaged.');
    }
  }
}

btnVoiceToggle.addEventListener('click', () => {
  setVoiceListeningState(!isVoiceListening, !isVoiceListening);
});

// ==============================================================================
// ==============================================================================
// 8. 3D J.A.R.V.I.S. Holographic Neural Network Globe (Three.js WebGL Engine)
// 380 Fibonacci Nodes, 150 Drifting Dust Sparks, Pure & Dark Gold Palette
// Micro-Flicker Filament Circuits, Pinpoint Photonic Additive Glow, OrbitControls
// ==============================================================================

class JarvisNeuralGlobeVisualizer {
  constructor(mountId) {
    this.container = document.getElementById(mountId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.holoGroup = null;

    this.nodeShaderMaterial = null;
    this.lineShaderMaterial = null;
    this.sparkGeo = null;
    this.sparkVelocities = [];
    this.sparkCount = 150;

    this.brightness = Number(localStorage.getItem('jarvis_brightness')) || 50;
    this.contrast = Number(localStorage.getItem('jarvis_contrast')) || 50;

    this.animId = null;
    this.startTime = performance.now();

    this.init();
    // Calibration HUD removed
  }

  init() {
    if (typeof THREE === 'undefined') {
      console.warn('[J.A.R.V.I.S. Globe] Three.js not yet loaded, retrying...');
      setTimeout(() => this.init(), 100);
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 11.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Transparent canvas: preserves authentic J.A.R.V.I.S. radial gradient background!
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0.0);
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.4;
      this.controls.minDistance = 4;
      this.controls.maxDistance = 40;
      this.controls.enableZoom = true;
      this.controls.enablePan = false;
    }

    this.holoGroup = new THREE.Group();
    this.scene.add(this.holoGroup);

    // Build the 380-node Spherical Neural Matrix
    this.buildNeuralMatrix();

    // Build the 150 Drifting Dust Sparks
    this.buildDustSparks();

    // Apply saved tone mapping
    this.applyToneMapping();

    // Resize Handler
    window.addEventListener('resize', () => this.onResize(), { passive: true });

    // Start Loop
    this.animate();
  }

  buildNeuralMatrix() {
    const NODE_COUNT = 380;
    const nodes = [];
    const nodePositions = new Float32Array(NODE_COUNT * 3);
    const nodeBasePositions = new Float32Array(NODE_COUNT * 3);
    const nodeColors = new Float32Array(NODE_COUNT * 3);
    const nodeSizes = new Float32Array(NODE_COUNT);
    const nodePhases = new Float32Array(NODE_COUNT);

    const jarvisPalette = [
      new THREE.Color('#ffd700'), // Pure gold hub
      new THREE.Color('#f8bc4c'), // Primary golden yellow
      new THREE.Color('#e08a1e'), // Rich amber
      new THREE.Color('#b86b14'), // Dark bronze circuit
      new THREE.Color('#ffb830'), // Solar flare gold
      new THREE.Color('#b8860b'), // Dark gold
    ];

    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / NODE_COUNT);
      const theta = Math.PI * (1 + 5 ** 0.5) * (i + 0.5);

      let radius = 3.5;
      if (i % 5 === 0) radius = 2.4 + Math.random() * 0.7;
      else if (i % 5 === 1) radius = 3.3 + Math.random() * 0.5;
      else if (i % 5 === 2) radius = 3.8 + Math.random() * 0.5;
      else radius = 3.5 + Math.random() * 0.8;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi) * 0.95;
      const z = radius * Math.sin(phi) * Math.sin(theta);

      nodes.push(new THREE.Vector3(x, y, z));

      nodePositions[i * 3] = x;
      nodePositions[i * 3 + 1] = y;
      nodePositions[i * 3 + 2] = z;

      nodeBasePositions[i * 3] = x;
      nodeBasePositions[i * 3 + 1] = y;
      nodeBasePositions[i * 3 + 2] = z;

      const c = jarvisPalette[Math.floor(Math.random() * jarvisPalette.length)];
      const isHub = (i % 7 === 0);
      const boost = isHub ? 1.4 : 1.0;

      nodeColors[i * 3] = c.r * boost;
      nodeColors[i * 3 + 1] = c.g * boost;
      nodeColors[i * 3 + 2] = c.b * boost;

      nodeSizes[i] = isHub ? 26.0 : (10.0 + Math.random() * 8.0);
      nodePhases[i] = Math.random() * Math.PI * 2;
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute('aBasePos', new THREE.BufferAttribute(nodeBasePositions, 3));
    nodeGeometry.setAttribute('aColor', new THREE.BufferAttribute(nodeColors, 3));
    nodeGeometry.setAttribute('aSize', new THREE.BufferAttribute(nodeSizes, 1));
    nodeGeometry.setAttribute('aPhase', new THREE.BufferAttribute(nodePhases, 1));

    // Connect close neighbors with golden filaments
    const connectionPositions = [];
    const connectionColors = [];
    const maxDist = 2.0;

    for (let i = 0; i < NODE_COUNT; i++) {
      let count = 0;
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const d = nodes[i].distanceTo(nodes[j]);
        if (d < maxDist && count < 3) {
          connectionPositions.push(
            nodes[i].x, nodes[i].y, nodes[i].z,
            nodes[j].x, nodes[j].y, nodes[j].z
          );
          connectionColors.push(
            nodeColors[i * 3], nodeColors[i * 3 + 1], nodeColors[i * 3 + 2],
            nodeColors[j * 3], nodeColors[j * 3 + 1], nodeColors[j * 3 + 2]
          );
          count++;
        }
      }
    }

    const connectionGeometry = new THREE.BufferGeometry();
    connectionGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(connectionPositions, 3)
    );
    connectionGeometry.setAttribute(
      'aBasePos',
      new THREE.Float32BufferAttribute(connectionPositions, 3)
    );
    connectionGeometry.setAttribute(
      'aColor',
      new THREE.Float32BufferAttribute(connectionColors, 3)
    );

    // Fast Glowing Node Shaders with Additive Blending
    this.nodeShaderMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aBasePos;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;

        uniform float uTime;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float wave1 = sin(uTime * 0.9 + aBasePos.x * 0.6 + aPhase) * 0.08;
          float wave2 = cos(uTime * 0.7 + aBasePos.y * 0.6 + aPhase) * 0.08;
          float wave3 = sin(uTime * 0.8 + aBasePos.z * 0.6) * 0.08;

          vec3 displacedPos = aBasePos + vec3(wave1, wave2, wave3);

          vColor = aColor;
          vAlpha = 1.0;

          vec4 mvPosition = modelViewMatrix * vec4(displacedPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          gl_PointSize = aSize * (28.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float core = smoothstep(0.12, 0.0, dist);
          float halo = exp(-dist * 6.0) * 0.5;

          vec3 finalColor = mix(vColor * 1.25, vec3(1.0, 0.96, 0.88), core * 0.8);
          gl_FragColor = vec4(finalColor, (core * 0.6 + halo) * vAlpha);
        }
      `
    });

    const nodesMesh = new THREE.Points(nodeGeometry, this.nodeShaderMaterial);
    this.holoGroup.add(nodesMesh);

    // Micro-flicker connection filaments
    this.lineShaderMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aBasePos;
        attribute vec3 aColor;

        uniform float uTime;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float wave1 = sin(uTime * 0.9 + aBasePos.x * 0.6) * 0.08;
          float wave2 = cos(uTime * 0.7 + aBasePos.y * 0.6) * 0.08;
          float wave3 = sin(uTime * 0.8 + aBasePos.z * 0.6) * 0.08;

          vec3 displacedPos = aBasePos + vec3(wave1, wave2, wave3);

          vColor = aColor;
          vAlpha = 0.26 + 0.24 * sin(uTime * 2.8 + aBasePos.x * 2.5 + aBasePos.y * 3.1);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `
    });

    const connectionsMesh = new THREE.LineSegments(connectionGeometry, this.lineShaderMaterial);
    this.holoGroup.add(connectionsMesh);
  }

  buildDustSparks() {
    const sparkPositions = new Float32Array(this.sparkCount * 3);
    const sparkColors = new Float32Array(this.sparkCount * 3);
    const sparkSizes = new Float32Array(this.sparkCount);
    this.sparkVelocities = [];

    for (let i = 0; i < this.sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 3.6 + Math.random() * 2.2;

      sparkPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      sparkPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      sparkPositions[i * 3 + 2] = r * Math.cos(phi);

      const c = Math.random() < 0.35
        ? new THREE.Color('#ffd700')
        : new THREE.Color('#f8bc4c');

      sparkColors[i * 3] = c.r;
      sparkColors[i * 3 + 1] = c.g;
      sparkColors[i * 3 + 2] = c.b;

      sparkSizes[i] = 6.0 + Math.random() * 10.0;
      this.sparkVelocities.push({
        speedTheta: (Math.random() - 0.5) * 0.004,
        speedPhi: (Math.random() - 0.5) * 0.003,
        r,
        theta,
        phi,
      });
    }

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparkGeo.setAttribute('aColor', new THREE.BufferAttribute(sparkColors, 3));
    this.sparkGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkSizes, 1));

    const sparkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (24.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = exp(-dist * 6.0);
          gl_FragColor = vec4(vColor * 1.5, alpha * 0.75);
        }
      `
    });

    const sparkMesh = new THREE.Points(this.sparkGeo, sparkMat);
    this.holoGroup.add(sparkMesh);
  }

  applyToneMapping() {
    if (this.container) {
      this.container.style.filter = 'none';
    }
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    const elapsedTime = (performance.now() - this.startTime) * 0.001;

    if (this.nodeShaderMaterial) {
      this.nodeShaderMaterial.uniforms.uTime.value = elapsedTime;
    }
    if (this.lineShaderMaterial) {
      this.lineShaderMaterial.uniforms.uTime.value = elapsedTime;
    }

    if (this.sparkGeo && this.sparkVelocities) {
      const posAttr = this.sparkGeo.attributes.position;
      for (let i = 0; i < this.sparkCount; i++) {
        const vel = this.sparkVelocities[i];
        vel.theta += vel.speedTheta;
        vel.phi += vel.speedPhi;

        posAttr.array[i * 3] = vel.r * Math.sin(vel.phi) * Math.cos(vel.theta);
        posAttr.array[i * 3 + 1] = vel.r * Math.sin(vel.phi) * Math.sin(vel.theta);
        posAttr.array[i * 3 + 2] = vel.r * Math.cos(vel.phi);
      }
      posAttr.needsUpdate = true;
    }

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// 9. Splash Screen Navigation & Interactive Transitions
function initSplashTransitions() {
  const splashScreen = document.getElementById('splashScreen');
  const btnReturnSplash = document.getElementById('btnReturnSplash');
  const logoWrapper = document.querySelector('.splash-centerpiece-wrapper');
  const innerCore = document.querySelector('.hud-innermost-core');
  const btnLangToggle = document.getElementById('btnLangToggle');
  const splashLangBtn = document.getElementById('splashLangBtn');

  // Clicking J.A.R.V.I.S. inner core engages voice hearing
  const clickTarget = innerCore || logoWrapper;
  if (clickTarget) {
    clickTarget.addEventListener('click', (e) => {
      e.stopPropagation();
      setVoiceListeningState(true, true);
    });
  }

  // Telemetry Tab Activation Routine (Double-Tap Activated)
  function activateTelemetryTab() {
    if (splashScreen && !splashScreen.classList.contains('hidden')) {
      splashScreen.classList.add('hidden');
    }
    setHardwarePanelState(true, false);
    const telemetryBlock = document.querySelector('.telemetry-block') || document.getElementById('hardwarePanel');
    if (telemetryBlock) {
      telemetryBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      telemetryBlock.classList.add('telemetry-active-pulse');
      setTimeout(() => {
        telemetryBlock.classList.remove('telemetry-active-pulse');
      }, 1800);
    }
  }

  // Double-tap and double-click handling for Telemetry Tab:
  // Single-clicking or dragging allows free 360-degree orbiting of the 3D globe.
  // Double-tapping activates the Telemetry tab!
  let lastTapTime = 0;
  let lastTapPos = { x: 0, y: 0 };

  function checkDoubleTap(clientX, clientY) {
    const now = Date.now();
    const dt = now - lastTapTime;
    const dist = Math.hypot(clientX - lastTapPos.x, clientY - lastTapPos.y);

    if (dt > 40 && dt < 450 && dist < 40) {
      lastTapTime = 0;
      activateTelemetryTab();
      return true;
    }
    lastTapTime = now;
    lastTapPos = { x: clientX, y: clientY };
    return false;
  }

  if (splashScreen) {
    let mouseDownPos = { x: 0, y: 0, time: 0 };

    splashScreen.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    });

    splashScreen.addEventListener('mouseup', (e) => {
      if (e.target.closest('.hud-innermost-core')) return;
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      const dt = Date.now() - mouseDownPos.time;

      // Only evaluate if not an OrbitControls drag (stationary click / tap)
      if (dx < 8 && dy < 8 && dt < 300) {
        checkDoubleTap(e.clientX, e.clientY);
      }
    });

    // Native desktop double-click
    splashScreen.addEventListener('dblclick', (e) => {
      if (e.target.closest('.hud-innermost-core')) return;
      e.preventDefault();
      activateTelemetryTab();
    });

    // Touchscreen double-tap
    splashScreen.addEventListener('touchend', (e) => {
      if (e.target.closest('.hud-innermost-core')) return;
      const touch = e.changedTouches ? e.changedTouches[0] : null;
      if (touch) {
        checkDoubleTap(touch.clientX, touch.clientY);
      }
    });
  }

  // Double-clicking on HUD background or window when splash is active
  window.addEventListener('dblclick', (e) => {
    if (splashScreen && !splashScreen.classList.contains('hidden')) {
      if (e.target.closest('.hud-innermost-core')) return;
      activateTelemetryTab();
    }
  });

  if (btnReturnSplash && splashScreen) {
    btnReturnSplash.addEventListener('click', (e) => {
      e.stopPropagation();
      splashScreen.classList.remove('hidden');
    });
  }

  // Language Toggle Button Handlers (HUD and Splash)
  if (btnLangToggle) {
    btnLangToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextLang = currentSpeechLang === 'ur-PK' ? 'en-US' : 'ur-PK';
      setSpeechLanguage(nextLang, true);
    });
  }
  if (splashLangBtn) {
    splashLangBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextLang = currentSpeechLang === 'ur-PK' ? 'en-US' : 'ur-PK';
      setSpeechLanguage(nextLang, true);
    });
  }

  // Left Dock Option & Close Button Handlers
  const btnToggleHardware = document.getElementById('btnToggleHardware');
  const btnCloseHardware = document.getElementById('btnCloseHardware');

  if (btnToggleHardware) {
    btnToggleHardware.addEventListener('click', (e) => {
      e.stopPropagation();
      activateTelemetryTab();
    });
  }

  if (btnCloseHardware) {
    btnCloseHardware.addEventListener('click', (e) => {
      e.stopPropagation();
      setHardwarePanelState(false, false);
    });
  }
}

let neuralVisualizer = null;

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  pollTelemetryFallback();
  setInterval(pollTelemetryFallback, 4000);
  neuralVisualizer = new JarvisNeuralGlobeVisualizer('jarvisGlobeMount');
  initSplashTransitions();
  updateLanguageDisplay();
  setHardwarePanelState(true, false);
});
