const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChatController');

// Auth middleware is applied at the app level in server.js

// Conversation management routes
router.get('/conversations', aiChatController.getConversations);
router.get('/conversations/:conversationId', aiChatController.getConversation);
router.post('/conversations', aiChatController.createConversation);
router.put('/conversations/:conversationId/title', aiChatController.updateConversationTitle);
router.delete('/conversations/:conversationId', aiChatController.deleteConversation);

// Message routes
router.post('/send', aiChatController.sendMessage);
router.put('/conversations/:conversationId/messages/:messageId', aiChatController.editMessage);
router.delete('/conversations/:conversationId/messages/:messageId', aiChatController.deleteMessage);

// Card search route
router.get('/search', aiChatController.searchCards);

// Export route
router.get('/conversations/:conversationId/export', aiChatController.exportConversation);

module.exports = router; 