const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.post('/register', authController.register);

// Protected routes
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router; 