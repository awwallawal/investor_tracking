const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const bcrypt = require('bcryptjs');

// @route   GET api/users
// @desc    Get all active + invited + revoked users
// @access  Private (Director-General, Portal-Admin)
router.get('/', auth, authorize('Director-General', 'Portal-Admin'), async (req, res) => {
  try {
    const users = await User.find({
      $or: [{ status: 'active' }, { status: 'invited' }, { status: 'revoked' }],
    }).select('-password'); // Exclude password
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/users/staff
// @desc    Get all active staff users
// @access  Private (Director-General, Portal-Admin)
router.get('/staff', auth, authorize('Director-General', 'Portal-Admin'), async (req, res) => {
  try {
    const users = await User.find({ role: 'Staff', status: 'active' }).select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/users/invite
// @desc    Invite a new user (create with 'invited' status)
// @access  Private (Director-General, Portal-Admin)
router.post('/invite', auth, authorize('Director-General', 'Portal-Admin'), async (req, res) => {
  const { name, email, password, role } = req.body;

  // Simple validation
  if (!name || !email || !password || !role) {
    return res.status(400).json({ msg: 'Please enter all fields' });
  }

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({
      name,
      email,
      password,
      role,
      status: 'invited', // Set status to invited
    });

    await user.save();

    res.status(201).json({ msg: 'User invited successfully', user: user.toObject({ getters: true, virtuals: false, transform: (doc, ret) => { delete ret.password; return ret; } }) });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/users/:id/revoke
// @desc    Revoke access for a user (set status to 'revoked')
// @access  Private (Director-General, Portal-Admin)
router.put('/:id/revoke', auth, authorize('Director-General', 'Portal-Admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user.status = 'revoked';
    await user.save();

    res.json({ msg: 'User access revoked successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
