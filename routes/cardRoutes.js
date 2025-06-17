const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');

// Card routes
router.get('/', cardController.getAllCards);
router.post('/', cardController.createCard);
router.put('/:id', cardController.updateCard);
router.delete('/:id', cardController.deleteCard);
router.post('/multiple/delete', cardController.deleteMultipleCards);
router.post('/positions', cardController.updateCardPositions);

// Connection routes
router.get('/connections', cardController.getAllConnections);
router.post('/connections', cardController.createConnection);
router.delete('/connections/:id', cardController.deleteConnection);

// Canvas state route
router.post('/canvas-state', cardController.saveCanvasState);

module.exports = router;