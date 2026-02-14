const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Product = require('../product');
const Transaction = require('../transaction');
const Profile = require('../profile');

// All routes require authentication
router.use(auth);

// Get all products for logged-in user
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ userId: req.userId });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add product (purchase)
router.post('/add', async (req, res) => {
  const { name, quantity, price } = req.body;
  const userId = req.userId;

  try {
    let product = await Product.findOne({ userId, name });

    if (product) {
      product.quantity += quantity;
      await product.save();
    } else {
      product = new Product({
        userId,
        name,
        quantity,
        price: price * 1.2, // selling price (20% markup)
        cost: price
      });
      await product.save();
    }

    const transaction = new Transaction({
      userId,
      type: 'add',
      productName: name,
      quantity,
      price,
      total: quantity * price
    });
    await transaction.save();

    // Update or create profile
    let profile = await Profile.findOne({ userId });
    if (!profile) {
      profile = new Profile({ userId });
    }
    profile.totalExpenses += quantity * price;
    profile.totalProfit = profile.totalSales - profile.totalExpenses;
    await profile.save();

    res.json({ message: 'Product added', product });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sell product
router.post('/sell', async (req, res) => {
  const { name, quantity } = req.body;
  const userId = req.userId;

  try {
    const product = await Product.findOne({ userId, name });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.quantity < quantity) return res.status(400).json({ error: 'Insufficient quantity' });

    product.quantity -= quantity;
    await product.save();

    const total = quantity * product.price;

    const transaction = new Transaction({
      userId,
      type: 'sell',
      productName: name,
      quantity,
      price: product.price,
      total
    });
    await transaction.save();

    let profile = await Profile.findOne({ userId });
    if (!profile) profile = new Profile({ userId });

    profile.totalSales += total;
    profile.totalProfit = profile.totalSales - profile.totalExpenses;
    await profile.save();

    res.json({ message: 'Product sold', product });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;