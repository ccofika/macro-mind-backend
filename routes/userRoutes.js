const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getUserNavPreferences,
  updateNavCategories,
  addNavLink,
  updateNavLink,
  deleteNavLink
} = require('../controllers/userController');

// Navigation preferences routes
router.get('/nav-preferences', authenticateToken, getUserNavPreferences);
router.put('/nav-categories', authenticateToken, updateNavCategories);
router.post('/nav-links', authenticateToken, addNavLink);
router.put('/nav-links/:linkId', authenticateToken, updateNavLink);
router.delete('/nav-links/:linkId', authenticateToken, deleteNavLink);

module.exports = router; 