# J.A.R.V.I.S. Smart Plug & Chatbot Controller

> **Autonomous AI Chatbot + Wireless Smart Plug & Lighting Hardware Controller (TP-Link Kasa / Tapo)**  
> *Bilingual (English & Urdu) | Non-Blocking Async Voice Pipeline | Real-Time Energy Telemetry HUD*

---

## ⚡ Overview

This repository houses a dedicated, specialized edition of **J.A.R.V.I.S.** engineered specifically for **instant, wireless local control of smart plugs and smart lights** coupled with an intelligent conversational AI brain.

Bypassing bulky third-party cloud apps, J.A.R.V.I.S. connects directly to your TP-Link hardware over your local Wi-Fi network using the **`python-kasa`** industrial engine (powering both modern Tapo KLAP/AES encryption and legacy Kasa UDP protocols).

```
                                      +------------------------------------+
                                      |     Glassmorphic HUD (Port 8000)   |
                                      |  (Real-Time WebSockets & Telemetry)|
                                      +-----------------+------------------+
                                                        |
                                                        v
+-----------------------+                    +----------+----------+
|  Microphone & Voice   |                    |   FastAPI Async Hub |
| (sounddevice + whisper)------------------->|  (server.py)        |
+-----------------------+                    +----------+----------+
                                                        |
                                +-----------------------+-----------------------+
                                |                                               |
                                v                                               v
                     +----------+----------+                         +----------+----------+
                     |  J.A.R.V.I.S. Brain |                         | Smart Device Engine |
                     |  (chatbot.py)       |                         | (kasa_controller.py)|
                     |  - Groq / Gemini    |                         | - Tapo KLAP (AES)   |
                     |  - Urdu / English   |                         | - Kasa UDP          |
                     |  - Intent Extractor |                         | - Energy Telemetry  |
                     +---------------------+                         +----------+----------+
                                                                                |
                                                  +-----------------------------+-----------------------------+
                                                  |                                                           |
                                                  v                                                           v
                                     +------------+------------+                                 +------------+------------+
                                     |   TP-Link Tapo P110     |                                 |   TP-Link Tapo L530E    |
                                     | (Energy Monitor Plug)   |                                 |   (Smart RGB Light Bulb)|
                                     +-------------------------+                                 +-------------------------+
```

---

## 🔌 Supported Hardware

| Hardware | Protocol | Features Supported |
| :--- | :--- | :--- |
| **TP-Link Tapo P110** *(Recommended)* | KLAP / AES (Local LAN) | Wireless Power ON/OFF, Live Watts, Volts, Amps, Cumulative Daily kWh |
| **TP-Link Tapo P100** | KLAP / AES (Local LAN) | Wireless Power ON/OFF, State Polling |
| **TP-Link Tapo L530E / L510E** | KLAP / AES (Local LAN) | Power ON/OFF, Smooth Brightness Dimming (0–100%), HSV Color Control |
| **TP-Link Kasa KP115 / KP105** | Kasa Local UDP (Port 9999) | High-speed local switching, Power Telemetry |
| **Verified Virtual Simulation** | In-Memory Async Loop | Automatic zero-crash fallback with simulated physical load if hardware is offline |

---

## 🗣️ Bilingual Voice & Natural Language Commands

J.A.R.V.I.S. understands natural phrasing across both **English** and **Urdu (including Roman Urdu and Urdu Script)**:

