// backend/routes/voice.js
require('dotenv').config();
const express = require('express');
const router = express.Router();

// Use global fetch on Node 18+, otherwise undici
let fetchFn = null;
if (typeof fetch === 'function') {
  fetchFn = fetch.bind(globalThis);
} else {
  try {
    fetchFn = require('undici').fetch;
  } catch (e) {
    fetchFn = null;
  }
}

const auth = require('../middleware/authMiddleware');
const Product = require('../product');
const Transaction = require('../transaction');
const Profile = require('../profile');

router.use(auth);

// Helper to read userId from different auth shapes
function getUserIdFromReq(req) {
  return req.user?.id || req.userId || req.user?._id || null;
}

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId, totalSales: 0, totalExpenses: 0, totalProfit: 0 });
    await profile.save();
  }
  return profile;
}

/* ---------------------------
   Local fallback parser (Hinglish-friendly)
   Input: raw text string
   Output: { action, product, quantity, price }
   --------------------------- */
function fallbackParseText(text) {
  const lower = String(text).toLowerCase();

  // Determine action
  let action = null;
  if (/\b(sell|bech|becho|bech do|bechna|sale)\b/.test(lower)) action = 'sell';
  if (/\b(add|add karo|add kar|purchase|buy|kharid|kharido)\b/.test(lower)) action = 'add';
  // prefer explicit sell if both found
  if (!action) {
    // fallback: if sentence starts with 'add' or 'sell'
    if (lower.trim().startsWith('add')) action = 'add';
    if (lower.trim().startsWith('sell') || lower.trim().startsWith('bech')) action = 'sell';
  }
  if (!action) action = 'add'; // default safe choice

  // Extract price: look for formats like "₹200", "200 rupees", "to 100", "for 100"
  let price = null;
  // ₹ or rs or rupees
  const pricePatterns = [
    /₹\s*([0-9]+(?:\.[0-9]+)?)/,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:rupees|rs|rs\.|rupaye|rupaye|rupee)/,
    /(?:to|at|for)\s+([0-9]+(?:\.[0-9]+)?)/,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:₹)/
  ];
  for (const p of pricePatterns) {
    const m = lower.match(p);
    if (m) {
      price = Number(m[1]);
      if (!Number.isNaN(price)) break;
      price = null;
    }
  }

  // Extract quantity: numbers + unit (kg/kilo/gram/g/pcs/pieces/dozen)
  let quantity = null;
  // patterns: "2 kg", "one kg", "1kg", "2 kilos", "dozen", "3 pcs"
  // first try numeric
  const qtyNumMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|kilo|kilos|kilogram|kilograms|g|gram|grams|pcs|pieces|piece|dozen|ltr|litre|litres)?/);
  if (qtyNumMatch) {
    let qtyVal = Number(qtyNumMatch[1]);
    const unit = qtyNumMatch[2];
    if (!Number.isNaN(qtyVal)) {
      // normalize dozen => 12
      if (unit && /\bdozen\b/.test(unit)) qtyVal = qtyVal * 12;
      quantity = qtyVal;
    }
  } else {
    // try word numbers (one, two, three)
    const wordNums = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };
    const wordMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s*(kg|kilo|kilos|gram|g|pcs|pieces|dozen)?/);
    if (wordMatch) {
      quantity = wordNums[wordMatch[1]] || 1;
      if (wordMatch[2] && /\bdozen\b/.test(wordMatch[2])) quantity = quantity * 12;
    }
  }
  if (!quantity) quantity = 1; // default 1 to be forgiving

  // Extract product name: remove detected tokens
  // Remove numbers, price tokens, action words, units, filler words
  let product = lower;
  product = product.replace(/\d+(\.\d+)?/g, '');
  product = product.replace(/₹/g, '');
  product = product.replace(/\b(rupees|rs|rs\.|rupaye|rupee|at|for|to|per|each|me|in|ka|ki|ke)\b/g, '');
  product = product.replace(/\b(add|add karo|add kar|purchase|buy|kharid|kharido|sell|bech|becho|bech do|bechna|sale)\b/g, '');
  product = product.replace(/\b(kg|kilo|kilos|kilogram|kilograms|g|gram|grams|pcs|pieces|piece|dozen|ltr|litre|litres)\b/g, '');
  product = product.replace(/[^\w\s-]/g, ' ');
  product = product.replace(/\s+/g, ' ').trim();

  // Remove trailing 'of', 'the' etc.
  product = product.replace(/\b(of|the|a|an)\b/g, '').trim();
  // If multiple words, pick the most likely 1-3 words
  const words = product.split(' ').filter(Boolean);
  const productName = words.slice(0, 3).join(' ').trim() || null;

  return {
    action,
    product: productName,
    quantity: Number(quantity),
    price: price === null ? null : Number(price)
  };
}

