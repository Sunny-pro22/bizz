// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const transactionRoutes = require('./routes/transaction');
const profileRoutes = require('./routes/profile');
const voiceRoutes = require('./routes/voice');

const app = express();

app.use(cors());
app.use(express.json());

// connect to MongoDB
const mongoUri = process.env.MONGODB_URI || process.env.ATLAS_URL;
if (!mongoUri) {
  console.error('Error: MONGODB_URI (or ATLAS_URL) is not set in .env');
  process.exit(1);
}


mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/voice', voiceRoutes);

// generic error handler (last middleware)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