| Intent | English Examples | Urdu / Roman Urdu Examples | Action |
| :--- | :--- | :--- | :--- |
| **Voice ON (Wake Word)** | *"Hey Jarvis"*, *"Wake up"*, *"Voice on"* | *"Suno Jarvis"*, *"Utho Jarvis"*, *"Awaz on karo"*, *"جاگو"* | Wakes J.A.R.V.I.S. from standby and activates continuous microphone listening |
| **Voice OFF (Standby)** | *"Voice off"*, *"Go to sleep"*, *"Stop listening"* | *"Awaz band karo"*, *"So jao"*, *"Sunna band karo"*, *"آواز بند کرو"* | Disengages voice recognition into low-overhead passive wake-word standby |
| **Immediate Speech Stop** | *"Stop"*, *"Quiet"*, *"Shut up"*, *"Silence"* | *"Ruko"*, *"Chup"*, *"Ruk jao"*, *"Bas karo"*, *"روکو"* | Instantly terminates active speech output mid-sentence |
| **Tactical Deck Transition** | *"Let's start"*, *"Let's begin"* | *"Shuru karen"*, *"Haan bhi"*, *"Chalo shuru"*, *"شروع کریں"* | Transitions smoothly from Arc Reactor logo to Chat & Hardware Deck |
| **Return to Arc Reactor** | *"Standdown"*, *"Stand down"*, *"Return to arc"* | *"Wapas jao"*, *"Piche hato"*, *"واپس جاؤ"* | Returns interface to the pulsing Arc Reactor neural centerpiece |
| **Language Toggle** | *"Switch to Urdu"*, *"Switch to English"* | *"Urdu mode"*, *"English mode"*, *"اردو"* | Switches browser speech recognition model between `ur-PK` and `en-US` |
| **Power On** | *"Turn on the desk lamp"*, *"Power on"*, *"It's too dark in here"* | *"Batti jala do"*, *"Bohat andhera hai"*, *"Chala do"*, *"بتی جلا دو"* | Dispatches wireless `turn_on()` to smart plug / bulb |
| **Power Off** | *"Turn off the plug"*, *"Shut down lights"*, *"Cut the power"* | *"Batti bujha do"*, *"Batti band kardo"*, *"Off kardo"*, *"بتی بند کرو"* | Dispatches wireless `turn_off()` to smart plug / bulb |
| **Energy Telemetry** | *"How much power is it drawing?"*, *"What's the current wattage?"* | *"Kitni bijli use ho rahi hai?"*, *"Kitne watts consume ho rahe hain?"*, *"کتنی بجلی"* | Queries `Module.Energy` and reports Watts & kWh |
| **Dimming / Brightness** | *"Dim the light to 30 percent"*, *"Set brightness to 80%"* | *"Roshni kam kardo 40 percent"* | Adjusts bulb brightness level (1–100) |
| **General Conversational**| *"Who are you?"*, *"Tell me a joke"*, *"System status"* | *"Kya haal hai Jarvis?"*, *"Shukriya"* | Routes to Groq (Llama 3.3 70B) or Gemini with British wit |

---

## 🛠️ Step-by-Step Hardware Setup (When Unboxing Your Tapo Plug)

1. **Initial Pairing**: Plug your Tapo P110/P100 into a wall socket. Open the official **Tapo App** on your smartphone and connect the plug to your home 2.4 GHz Wi-Fi network.
2. **Enable Local Network Control**:
   - In the Tapo App, navigate to **Me > Third-Party Services**.
   - Toggle ON **"Third-Party Compatibility"** (TP-Link provides this setting to unlock the encrypted local KLAP port).
3. **Assign Static IP**: In your home router's admin portal (usually `192.168.1.1`), assign a static DHCP reservation for the plug (e.g. `192.168.1.100`) so J.A.R.V.I.S. can reach it instantly without network scans.
4. **Configure `.env`**:
   Copy `.env.example` to `.env` and fill in your Tapo credentials:
   ```ini
   DEVICE_IP=192.168.1.100
   DEVICE_USERNAME=your_tapo_email@domain.com
   DEVICE_PASSWORD=your_tapo_password
   GROQ_API_KEY=gsk_your_groq_key_here
   ```

---

## 🚀 Quickstart Guide

### Option A: One-Click Launch (Windows)
Double-click `start.bat`. It will automatically:
1. Detect Python 3.10+.
2. Create `.venv` virtual environment if not present.
3. Install all dependencies from `requirements.txt`.
4. Launch the FastAPI server with live WebSockets at `http://127.0.0.1:8000`.

### Option B: Manual Command Line (Local LAN)
```bash
# Clone the repository
git clone https://github.com/AreebIqbal6/JARVIS-AI-PROJECT.git
cd JARVIS-AI-PROJECT

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Start the system
python run.py
```

