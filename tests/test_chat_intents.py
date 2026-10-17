import asyncio
from kasa_controller import SmartDeviceController
from chatbot import JarvisChatbot

async def test_bilingual_smart_plug_intents():
    device = SmartDeviceController(ip="192.168.1.100")
    bot = JarvisChatbot(device)

    # 1. Turn ON via English
    res1 = await bot.chat("Please turn on the smart plug.")
    assert res1["action"] == "turn_on"
    assert "smart plug" in res1["response"].lower() or "light" in res1["response"].lower() or "power" in res1["response"].lower()

    # 2. Turn OFF via English
    res2 = await bot.chat("Turn off the plug now.")
    assert res2["action"] == "turn_off"
    assert "off" in res2["response"].lower() or "power" in res2["response"].lower() or "plug" in res2["response"].lower()

    # 3. Turn ON via Urdu ("bohat andhera hai")
    res3 = await bot.chat("Jarvis yahan bohat andhera hai")
    assert res3["action"] == "turn_on"

    # 4. Turn OFF via Urdu ("batti band kardo")
    res4 = await bot.chat("Batti band kardo please")
    assert res4["action"] == "turn_off"

    # 5. Energy Telemetry Query (reports true telemetry or honest offline notice)
    res5 = await bot.chat("How much power is the plug drawing in watts?")
    assert res5["action"] == "energy_telemetry"
    assert "telemetry" in res5["response"].lower() or "watts" in res5["response"].lower()

    # 6. Urdu Energy Query
    res6 = await bot.chat("Kitni bijli use ho rahi hai?")
    assert res6["action"] == "energy_telemetry"

    # 7. Dimming
    res7 = await bot.chat("Dim the light to 30 percent")
    assert res7["action"] == "set_brightness"
    assert res7["intent_data"]["level"] == 30

    # 8. Urdu Script Turn ON ("بتی جلا دو")
    res8 = await bot.chat("براہ کرم بتی جلا دو")
    assert res8["action"] == "turn_on"

    # 9. Urdu Script Turn OFF ("بتی بند کرو")
    res9 = await bot.chat("بتی بند کرو")
    assert res9["action"] == "turn_off"

    # 10. General conversational inquiry
    res10 = await bot.chat("Who are you?")
    assert res10["action"] is None
    assert "j.a.r.v.i.s" in res10["response"].lower()
