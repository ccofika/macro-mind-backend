const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');

// Card routes
router.get('/', cardController.getAllCards);
router.get('/search', cardController.searchCards);
router.post('/', cardController.createCard);
router.put('/:id', cardController.updateCard);
router.delete('/:id', cardController.deleteCard);
router.post('/multiple/delete', cardController.deleteMultipleCards);
router.post('/positions', cardController.updateCardPositions);

// Connection routes
router.get('/connections', cardController.getAllConnections);
router.post('/connections', cardController.createConnection);
router.put('/connections/:id', cardController.updateConnection);
router.delete('/connections/:id', cardController.deleteConnection);

// Canvas state route
router.post('/canvas-state', cardController.saveCanvasState);

// Delete all connections for a card
router.delete('/:cardId/connections', cardController.deleteAllConnectionsForCard);

module.exports = router;