/* ---------------------------
   POST /api/voice  (parse)
   --------------------------- */
router.post('/', async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    console.log('[/api/voice] userId:', userId);
    console.log('[/api/voice] body:', JSON.stringify(req.body));

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const prompt = `
You are an inventory assistant. Parse the user's command into a JSON object.

RULES:
- Understand Hinglish (mixed Hindi & English).
- action must be exactly "add" or "sell" (lowercase).
- product is the item name (string).
- quantity is a positive number.
- price is a number if mentioned, otherwise null.
- If the command is ambiguous, choose the most likely interpretation and fill missing fields with null.
- Output ONLY the JSON object. No explanations, no extra text.

User: "${text}"
Output:
`.trim();

    // Try Gemini if key present
    if (GEMINI_API_KEY && fetchFn) {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 400 }
      };

      console.log('[/api/voice] sending to Gemini...');
      const response = await fetchFn(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const rawText = await response.text();
      console.log('[/api/voice] Gemini raw response:', rawText.slice(0, 2000));

      if (!response.ok) {
        console.warn('[/api/voice] Gemini HTTP error', response.status);
        // Fall back to local parser on HTTP error
        const fallback = fallbackParseText(text);
        return res.json({ source: 'fallback', ...fallback });
      }

      // Attempt to extract candidate text
      let modelText = null;
      try {
        const wrapper = JSON.parse(rawText);
        modelText = wrapper?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (e) {
        // rawText not JSON
      }

      // If candidate text present, try to extract JSON block
      let parsedOutput = null;
      if (modelText && typeof modelText === 'string') {
        // Remove common code fences
        const withoutFences = modelText.replace(/```(?:json)?\s*/i, '').replace(/```/g, '').trim();
        // Extract the first {...} block
        const jsonMatch = withoutFences.match(/{[\s\S]*}/);
        if (jsonMatch) {
          try {
            parsedOutput = JSON.parse(jsonMatch[0]);
          } catch (e) {
            // JSON invalid/truncated; ignore and fall back
            parsedOutput = null;
          }
        } else {
          // Maybe modelText is like '"action": "add",' or truncated; fallback
          parsedOutput = null;
        }
      }

      // If parsedOutput incomplete or missing required fields, fall back to local parser
      const needFallback = !parsedOutput ||
        !parsedOutput.action ||
        !parsedOutput.product ||
        parsedOutput.quantity === undefined ||
        parsedOutput.price === undefined;

      if (parsedOutput && !needFallback) {
        // normalize
        if (parsedOutput.action && typeof parsedOutput.action === 'string') {
          parsedOutput.action = parsedOutput.action.toLowerCase();
        }
        parsedOutput.quantity = Number(parsedOutput.quantity);
        parsedOutput.price = parsedOutput.price === null ? null : Number(parsedOutput.price);
        console.log('[/api/voice] parsed output from Gemini:', parsedOutput);
        return res.json({ source: 'gemini', ...parsedOutput });
      }

      // Fall back: use local parser based on original text (safer with truncated responses)
      console.warn('[/api/voice] Gemini returned incomplete parsed output — using fallback parser');
      const fallback = fallbackParseText(text);
      return res.json({ source: 'fallback', ...fallback });
    }

    // No Gemini key or fetch unavailable -> fallback
    const fallback = fallbackParseText(text);
    return res.json({ source: 'fallback', ...fallback });

  } catch (err) {
    console.error('[/api/voice] uncaught error:', err);
    return res.status(500).json({ error: 'Server parsing error', details: String(err?.message || err) });
  }
});

