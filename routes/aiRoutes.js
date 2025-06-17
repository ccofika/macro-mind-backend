const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Middleware for logging AI requests
router.use((req, res, next) => {
  console.log('AI Request received:', {
    path: req.path,
    method: req.method,
    body: req.body ? {
      improvements: req.body.improvements,
      originalTextLength: req.body.originalText ? req.body.originalText.length : 0
    } : null
  });
  next();
});

// Route for improving text - MUST be /improve as configured in client/src/services/aiService.js
router.post('/improve', aiController.improveResponse);

module.exports = router;