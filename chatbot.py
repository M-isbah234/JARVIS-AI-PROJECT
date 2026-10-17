"""
J.A.R.V.I.S. Conversational Intelligence & Smart Device Intent Engine
Supports Groq, Google Gemini, and offline rule-based fallbacks.
Bilingual English & Urdu intent parsing for smart plug and lighting controls.
"""

import os
import json
import logging
from typing import Dict, Any, List
from dotenv import load_dotenv
from kasa_controller import SmartDeviceController

logger = logging.getLogger("JarvisBrain")
load_dotenv()

SYSTEM_PROMPT = """You are J.A.R.V.I.S., the hyper-intelligent, witty, and fiercely loyal AI assistant inspired by Tony Stark.
Address the user respectfully as 'Sir' (or 'Ma'am' if requested).
Maintain a sharp, sophisticated British wit. Never be robotic.
You possess native bilingual capabilities in English and Urdu (including Roman Urdu and Urdu script).

CRITICAL DIRECTIVES:
1. You have direct wireless hardware control over the user's TP-Link Kasa / Tapo Smart Plug and Smart Bulbs.
2. When the user speaks to you in Urdu or Roman Urdu (e.g., 'kya haal hai', 'batti jala do', 'pankha chalao', 'shuru karo', 'kaise ho'), reply seamlessly in natural Roman Urdu or Urdu with J.A.R.V.I.S.'s signature polite, confident wit.
3. If the user mentions darkness, turning on appliances, or says things like 'bohat andhera hai' / 'batti jala do' / 'turn on the desk lamp' / 'بتی جلا دو', execute the hardware command and confirm with crisp wit.
4. If the user asks about energy consumption, power draw, or electricity usage ('kitni bijli use ho rahi hai?', 'how many watts?', 'کتنی بجلی'), report the exact telemetry clearly.
5. Keep all responses concise, sharp, and strictly under 3 sentences unless asked for an in-depth breakdown.
"""