/* ---------------------------
   POST /api/voice/add
   --------------------------- */
router.post('/add', async (req, res) => {
  try {
    console.log('[/api/voice/add] req.body:', JSON.stringify(req.body));
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized: missing user id' });

    let { product, quantity, price } = req.body;

    // Allow client to pass 'name' instead of 'product'
    if (!product && req.body.name) product = req.body.name;

    if (!product || typeof product !== 'string') {
      return res.status(400).json({ error: 'Product name is required (product)' });
    }
    product = product.trim();

    quantity = Number(quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required (positive number)' });
    }

    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Valid price is required (provide price)' });
    }
    price = Number(price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    // Case-insensitive find
    let productDoc = await Product.findOne({ userId, name: new RegExp('^' + product + '$', 'i') });

    if (productDoc) {
      productDoc.quantity = Number(productDoc.quantity || 0) + quantity;
      productDoc.price = price;
      await productDoc.save();
    } else {
      productDoc = new Product({
        userId,
        name: product,
        quantity,
        price,
        cost: price
      });
      await productDoc.save();
    }

    const transaction = new Transaction({
      userId,
      type: 'add',
      productName: product,
      quantity,
      price,
      total: price * quantity
    });
    await transaction.save();

    const profile = await getProfile(userId);
    const cost = Number(productDoc.cost || price || 0);
    profile.totalExpenses = Number(profile.totalExpenses || 0) + cost * quantity;
    profile.totalProfit = Number(profile.totalSales || 0) - profile.totalExpenses;
    await profile.save();

    return res.status(201).json({ message: 'Inventory added successfully', product: productDoc, transaction });
  } catch (err) {
    console.error('[/api/voice/add] uncaught error:', err);
    return res.status(500).json({ error: 'Server error while adding inventory', details: String(err?.message || err) });
  }
});

/* ---------------------------
   POST /api/voice/sell
   --------------------------- */
router.post('/sell', async (req, res) => {
  try {
    console.log('[/api/voice/sell] req.body:', JSON.stringify(req.body));
    const userId = getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized: missing user id' });

    let { product, quantity, price } = req.body;
    if (!product && req.body.name) product = req.body.name;

    if (!product || typeof product !== 'string') {
      return res.status(400).json({ error: 'Product name is required (product)' });
    }
    product = product.trim();

    quantity = Number(quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required (positive number)' });
    }

    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Valid selling price is required' });
    }
    price = Number(price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const productDoc = await Product.findOne({ userId, name: new RegExp('^' + product + '$', 'i') });
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });
    if (productDoc.quantity < quantity) return res.status(400).json({ error: 'Insufficient quantity' });

    productDoc.quantity = Number(productDoc.quantity) - quantity;
    await productDoc.save();

    const transaction = new Transaction({
      userId,
      type: 'sell',
      productName: product,
      quantity,
      price,
      total: price * quantity
    });
    await transaction.save();

    const profile = await getProfile(userId);
    profile.totalSales = Number(profile.totalSales || 0) + price * quantity;
    profile.totalExpenses = Number(profile.totalExpenses || 0) + (Number(productDoc.cost || 0) * quantity);
    profile.totalProfit = profile.totalSales - profile.totalExpenses;
    await profile.save();

    return res.json({ message: 'Sale recorded successfully', product: productDoc, transaction });
  } catch (err) {
    console.error('[/api/voice/sell] uncaught error:', err);
    return res.status(500).json({ error: 'Server error while processing sale', details: String(err?.message || err) });
  }
});

module.exports = router;
