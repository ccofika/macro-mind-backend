const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Middleware za logiranje AI zahteva
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

// Ruta za poboljšanje teksta - MORA biti /improve kako je konfigurisano u client/src/services/aiService.js
router.post('/improve', aiController.improveResponse);

module.exports = router;