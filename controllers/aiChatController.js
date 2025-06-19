const AIChatConversation = require('../models/AIChatConversation');
const aiChatService = require('../services/aiChatService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/ai-chat-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `ai-chat-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files per request
  },
  fileFilter: function (req, file, cb) {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * Get all conversations for a user
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, search = '', archived = false } = req.query;
    
    // Build query
    let query = { userId, archived: archived === 'true' };
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get conversations with pagination
    const conversations = await AIChatConversation.find(query)
      .select('id title createdAt updatedAt stats pinned context')
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    // Get total count
    const total = await AIChatConversation.countDocuments(query);
    
    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

/**
 * Get a specific conversation with messages
 */
exports.getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    }).lean();
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    res.json(conversation);
    
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Failed to fetch conversation' });
  }
};

/**
 * Create a new conversation
 */
exports.createConversation = async (req, res) => {
  try {
    const { title, context = {} } = req.body;
    const userId = req.user._id;
    
    if (!title) {
      return res.status(400).json({ message: 'Conversation title is required' });
    }
    
    const conversation = new AIChatConversation({
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      userId,
      messages: [],
      context: {
        spaceId: context.spaceId || null,
        spaceName: context.spaceName || null,
        activeCards: context.activeCards || [],
        recentActivity: []
      }
    });
    
    await conversation.save();
    
    res.status(201).json({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      context: conversation.context
    });
    
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

/**
 * Update conversation title
 */
exports.updateConversationTitle = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    const userId = req.user._id;
    
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    
    const conversation = await AIChatConversation.findOneAndUpdate(
      { id: conversationId, userId },
      { title },
      { new: true }
    );
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    res.json({ message: 'Title updated successfully', title: conversation.title });
    
  } catch (error) {
    console.error('Update conversation title error:', error);
    res.status(500).json({ message: 'Failed to update conversation title' });
  }
};

/**
 * Delete a conversation
 */
exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOneAndDelete({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Clean up uploaded images
    conversation.messages.forEach(message => {
      if (message.images && message.images.length > 0) {
        message.images.forEach(image => {
          const imagePath = path.join(__dirname, '../uploads/ai-chat-images', image.filename);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }
    });
    
    res.json({ message: 'Conversation deleted successfully' });
    
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ message: 'Failed to delete conversation' });
  }
};

/**
 * Send a message and get AI response
 */
exports.sendMessage = async (req, res) => {
  // Handle multipart form data
  upload.array('images', 5)(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ message: 'File upload error: ' + err.message });
    }
  try {
    const { conversationId, content, mode = 'macro', context = {} } = req.body;
    
    console.log('SendMessage - req.user:', req.user);
    console.log('SendMessage - req.body:', req.body);
    
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const userId = req.user._id;
    
    if (!conversationId || !content) {
      return res.status(400).json({ message: 'Conversation ID and message content are required' });
    }
    
    // Find or create conversation
    let conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      // Create new conversation if it doesn't exist
      conversation = new AIChatConversation({
        id: conversationId,
        title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        userId,
        messages: [],
        context: {
          spaceId: context.spaceId || null,
          spaceName: context.spaceName || null,
          activeCards: context.activeCards || [],
          recentActivity: []
        }
      });
    }
    
    // Handle uploaded images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      }));
    }
    
    // Add user message
    const userMessage = conversation.addMessage({
      type: 'user',
      content,
      mode,
      images
    });
    
    // Search for relevant cards
    // For macro mode, use expanded search (all accessible + public spaces)
    const searchResults = await aiChatService.searchCards(userId, content, {
      mode,
      spaceId: context.spaceId,
      limit: 10,
      searchAll: false, // Keep false for privacy, but will include public spaces now
      conversationHistory: conversation.messages || [] // Pass conversation history for context
    });
    
    // Generate AI response
    const aiResponse = await aiChatService.generateResponse(
      userId,
      content,
      mode,
      searchResults,
      {
        recentMessages: conversation.getRecentMessages(5),
        currentSpace: context.spaceName,
        activeCards: context.activeCards
      }
    );
    
    // Add AI message
    const aiMessage = conversation.addMessage({
      type: 'ai',
      content: aiResponse.content,
      mode,
      sources: aiResponse.sources,
      confidence: aiResponse.confidence,
      metadata: aiResponse.metadata
    });
    
    // Update conversation context
    if (context.recentActivity) {
      conversation.context.recentActivity = [
        ...conversation.context.recentActivity.slice(-9), // Keep last 9
        {
          action: 'message_sent',
          cardId: null,
          timestamp: new Date()
        }
      ];
    }
    
    await conversation.save();
    
    res.json({
      userMessage: {
        id: userMessage.id,
        type: userMessage.type,
        content: userMessage.content,
        timestamp: userMessage.timestamp,
        images: userMessage.images
      },
      aiMessage: {
        id: aiMessage.id,
        type: aiMessage.type,
        content: aiMessage.content,
        timestamp: aiMessage.timestamp,
        sources: aiMessage.sources,
        confidence: aiMessage.confidence,
        metadata: aiMessage.metadata
      }
    });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to process message' });
  }
  });
};

