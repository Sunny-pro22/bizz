// routes/voice.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // <-- added auth middleware

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in .env file');
}
console.log(`[voice] Using Gemini model: ${GEMINI_MODEL}`);

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* ---------- Helper Functions ---------- */
async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function extractTextFromResponseJson(data) {
  try {
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to extract and repair JSON from Gemini's response.
 * Steps:
 * 1. Remove markdown fences.
 * 2. Find the first '{' and last '}'. If no closing brace, append one.
 * 3. If the string ends with an unclosed string (e.g., "product":"sugar), add a closing quote and brace.
 */
function extractAndRepairJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // Remove markdown fences
  let cleaned = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  // Find the first '{'
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) return null;

  // Extract from first brace to end
  let jsonCandidate = cleaned.substring(firstBrace).trim();

  let openBraces = 0;
  let inString = false;
  let escape = false;
  let lastValidIndex = -1;

  for (let i = 0; i < jsonCandidate.length; i++) {
    const ch = jsonCandidate[i];
    if (!inString) {
      if (ch === '{') openBraces++;
      else if (ch === '}') openBraces--;
      else if (ch === '"') inString = true;
    } else {
      if (ch === '\\') {
        escape = !escape;
      } else if (ch === '"' && !escape) {
        inString = false;
        escape = false;
      } else {
        escape = false;
      }
    }
    if (openBraces === 0 && i < jsonCandidate.length - 1) {
      // We have a complete JSON object early? That's odd, but keep going
    }
    if (openBraces >= 0) {
      lastValidIndex = i;
    }
  }

  if (openBraces > 0) {
    jsonCandidate = jsonCandidate.substring(0, lastValidIndex + 1);
    // Add missing closing braces
    jsonCandidate += '}'.repeat(openBraces);
  }

  // If we ended in the middle of a string, close it
  if (inString) {
    jsonCandidate += '"';
    // Then close any open braces (though this might double-count, but safe)
    if (openBraces > 0) jsonCandidate += '}'.repeat(openBraces);
  }

  // Now attempt to fix common JSON errors (unquoted keys, trailing commas)
  try {
    // Replace single quotes with double quotes
    jsonCandidate = jsonCandidate.replace(/'/g, '"');
    // Add quotes to unquoted keys
    jsonCandidate = jsonCandidate.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    // Remove trailing commas
    jsonCandidate = jsonCandidate.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return JSON.parse(jsonCandidate);
  } catch (e) {
    // Still invalid
    return null;
  }
}

/* ---------- Main Route (Protected) ---------- */
router.post('/', auth, async (req, res) => {  // <-- added auth middleware
  const { text } = req.body;
  console.log('[voice] Received:', text);

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'No text provided' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key is missing. Please set GEMINI_API_KEY in .env' });
  }

  // SHORT, CRISP PROMPT with essential examples only
  const prompt = `
Parse the user's inventory command. Return ONLY JSON with keys: action (add/sell), product (string), quantity (number), price (number or null).

Examples:
"add 5 kg rice" → {"action":"add","product":"rice","quantity":5,"price":null}
"sell 2 dozen eggs for ₹300" → {"action":"sell","product":"eggs","quantity":24,"price":300}
"add 1 biscuit of 5 rs" → {"action":"add","product":"biscuit","quantity":1,"price":5}
"2 kg sugar 200" → {"action":"add","product":"sugar","quantity":2,"price":200}

Now parse: "${text}"
`.trim();

  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.0, maxOutputTokens: 300 } // increased
    };

    const response = await fetchWithTimeout(
      `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      20000
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[voice] Gemini API error:', response.status, data);
      let errorMessage = 'Gemini API error';
      if (data.error) {
        errorMessage = data.error.message || JSON.stringify(data.error);
      }
      return res.status(502).json({ error: `Gemini API error: ${errorMessage}` });
    }

    const rawModelText = extractTextFromResponseJson(data);
    if (!rawModelText) {
      return res.status(502).json({ error: 'Gemini returned empty response' });
    }

    console.log('[voice] Raw Gemini response:', rawModelText);

    // Extract and repair JSON
    const parsed = extractAndRepairJson(rawModelText);

    if (!parsed) {
      console.error('[voice] Failed to parse/repair JSON. Raw:', rawModelText);
      return res.status(422).json({ error: 'Invalid JSON from Gemini', raw: rawModelText });
    }

    // Validate required fields
    if (!parsed.action || !['add', 'sell'].includes(parsed.action)) {
      return res.status(422).json({ error: 'Missing or invalid action', parsed });
    }
    if (!parsed.product || typeof parsed.product !== 'string') {
      return res.status(422).json({ error: 'Missing or invalid product', parsed });
    }
    if (typeof parsed.quantity !== 'number' || parsed.quantity <= 0) {
      return res.status(422).json({ error: 'Missing or invalid quantity', parsed });
    }
    if (parsed.price !== null && typeof parsed.price !== 'number') {
      return res.status(422).json({ error: 'Price must be a number or null', parsed });
    }

    parsed._source = 'gemini';
    console.log('[voice] Parsed:', parsed);
    return res.json(parsed);

  } catch (err) {
    console.error('[voice] Unexpected error:', err);
    return res.status(500).json({ error: 'Failed to parse command', details: err.message });
  }
});

module.exports = router;