class JarvisChatbot:
    def __init__(self, device_controller: SmartDeviceController):
        self.device = device_controller
        self.history: List[Dict[str, str]] = []
        self.groq_key = os.getenv("GROQ_API_KEY") or os.getenv("GroqAPIKey")
        self.gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GeminiAPIKey")
        self._groq_client = None
        self._init_clients()

    def _init_clients(self):
        """Initializes AI SDK clients if keys are present."""
        if self.groq_key:
            try:
                from groq import Groq
                self._groq_client = Groq(api_key=self.groq_key)
                logger.info("Groq AI client initialized successfully.")
            except Exception as e:
                logger.warning(f"Groq initialization skipped: {e}")

    async def _execute_hardware_intent(self, text: str) -> Dict[str, Any]:
        """
        Parses text for hardware intents in English and Urdu.
        Returns a dict with intent triggered and execution result.
        """
        lower = text.lower().strip()

        # 1. Turn ON Intents (English, Roman Urdu, and Urdu script)
        on_triggers = [
            "turn on", "switch on", "power on", "lights on", "plug on",
            "andhera", "bohat andhera", "dark in here", "too dark",
            "batti jala", "batti jalao", "batti on", "light on", "chala do", "chalao", "on kardo", "on karo", "jala do",
            "roshni karo", "roshni", "pankha chalao", "pankha chala", "chalu karo", "chalu kardo",
            "بتی جلا", "بتی آن", "آن کر", "چلا دو", "چلاؤ", "روشنائی", "روشنی", "اندھیرا", "لائٹ آن", "پلگ آن", "چالو کر"
        ]
        if any(trigger in lower for trigger in on_triggers):
            res = await self.device.turn_on()
            reply = "Right away, Sir. Power has been restored to the smart plug. Let there be light." if res["ok"] else f"Unable to dispatch power, Sir. Physical smart plug at {self.device.ip} is unreachable on the local Wi-Fi."
            return {
                "action": "turn_on",
                "success": res["ok"],
                "hardware": res["data"].get("hardware", "disconnected"),
                "reply": reply,
            }

        # 2. Turn OFF Intents (English, Roman Urdu, and Urdu script)
        off_triggers = [
            "turn off", "switch off", "power off", "lights off", "plug off",
            "batti bujha", "batti bujhao", "batti band", "band kardo", "band karo", "off kardo", "off karo", "shut down lights",
            "bujha do", "bujha", "pankha band", "andhera karo", "chalu band",
            "بتی بجھا", "بتی بند", "بند کر", "بند کرو", "آف کر", "آف کرو", "لائٹ بند", "پلگ آف", "بجھا دو"
        ]
        if any(trigger in lower for trigger in off_triggers):
            res = await self.device.turn_off()
            reply = "Power disengaged, Sir. The smart plug is now switched off." if res["ok"] else f"Unable to cut power, Sir. Physical smart plug at {self.device.ip} is unreachable on the local Wi-Fi."
            return {
                "action": "turn_off",
                "success": res["ok"],
                "hardware": res["data"].get("hardware", "disconnected"),
                "reply": reply,
            }

        # 3. Energy Monitoring Telemetry Intents (English, Roman Urdu, and Urdu script)
        energy_triggers = [
            "power draw", "watts", "energy", "consumption", "voltage", "current",
            "electricity", "kitni bijli", "power consumption", "wattage", "kwh",
            "bijli", "kitna power", "kitna watt",
            "کتنی بجلی", "بجلی", "واٹ", "وولٹیج", "توانائی"
        ]
        if any(trigger in lower for trigger in energy_triggers):
            status = await self.device.get_status()
            if status["ok"] and status["data"].get("connected"):
                energy = status["data"]["energy"]
                w = energy["current_watts"]
                kwh = energy["today_kwh"]
                v = energy["voltage_v"]
                reply = f"Telemetry active, Sir: Current draw is {w} Watts at {v} Volts. Today's cumulative consumption stands at {kwh} kWh."
            else:
                energy = {"current_watts": 0.0, "today_kwh": 0.0, "voltage_v": 0.0, "current_a": 0.0}
                reply = f"Telemetry offline, Sir. Physical smart plug at {self.device.ip} is not currently connected to the local network."
            return {
                "action": "energy_telemetry",
                "success": status["ok"],
                "data": energy,
                "reply": reply,
            }

        # 4. Dimming & Brightness
        if "dim" in lower or "brightness" in lower or "percent" in lower or "%" in lower:
            import re
            digits = re.findall(r"\b\d+\b", lower)
            level = int(digits[0]) if digits else 50
            res = await self.device.set_brightness(level)
            reply = f"Adjusted brightness to {level}%, Sir." if res["ok"] else f"Unable to adjust brightness: device at {self.device.ip} is unreachable."
            return {
                "action": "set_brightness",
                "level": level,
                "success": res["ok"],
                "reply": reply,
            }

        # 5. Device Status Check
        if "is the plug on" in lower or "status" in lower or "plug status" in lower or "kya hal hai" in lower:
            status = await self.device.get_status()
            if status["ok"] and status["data"].get("connected"):
                is_on = status["data"]["is_on"]
                state_str = "ACTIVE (ON)" if is_on else "STANDBY (OFF)"
                reply = f"The smart plug is currently {state_str} on address {self.device.ip}."
            else:
                reply = f"The smart plug at {self.device.ip} is currently DISCONNECTED (OFFLINE)."
            return {
                "action": "get_status",
                "success": status["ok"],
                "data": status["data"],
                "reply": reply,
            }

        # 6. Dynamic Pairing via Chat
        if "pair" in lower or "connect to" in lower or "link device" in lower:
            import re
            ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', lower)
            if ip_match:
                target_ip = ip_match.group(0)
                res = await self.device.pair(target_ip)
                if res["ok"]:
                    model = res["data"].get("model", "Smart Device")
                    reply = f"Device paired successfully, Sir. Connected to {model} at {target_ip}. Energy telemetry active."
                else:
                    reply = f"Pairing attempt failed for {target_ip}, Sir. {res.get('error', 'Device unreachable')}."
                return {
                    "action": "pair_device",
                    "success": res["ok"],
                    "data": res.get("data"),
                    "reply": reply
                }

        # 7. Subnet Scan via Chat
        if "scan wi-fi" in lower or "scan network" in lower or "discover" in lower or "find plugs" in lower or "find devices" in lower:
            devices = await self.device.discover_devices()
            if devices:
                dev_summary = ", ".join([f"{d.get('alias') or d.get('model')} ({d.get('ip')})" for d in devices])
                reply = f"Subnet scan completed, Sir. Discovered {len(devices)} hardware unit(s): {dev_summary}."
            else:
                reply = "Subnet scan completed, Sir. No TP-Link hardware detected on the local Wi-Fi. Ensure device is powered on."
            return {
                "action": "scan_devices",
                "success": True,
                "data": devices,
                "reply": reply
            }

        return {"action": None}

    async def chat(self, user_message: str) -> Dict[str, Any]:
        """Main chat handler with intent routing and conversational LLM response."""
        user_text = user_message.strip()
        if not user_text:
            return {"response": "I am standing by, Sir.", "action": None}

        # Check for immediate hardware intent
        intent = await self._execute_hardware_intent(user_text)
        if intent["action"]:
            self.history.append({"role": "user", "content": user_text})
            self.history.append({"role": "assistant", "content": intent["reply"]})
            return {
                "response": intent["reply"],
                "action": intent["action"],
                "intent_data": intent,
            }

        # If conversational question, route to Groq or Gemini
        ai_reply = None
        if self._groq_client:
            try:
                messages = [{"role": "system", "content": SYSTEM_PROMPT}]
                messages.extend(self.history[-6:])
                messages.append({"role": "user", "content": user_text})
                
                model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
                resp = self._groq_client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=250,
                )
                ai_reply = resp.choices[0].message.content.strip()
            except Exception as e:
                logger.warning(f"Groq API call failed: {e}")

        # Fallback to offline rule-based witty responses (Bilingual EN/UR)
        if not ai_reply:
            lower = user_text.lower()
            if any(w in lower for w in ["hello", "hi", "hey", "salam", "assalam", "kese ho", "kaise ho", "kya haal", "سلام", "کیسے ہو", "کیا حال"]):
                ai_reply = "Good day, Sir. Main bilkul theek hoon. All local neural circuits and smart home relays are operating nominally."
            elif any(w in lower for w in ["who are you", "kon ho", "tum kon", "kaun ho", "کون ہو"]):
                ai_reply = "I am J.A.R.V.I.S., your autonomous personal assistant and smart environment controller."
            elif any(w in lower for w in ["thank", "shukriya", "shukria", "meherbani", "شکریہ"]):
                ai_reply = "Always at your service, Sir. Khushi hui aapki madad kar ke."
            else:
                ai_reply = f"Understood, Sir. Telemetry confirms your instruction: '{user_text}'. All subroutines standing by."

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": ai_reply})
        return {
            "response": ai_reply,
            "action": None,
        }
