const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChatController');

// Auth middleware is applied at the app level in server.js

// Conversation management routes
router.get('/conversations', aiChatController.getConversations);
router.get('/conversations/:conversationId', aiChatController.getConversation);
router.post('/conversations', aiChatController.createConversation);
router.delete('/conversations/:conversationId', aiChatController.deleteConversation);

// Message routes
router.post('/send', aiChatController.sendMessage);

// Card search route
router.get('/search', aiChatController.searchCards);

// Export route
router.get('/conversations/:conversationId/export', aiChatController.exportConversation);

module.exports = router; 