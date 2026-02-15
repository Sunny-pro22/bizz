const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },   // selling price
  cost: { type: Number, required: true },    // cost price
});

// 🔁 Compound unique index: one product per user with the same name
// (case‑sensitive by default – "Oil" and "oil" are different)
productSchema.index({ userId: 1, name: 1 }, { unique: true });

// If you want case‑insensitive uniqueness (treat "Oil" and "oil" as same), use collation:
// productSchema.index(
//   { userId: 1, name: 1 },
//   { unique: true, collation: { locale: 'en', strength: 2 } }
// );

module.exports = mongoose.model('Product', productSchema);