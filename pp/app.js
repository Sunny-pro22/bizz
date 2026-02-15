// geminiTestNoThoughts.js
require("dotenv").config();

console.log("✅ App started...");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log("🔑 API KEY exists:", !!GEMINI_API_KEY);

const MODEL = "gemini-2.5-flash";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function run() {
  console.log("🚀 Calling Gemini...");
  const prompt = `
  what is the day today.
- Be concise: 2-4 short paragraphs.
- Do NOT provide any chain-of-thought, internal reasoning steps, or private "thoughts".
- Do NOT include any extra metadata or commentary.
- Output final answer only (plain text).
  `.trim();

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.0,       // deterministic
      maxOutputTokens: 1500, // give generous room for the final answer
      responseMimeType: "text/plain"
    }
  };

  try {
    const res = await fetch(`${URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    console.log("📡 HTTP Status:", res.status);

    const data = await res.json();
    console.log("📦 RAW RESPONSE (debug):", JSON.stringify(data, null, 2));

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data?.candidates?.[0]?.finishReason;
    console.log("\n🤖 GEMINI ANSWER (finishReason:", finishReason, "):\n");
    console.log(text || "<no text returned>");
    console.log("\n------------------------------------");

    // If still truncated, log a helpful message:
    if (finishReason === "MAX_TOKENS") {
      console.warn("\n⚠️ Model finished due to MAX_TOKENS. Consider increasing maxOutputTokens further.");
    }
  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

run();
