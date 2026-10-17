"""
J.A.R.V.I.S. Asynchronous Voice Control Pipeline
Non-blocking audio recording via sounddevice, speech-to-text via faster-whisper/Groq,
and local wireless smart plug/bulb execution via python-kasa.
"""

import asyncio
import os
import logging
import numpy as np
from typing import Optional
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VoiceAgent")
load_dotenv()

class VoiceControlEngine:
    def __init__(self, chatbot, sample_rate: int = 16000, chunk_duration_sec: int = 3):
        self.chatbot = chatbot
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration_sec
        self.is_listening = False
        self._whisper_model = None
        self._tts_engine = None
        self._init_audio_models()

    def _init_audio_models(self):
        """Initializes Whisper STT and TTS engine."""
        # 1. Faster-Whisper local model
        try:
            from faster_whisper import WhisperModel
            logger.info("Loading faster-whisper (small.en) with int8 CPU quantization...")
            self._whisper_model = WhisperModel("small.en", device="cpu", compute_type="int8")
            logger.info("Faster-Whisper neural model armed.")
        except Exception as e:
            logger.info(f"Local faster-whisper not available ({e}). Will use Groq Whisper or cloud fallback.")

        # 2. Offline TTS engine (pyttsx3)
        try:
            import pyttsx3
            self._tts_engine = pyttsx3.init()
            self._tts_engine.setProperty("rate", 185)  # Crisper British cadence
            voices = self._tts_engine.getProperty("voices")
            for voice in voices:
                if "david" in voice.name.lower() or "george" in voice.name.lower() or "english" in voice.name.lower():
                    self._tts_engine.setProperty("voice", voice.id)
                    break
        except Exception as e:
            logger.info(f"pyttsx3 TTS offline ({e}).")

    def speak(self, text: str):
        """Speaks out loud to the operator."""
        import re
        clean_text = text.replace("◈", "").replace("*", "").strip()
        print(f"\n>> [J.A.R.V.I.S.]: {clean_text}")
        spoken_text = re.sub(r'J\.A\.R\.V\.I\.S\.?', 'Jarvis', clean_text, flags=re.IGNORECASE)
        if self._tts_engine:
            try:
                self._tts_engine.say(spoken_text)
                self._tts_engine.runAndWait()
            except Exception as e:
                logger.debug(f"TTS audio playback note: {e}")

    def record_audio_chunk(self) -> Optional[np.ndarray]:
        """Synchronously records audio from microphone directly into RAM (Thread worker)."""
        try:
            import sounddevice as sd
            audio = sd.rec(
                int(self.chunk_duration * self.sample_rate),
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
            )
            sd.wait()
            return np.squeeze(audio)
        except Exception as e:
            logger.debug(f"Microphone recording stream check: {e}")
            return None

    def transcribe_audio_chunk(self, audio_data: np.ndarray) -> str:
        """Synchronously processes speech-to-text inference (Thread worker)."""
        if audio_data is None or len(audio_data) == 0:
            return ""

        # Check silence threshold
        energy = np.mean(np.abs(audio_data))
        if energy < 0.015:  # Ambient room noise floor
            return ""

        # Option A: Local Faster-Whisper
        if self._whisper_model:
            try:
                segments, _ = self._whisper_model.transcribe(audio_data, language="en", beam_size=1)
                text = " ".join([seg.text for seg in segments]).strip()
                return text
            except Exception as e:
                logger.warning(f"Faster-Whisper error: {e}")

        # Option B: Groq Whisper Cloud API
        groq_key = os.getenv("GROQ_API_KEY") or os.getenv("GroqAPIKey")
        if groq_key:
            try:
                import io
                import scipy.io.wavfile as wav
                from groq import Groq
                buf = io.BytesIO()
                # Scale float32 to int16 for WAV format
                scaled = (audio_data * 32767).astype(np.int16)
                wav.write(buf, self.sample_rate, scaled)
                buf.seek(0)
                buf.name = "audio.wav"

                client = Groq(api_key=groq_key)
                transcription = client.audio.transcriptions.create(
                    file=buf,
                    model="whisper-large-v3",
                    prompt="JARVIS, smart plug, lights, turn on, turn off, bohat andhera hai",
                )
                return transcription.text.strip()
            except Exception as e:
                logger.debug(f"Cloud STT fallback note: {e}")

        return ""

    async def run_voice_loop(self):
        """
        Continuous non-blocking asynchronous audio loop.
        Wraps synchronous I/O and ML inference in asyncio.to_thread() to preserve FastAPI throughput.
        """
        self.is_listening = True
        logger.info("Voice assistant loop active. Listening for smart plug commands & speech...")
        self.speak("Voice telemetry online, Sir. Listening for your command.")

        while self.is_listening:
            try:
                # 1. Offload hardware microphone capture to a background worker thread
                audio_data = await asyncio.to_thread(self.record_audio_chunk)

                # 2. Offload ML speech recognition inference to a background worker thread
                command = await asyncio.to_thread(self.transcribe_audio_chunk, audio_data)

                if command:
                    logger.info(f"[Voice Recognized]: '{command}'")
                    # 3. Execute chat intent & hardware trigger on the main async event loop
                    res = await self.chatbot.chat(command)
                    reply = res["response"]
                    # 4. Announce response out loud
                    await asyncio.to_thread(self.speak, reply)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in voice loop cycle: {e}")
                await asyncio.sleep(1.0)

    def stop(self):
        """Stops the voice loop."""
        self.is_listening = False
        logger.info("Voice assistant loop stopped.")
