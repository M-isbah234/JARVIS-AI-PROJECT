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
      // Temporarily halt recognizer so J.A.R.V.I.S. doesn't capture his own audio output
      if (browserRecognizer && isRecognizing) {
        try { browserRecognizer.stop(); } catch (e) {}
      }
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

  browserRecognizer.onstart = () => {
    isRecognizing = true;
    const splash = document.getElementById('splashScreen');
    const splashStatus = document.getElementById('splashStatusText');
    if (splash) splash.classList.add('listening');
    if (splashStatus && (!window.speechSynthesis || !window.speechSynthesis.speaking)) {
      splashStatus.textContent = 'LISTENING... // SPEAK NOW';
    }
  };

  browserRecognizer.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal) {
      const transcript = lastResult[0].transcript.trim();
      if (transcript) {
        console.log('[Web Speech Captured]:', transcript);
        const splashStatus = document.getElementById('splashStatusText');
        if (splashStatus) {
          splashStatus.textContent = `ANALYZING // "${transcript.slice(0, 22).toUpperCase()}"`;
        }
        sendUserMessage(transcript);
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
    // Automatically re-listen if voice mode is engaged and not currently outputting audio
    if (isVoiceListening && (!window.speechSynthesis || !window.speechSynthesis.speaking)) {
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
async function setVoiceListeningState(active, speakGreeting = false) {
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
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    try {
      fetch('/api/voice/stop', { method: 'POST' });
    } catch (e) {}
    appendChatMessage('assistant', 'Voice listeners disengaged.');
  }
}

btnVoiceToggle.addEventListener('click', () => {
  setVoiceListeningState(!isVoiceListening, !isVoiceListening);
});

// ==============================================================================
// ==============================================================================
// 8. 3D Neural Web Particle Constellation Engine (Iron Man HUD Voice Reactive)
// Organic Fluid Undulation, Dynamic Synaptic Pulses, and Multi-Harmonic Waves
// ==============================================================================

class NeuralWebVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 280; // Dense, intricate neural web
    this.signals = []; // Active synaptic pulses traveling along filaments
    this.maxSignals = 45;
    this.isSpeaking = false;
    this.speechCadence = 0;
    this.voiceIntensity = 0;
    this.time = 0;
    this.animId = null;

    this.init();
  }

  init() {
    this.resize();
    this.createParticles();
    window.addEventListener('resize', () => {
      this.resize();
      this.createParticles();
    });
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.minDim = Math.min(this.width, this.height);
  }

  createParticles() {
    this.particles = [];
    this.signals = [];
    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Volumetric radial layering: 0 = near core boundary, 1 = outer undulating boundary
      // Quadratic spread distributes points smoothly across the depth volume, preventing hollow donut rings
      const layer = Math.pow(Math.random(), 0.75); 
      // Base idle anchor radius: hugs safely outside the 88px inner core (115px to 235px)
      const baseRadius = 115 + layer * 120;

      this.particles.push({
        angle: angle,
        layer: layer, // 0 (inner) to 1 (outer periphery)
        baseRadius: baseRadius,
        currentRadius: baseRadius,
        targetRadius: baseRadius,
        z: (Math.random() - 0.5) * 260, // Volumetric 3D depth
        // Angular drift: varied speeds create dynamic, non-rigid rotation
        angularSpeed: (Math.random() * 0.003 + 0.001) * (Math.random() > 0.45 ? 1 : -1),
        // Organic undulating harmonic parameters
        harmonicPhase: Math.random() * Math.PI * 2,
        harmonicSpeed: Math.random() * 0.04 + 0.02,
        // Individual breathing oscillation
        flutterSpeed: Math.random() * 0.06 + 0.03,
        flutterPhase: Math.random() * Math.PI * 2,
        // Sharp pinpoint dot geometry
        size: Math.random() * 0.75 + 0.65,
        pulseOffset: Math.random() * Math.PI * 2,
        baseAlpha: Math.random() * 0.35 + 0.55,
        energyFlash: 0 // Flash intensity when synaptic pulse arrives
      });
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;
  }

  animate() {
    this.time += 0.032;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Multi-harmonic voice cadence wave: dynamically fluctuates between normal (50%) and stretched (70%)
    if (this.isSpeaking) {
      const voiceWave = Math.sin(this.time * 5.4) * 0.40 + 
                        Math.sin(this.time * 11.2) * 0.35 + 
                        Math.cos(this.time * 17.6) * 0.25;
      // 0 = normal speaking baseline, 1 = fully stretched vocal peak
      this.voiceIntensity = Math.max(0, Math.min(1, 0.45 + voiceWave * 0.55));
      this.speechCadence += (1.0 - this.speechCadence) * 0.12;
    } else {
      this.voiceIntensity = 0;
      this.speechCadence += (0 - this.speechCadence) * 0.06;
    }

    // Exact Page Coverage Targets
    // Normal Speaking Coverage: diameter = 50% of viewport min dimension (radius = minDim * 0.25)
    const normalSpeakRadius = this.minDim * 0.25;
    // Peak Voice Stretch Coverage: diameter = 70% of viewport min dimension (radius = minDim * 0.35)
    const maxStretchRadius = this.minDim * 0.35;
    // Dynamic active speech radius modulated by voice cadence
    const currentVoiceRadius = normalSpeakRadius + (maxStretchRadius - normalSpeakRadius) * this.voiceIntensity;

    const maxConnectDist = this.isSpeaking ? Math.max(78, this.minDim * 0.09) : 54;
    const maxConnectDistSq = maxConnectDist * maxConnectDist;
    const renderedNodes = [];

    // 1. Update Particle Positions with Organic Undulating Waves & 3D Perspective
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Tangential orbital drift (speeds up slightly with speech)
      p.angle += p.angularSpeed * (1 + this.speechCadence * 1.6);

      // Multi-harmonic wave ripples along circumference (eliminates rigid circle / straight lines)
      const wave1 = Math.sin(p.angle * 3 + this.time * 2.2 + p.harmonicPhase) * 0.38;
      const wave2 = Math.cos(p.angle * 5 - this.time * 2.8) * 0.32;
      const wave3 = Math.sin(p.angle * 7 + this.time * 3.7) * 0.20;
      const wave4 = Math.sin(p.angle * 11 - this.time * 5.1) * 0.12;
      const organicRipple = (wave1 + wave2 + wave3 + wave4) * (this.minDim * 0.055) * p.layer * this.speechCadence;

      // Radial shockwave ripple propagating outward from core to periphery
      const travelingShockwave = Math.sin(this.time * 7.5 - p.currentRadius * 0.02) * (14 * p.layer * this.speechCadence);

      // Individual organic breathing
      const idleFlutter = Math.sin(this.time * 2.5 + p.flutterPhase) * (4 + p.layer * 6);

      // Target radius calculation: volumetric interpolation from inner core boundary to outer 50%-70% perimeter
      const innerCoreMargin = 115;
      const layerTargetVoice = innerCoreMargin + p.layer * (currentVoiceRadius - innerCoreMargin);
      const targetR = (p.baseRadius * (1 - this.speechCadence)) + 
                      (layerTargetVoice * this.speechCadence) + 
                      organicRipple + 
                      travelingShockwave + 
                      idleFlutter;

      // Fluid spring dampening for smooth organic motion
      p.currentRadius += (targetR - p.currentRadius) * 0.085;

      // 3D perspective projection
      const fov = 420;
      const scale = fov / (fov + p.z);
      const px = this.cx + Math.cos(p.angle) * p.currentRadius * scale;
      const py = this.cy + Math.sin(p.angle) * p.currentRadius * scale;

      // Decay energy flash
      if (p.energyFlash > 0) p.energyFlash *= 0.88;

      const alphaPulse = Math.sin(this.time * 3 + p.pulseOffset) * 0.2;
      const currentAlpha = Math.min(1, Math.max(0.18, p.baseAlpha + alphaPulse + this.speechCadence * 0.35 + p.energyFlash));

      renderedNodes.push({
        id: i,
        x: px,
        y: py,
        z: p.z,
        layer: p.layer,
        angle: p.angle,
        size: p.size * scale * (1 + this.speechCadence * 0.25 + p.energyFlash * 0.4),
        alpha: currentAlpha,
        energyFlash: p.energyFlash,
        connections: 0
      });
    }

    // 2. Render Living Synaptic Filaments (Organic Line Network)
    const activeFilaments = [];

    for (let i = 0; i < renderedNodes.length; i++) {
      const n1 = renderedNodes[i];
      for (let j = i + 1; j < renderedNodes.length; j++) {
        const n2 = renderedNodes[j];
        if (n1.connections > 5 && n2.connections > 5) continue;

        // Prevent rigid chords: reduce connection likelihood between two far-outer perimeter nodes
        if (n1.layer > 0.82 && n2.layer > 0.82) {
          const angleDiff = Math.abs(n1.angle - n2.angle);
          if (angleDiff > 0.35 && angleDiff < Math.PI * 2 - 0.35) continue;
        }

        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxConnectDistSq) {
          const dist = Math.sqrt(distSq);
          // Audio shimmer wave along lines
          const shimmer = Math.sin(this.time * 4.5 + (n1.angle + n2.angle) * 2) * 0.2;
          const baseLineAlpha = (1 - dist / maxConnectDist) * (0.50 + shimmer) * Math.min(n1.alpha, n2.alpha);
          
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          
          if (this.isSpeaking) {
            ctx.strokeStyle = `rgba(0, 229, 255, ${Math.min(1, baseLineAlpha * 1.35)})`;
            ctx.lineWidth = 0.7;
          } else {
            ctx.strokeStyle = `rgba(77, 216, 255, ${Math.min(1, baseLineAlpha * 0.65)})`;
            ctx.lineWidth = 0.45;
          }
          ctx.stroke();

          n1.connections++;
          n2.connections++;

          activeFilaments.push({ n1, n2 });
        }
      }
    }

    // 3. Synaptic Energy Signal Packets (Darting Electric Sparks)
    // Spawns and transmits electric pulses along connections to make network feel alive
    if (activeFilaments.length > 0) {
      const spawnTarget = this.isSpeaking ? this.maxSignals : 18;
      if (this.signals.length < spawnTarget && Math.random() < (this.isSpeaking ? 0.45 : 0.15)) {
        const filament = activeFilaments[Math.floor(Math.random() * activeFilaments.length)];
        this.signals.push({
          n1: filament.n1,
          n2: filament.n2,
          progress: 0,
          speed: Math.random() * 0.04 + (this.isSpeaking ? 0.035 : 0.02)
        });
      }
    }

    // Update and render active synaptic signals
    for (let s = this.signals.length - 1; s >= 0; s--) {
      const sig = this.signals[s];
      sig.progress += sig.speed;

      if (sig.progress >= 1.0) {
        // Flash destination node on arrival
        const destParticle = this.particles[sig.n2.id];
        if (destParticle) destParticle.energyFlash = 0.8;
        this.signals.splice(s, 1);
        continue;
      }

      const sx = sig.n1.x + (sig.n2.x - sig.n1.x) * sig.progress;
      const sy = sig.n1.y + (sig.n2.y - sig.n1.y) * sig.progress;

      // Electric spark aura
      ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Sharp white signal core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Render Crisp Pinpoint Glowing Nodes
    for (let i = 0; i < renderedNodes.length; i++) {
      const n = renderedNodes[i];
      
      // Node Subtle Halo Aura
      const haloRadius = n.size * (2.8 + n.energyFlash * 2.0);
      const glowGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloRadius);
      glowGrad.addColorStop(0, `rgba(0, 229, 255, ${n.alpha * 0.9})`);
      glowGrad.addColorStop(0.5, `rgba(77, 216, 255, ${n.alpha * 0.35})`);
      glowGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // Node Sharp Center Core (Pinpoint)
      ctx.fillStyle = (this.isSpeaking || n.energyFlash > 0.3) ? '#ffffff' : '#7fe8ff';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    this.animId = requestAnimationFrame(() => this.animate());
  }
}

// 9. Splash Screen Navigation & Interactive Transitions
function initSplashTransitions() {
  const splashScreen = document.getElementById('splashScreen');
  const btnReturnSplash = document.getElementById('btnReturnSplash');
  const logoWrapper = document.querySelector('.splash-centerpiece-wrapper');

  if (logoWrapper) {
    logoWrapper.addEventListener('click', (e) => {
      e.stopPropagation(); // Stay on splash screen to converse with J.A.R.V.I.S.
      // Engage voice hearing mode: open mic, speak greeting, and await user command
      setVoiceListeningState(true, true);
    });
  }

  if (splashScreen) {
    splashScreen.addEventListener('click', () => {
      // Clicking outside the logo transitions to the tactical deck
      splashScreen.classList.add('hidden');
    });
  }

  if (btnReturnSplash && splashScreen) {
    btnReturnSplash.addEventListener('click', (e) => {
      e.stopPropagation();
      splashScreen.classList.remove('hidden');
    });
  }
}

let neuralVisualizer = null;

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  pollTelemetryFallback();
  setInterval(pollTelemetryFallback, 4000);
  neuralVisualizer = new NeuralWebVisualizer('neuralWebCanvas');
  initSplashTransitions();
});
