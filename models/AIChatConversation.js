const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
    // Removed unique: true - messages only need to be unique within a conversation
  },
  type: {
    type: String,
    enum: ['user', 'ai', 'system', 'error'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    enum: ['macro', 'rephrase', 'explain', 'summarize', 'translate', 'improve', 'process', 'search'],
    default: 'macro'
  },
  sources: [{
    cardId: String,
    cardTitle: String,
    spaceId: String,
    spaceName: String,
    relevanceScore: Number,
    excerpt: String
  }],
  confidence: {
    type: Number,
    min: 0,
    max: 100
  },
  processFlow: [String],
  images: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    uploadedAt: Date
  }],
  metadata: {
    processingTime: Number,
    tokensUsed: Number,
    model: String,
    temperature: Number
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const aiChatConversationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [messageSchema],
  context: {
    spaceId: String,
    spaceName: String,
    activeCards: [String],
    recentActivity: [{
      action: String,
      cardId: String,
      timestamp: Date
    }]
  },
  settings: {
    defaultMode: {
      type: String,
      enum: ['macro', 'rephrase', 'explain', 'summarize', 'translate', 'improve', 'process', 'search'],
      default: 'macro'
    },
    temperature: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.3
    },
    maxTokens: {
      type: Number,
      default: 1000
    }
  },
  stats: {
    messageCount: {
      type: Number,
      default: 0
    },
    totalTokensUsed: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },
  tags: [String],
  pinned: {
    type: Boolean,
    default: false
  },
  archived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
aiChatConversationSchema.index({ userId: 1, createdAt: -1 });
aiChatConversationSchema.index({ userId: 1, title: 'text' });
aiChatConversationSchema.index({ 'messages.content': 'text', title: 'text' });
aiChatConversationSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });
// Compound index for messages - NOT unique since we want messages to be unique only within a conversation
aiChatConversationSchema.index({ id: 1, 'messages.id': 1 });

// Virtual for message count
aiChatConversationSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Pre-save middleware to update stats
aiChatConversationSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.stats.messageCount = this.messages.length;
    
    // Calculate total tokens used
    this.stats.totalTokensUsed = this.messages.reduce((total, msg) => {
      return total + (msg.metadata?.tokensUsed || 0);
    }, 0);
    
    // Calculate average response time
    const aiMessages = this.messages.filter(msg => msg.type === 'ai' && msg.metadata?.processingTime);
    if (aiMessages.length > 0) {
      this.stats.averageResponseTime = aiMessages.reduce((total, msg) => {
        return total + msg.metadata.processingTime;
      }, 0) / aiMessages.length;
    }
  }
  next();
});

// Methods
aiChatConversationSchema.methods.addMessage = function(messageData) {
  // Generate unique message ID with more entropy and check for duplicates
  let messageId;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${attempts}`;
    attempts++;
  } while (
    attempts < maxAttempts && 
    this.messages.some(msg => msg.id === messageId)
  );
  
  // Ensure messageData doesn't override our generated ID
  const cleanMessageData = { ...messageData };
  delete cleanMessageData.id; // Remove any ID that might be in messageData
  
  const message = {
    id: messageId,
    ...cleanMessageData,
    timestamp: new Date()
  };
  
  // Validate message has required fields
  if (!message.id || !message.type || !message.content) {
    throw new Error('Message must have id, type, and content');
  }
  
  this.messages.push(message);
  return message;
};

aiChatConversationSchema.methods.updateMessage = function(messageId, updates) {
  const message = this.messages.id(messageId);
  if (message) {
    Object.assign(message, updates);
    message.edited = true;
    message.editedAt = new Date();
    return message;
  }
  return null;
};

aiChatConversationSchema.methods.deleteMessage = function(messageId) {
  return this.messages.id(messageId).remove();
};

aiChatConversationSchema.methods.getRecentMessages = function(count = 10) {
  return this.messages.slice(-count);
};

module.exports = mongoose.model('AIChatConversation', aiChatConversationSchema); 