/**
 * Edit a message
 */
exports.editMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;
    
    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const message = conversation.messages.find(msg => msg.id === messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Only allow editing user messages
    if (message.type !== 'user') {
      return res.status(403).json({ message: 'Can only edit user messages' });
    }
    
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    
    await conversation.save();
    
    res.json({ message: 'Message updated successfully' });
    
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ message: 'Failed to edit message' });
  }
};

/**
 * Delete a message
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    const message = conversation.messages[messageIndex];
    
    // Clean up uploaded images
    if (message.images && message.images.length > 0) {
      message.images.forEach(image => {
        const imagePath = path.join(__dirname, '../uploads/ai-chat-images', image.filename);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    }
    
    conversation.messages.splice(messageIndex, 1);
    await conversation.save();
    
    res.json({ message: 'Message deleted successfully' });
    
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
};

/**
 * Search through user's cards
 */
exports.searchCards = async (req, res) => {
  try {
    const { query, mode = 'search', spaceId = null, limit = 10, searchAll = 'false' } = req.query;
    const userId = req.user._id;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Convert searchAll string to boolean
    const searchAllCards = searchAll === 'true';
    
    const searchResults = await aiChatService.searchCards(userId, query, {
      mode,
      spaceId,
      limit: parseInt(limit),
      searchAll: searchAllCards
    });
    
    res.json(searchResults);
    
  } catch (error) {
    console.error('Search cards error:', error);
    res.status(500).json({ message: 'Failed to search cards' });
  }
};

/**
 * Toggle conversation pin status
 */
exports.togglePin = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    conversation.pinned = !conversation.pinned;
    await conversation.save();
    
    res.json({ 
      message: `Conversation ${conversation.pinned ? 'pinned' : 'unpinned'} successfully`,
      pinned: conversation.pinned
    });
    
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ message: 'Failed to toggle pin status' });
  }
};

/**
 * Archive/unarchive conversation
 */
exports.toggleArchive = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    conversation.archived = !conversation.archived;
    await conversation.save();
    
    res.json({ 
      message: `Conversation ${conversation.archived ? 'archived' : 'unarchived'} successfully`,
      archived: conversation.archived
    });
    
  } catch (error) {
    console.error('Toggle archive error:', error);
    res.status(500).json({ message: 'Failed to toggle archive status' });
  }
};

/**
 * Export conversation
 */
exports.exportConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { format = 'json' } = req.query;
    const userId = req.user._id;
    
    const conversation = await AIChatConversation.findOne({
      id: conversationId,
      userId
    }).lean();
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    const exportData = {
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map(msg => ({
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        sources: msg.sources,
        confidence: msg.confidence
      }))
    };
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="chat_${conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json"`);
      res.json(exportData);
    } else {
      // Text format
      let textContent = `Chat: ${exportData.title}\n`;
      textContent += `Created: ${new Date(exportData.createdAt).toLocaleString()}\n\n`;
      
      exportData.messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const speaker = msg.type === 'user' ? 'You' : 'AI Assistant';
        textContent += `[${timestamp}] ${speaker}:\n${msg.content}\n\n`;
        
        if (msg.sources && msg.sources.length > 0) {
          textContent += `Sources: ${msg.sources.map(s => `${s.spaceName} - ${s.cardTitle}`).join(', ')}\n\n`;
        }
      });
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="chat_${conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt"`);
      res.send(textContent);
    }
    
  } catch (error) {
    console.error('Export conversation error:', error);
    res.status(500).json({ message: 'Failed to export conversation' });
  }
};

// Export multer upload middleware
exports.uploadImages = upload.array('images', 5); 