Open your browser to: **`http://127.0.0.1:8000`**

---

## 🌐 Deploy Live to Vercel

You can make J.A.R.V.I.S. live on the web and access it from your phone, laptop, or anywhere globally:

1. **Push to GitHub**: Make sure your repository is pushed to your GitHub account (`https://github.com/AreebIqbal6/JARVIS-AI-PROJECT`).
2. **Import into Vercel**:
   - Go to [vercel.com](https://vercel.com) and log in.
   - Click **"Add New" > "Project"** and select `JARVIS-AI-PROJECT`.
   - Vercel automatically detects the included `vercel.json` and Python Serverless runtime (`api/index.py`).
3. **Set Environment Variables**:
   In the Vercel deployment settings, add:
   - `GROQ_API_KEY`: Your Groq API key (`gsk_...`)
   - `DEVICE_IP` (optional): IP of your smart device
   - `DEVICE_USERNAME` (optional): Tapo account email
   - `DEVICE_PASSWORD` (optional): Tapo account password
4. **Deploy**: Click **Deploy**. Your custom J.A.R.V.I.S. HUD will be live at `https://your-project.vercel.app`!

### 📡 How Smart Plug Control Works Over the Web:
- **Local Mode (Direct LAN on Wi-Fi):** When running locally at home (`http://127.0.0.1:8000`), J.A.R.V.I.S. communicates directly with your plug over your home Wi-Fi via UDP/KLAP encryption with instant 0-latency control.
- **Vercel Cloud Mode:** When visiting your live Vercel URL, the AI Chatbot, bilingual voice recognition, speech synthesis, and HUD operate worldwide. Because smart plugs reside on private home IP addresses (`192.168.1.x`), controlling your home plug from outside your house simply requires running a free secure tunnel on your home PC (e.g. `ngrok http 8000`) or using J.A.R.V.I.S. when connected to your home Wi-Fi.

---

## 🎙️ Voice Control (Browser & Desktop)

J.A.R.V.I.S. includes a dual-engine voice pipeline:
1. **Universal Browser Web Speech**: Click the `[🎙️ VOICE: STANDBY]` button in the HUD. Any modern browser (Chrome, Edge, Safari, Android) will capture your voice directly with 0 CPU overhead, transcribe it, and speak back using high-fidelity speech synthesis.
2. **Dedicated Background Desktop Listener (Optional)**:
   Install the optional desktop audio packages:
   ```bash
   pip install -r requirements-voice.txt
   python voice_agent.py
   ```
   *Continuously records via `sounddevice` and transcribes on background CPU threads via quantized `faster-whisper`.*

---

## 🧪 Running the Verification Test Battery

```bash
python run_tests.py
```
This tests:
1. **Device Lifecycle**: On, Off, Toggle, Energy Telemetry Query, Dimming, and Subnet Scanning.
2. **Bilingual Intent Engine**: English & Urdu phrases, entity extraction (percentages), and LLM conversational routing.

---

## 📂 Project Structure

```
├── kasa_controller.py      # Core TP-Link Kasa & Tapo async controller (KLAP & UDP)
├── chatbot.py              # Bilingual conversational intent engine (Groq/Gemini/Fallback)
├── voice_agent.py          # Asynchronous hands-free voice listener (sounddevice + faster-whisper)
├── server.py               # FastAPI backend with WebSockets & static file streaming
├── run.py                  # Server entrypoint with auto-discovery & banner
├── run_tests.py            # Automated end-to-end test battery
├── start.bat               # Windows one-click runner
├── requirements.txt        # Production dependencies
├── .env.example            # Environment configuration template
├── tests/
│   ├── test_kasa_plug.py   # Unit test for hardware lifecycle & energy telemetry
│   └── test_chat_intents.py# Unit test for bilingual intents & conversation
└── frontend/
    ├── index.html          # Cyberpunk glassmorphic HUD
    ├── style.css           # Neon glassmorphism, responsive meters, glowing toggle
    └── app.js              # Real-time WebSocket listener, chart renderer & chat UI
```

---

## 🛡️ License

MIT License. Designed with precision for autonomous home intelligence.
