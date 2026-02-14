const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Profile = require('../profile');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    let profile = await Profile.findOne({ userId: req.userId });
    if (!profile) profile = new Profile({ userId: req.userId }); // create empty profile
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;