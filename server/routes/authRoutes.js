const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate } = require('../middleware/authMiddleware');
const { getDatabase } = require('../db/database');

// Public: Get sections for registration form
router.get('/sections', (req, res) => {
  try {
    const db = getDatabase();
    const sections = db.prepare('SELECT id, name, code, gender_target, class_year FROM sections ORDER BY name ASC').all();
    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: Student self-registration
router.post('/register', async (req, res) => {
  try {
    const { name, studentId, email, gender, classYear, sectionId } = req.body;
    const student = await authService.registerStudent({
      name,
      studentId,
      email,
      gender,
      classYear,
      sectionId
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully! Your application is awaiting Department Administrator approval.',
      student
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Public: Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({
      success: true,
      user: result.user,
      token: result.token
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Public: Activate account with one-time token & set password
router.post('/activate', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.activateWithToken(token, newPassword);
    res.json({
      success: true,
      message: 'Account activated and password set successfully! Welcome to RAD 321.',
      user: result.user,
      token: result.token
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Authenticated: Get current user profile
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
