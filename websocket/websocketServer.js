const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Space = require('../models/Space');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/'
    });
    
    this.activeUsers = new Map(); // userId -> user data
    this.userSockets = new Map(); // userId -> WebSocket
    this.lockedCards = new Map(); // cardId -> userId
    this.userSpaces = new Map(); // userId -> spaceId
    this.userColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFA69E', '#9CAFB7', '#E4C3AD', '#B8F2E6',
      '#A8E6CF', '#FFD93D', '#6BCF7F', '#4D4D4D'
    ];
    
    this.setupWebSocketServer();
    console.log('WebSocket server initialized');
    
    // Heartbeat to detect disconnected clients
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
          console.log('Terminating dead connection');
          this.handleDisconnect(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
  
  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection established');
      ws.isAlive = true;
      
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          // Don't log cursor:move messages to avoid console spam
          if (data.type !== 'cursor:move') {
            console.log('Received message:', data.type);
          }
          
          if (data.type === 'auth') {
            await this.handleAuthentication(ws, data);
            return;
          }
          
          // All other messages require authentication
          if (!ws.userId) {
            this.sendError(ws, 'Authentication required');
            return;
          }
          
          switch (data.type) {
            case 'space:join':
              await this.handleSpaceJoin(ws, data);
              break;
            case 'space:leave':
              this.handleSpaceLeave(ws);
              break;
            case 'cursor:move':
              this.handleCursorMove(ws, data);
              break;
            case 'card:lock':
              this.handleCardLock(ws, data);
              break;
            case 'card:unlock':
              this.handleCardUnlock(ws, data);
              break;
            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error handling message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.handleDisconnect(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnect(ws);
      });
    });
  }
  
  async handleAuthentication(ws, data) {
    try {
      console.log('Handling authentication...');
      
      if (!data.token) {
        this.sendError(ws, 'Authentication failed: No token provided');
        return;
      }
      
      // Verify JWT token
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
      const userId = decoded.id;
      console.log('JWT verified for user:', userId);
      
      // Get user from database
      const user = await User.findById(userId);
      if (!user) {
        this.sendError(ws, 'Authentication failed: User not found');
        return;
      }
      
      console.log('User authenticated:', user.name);
      
      // Set user data on WebSocket
      ws.userId = userId;
      ws.userName = user.name;
      ws.userEmail = user.email;
      ws.userColor = this.assignUserColor(userId);
      
      // Store socket reference
      this.userSockets.set(userId, ws);
      
      // Add to active users
      this.activeUsers.set(userId, {
        id: userId,
        name: user.name,
        email: user.email,
        color: ws.userColor,
        picture: user.picture,
        cursor: { x: 0, y: 0 },
        lastActivity: Date.now()
      });
      
      // Send success response
      ws.send(JSON.stringify({
        type: 'auth:success',
        userId: userId,
        userName: user.name,
        userColor: ws.userColor
      }));
      
      console.log('Authentication successful for:', user.name);
      
      // Auto-join public space
      await this.handleSpaceJoin(ws, { spaceId: 'public' });
      
    } catch (error) {
      console.error('Authentication error:', error);
      this.sendError(ws, 'Authentication failed: ' + error.message);
    }
  }
  
  async handleSpaceJoin(ws, data) {
    try {
      const { spaceId } = data;
      const userId = ws.userId;
      
      console.log(`User ${userId} joining space ${spaceId}`);
      
      // Leave current space if any
      if (ws.currentSpaceId) {
        this.handleSpaceLeave(ws);
      }
      
      // Handle public space
      if (spaceId === 'public') {
        ws.currentSpaceId = 'public';
        this.userSpaces.set(userId, 'public');
        
        ws.send(JSON.stringify({
          type: 'space:joined',
          spaceId: 'public',
          name: 'Public Space',
          isPublic: true
        }));
        
        this.broadcastToSpace('public', {
          type: 'user:join',
          userId: userId,
          userName: ws.userName,
          userColor: ws.userColor,
          timestamp: Date.now()
        }, userId);
        
        this.sendUsersInSpace(ws, 'public');
        console.log(`User ${userId} joined public space`);
        return;
      }
      
      // Handle private spaces
      const space = await Space.findById(spaceId);
      if (!space) {
        this.sendError(ws, 'Space not found');
        return;
      }
      
      // Check permissions
      const isMember = space.members.some(member => member.userId === userId);
      const isOwner = space.ownerId === userId;
      
      if (!space.isPublic && !isMember && !isOwner) {
        this.sendError(ws, 'Access denied to this space');
        return;
      }
      
      // Join the space
      ws.currentSpaceId = spaceId;
      this.userSpaces.set(userId, spaceId);
      
      ws.send(JSON.stringify({
        type: 'space:joined',
        spaceId: spaceId,
        name: space.name,
        isPublic: space.isPublic
      }));
      
      this.broadcastToSpace(spaceId, {
        type: 'user:join',
        userId: userId,
        userName: ws.userName,
        userColor: ws.userColor,
        timestamp: Date.now()
      }, userId);
      
      this.sendUsersInSpace(ws, spaceId);
      console.log(`User ${userId} joined space ${spaceId}`);
      
    } catch (error) {
      console.error('Error joining space:', error);
      this.sendError(ws, 'Failed to join space');
    }
  }
  
  handleSpaceLeave(ws) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const spaceId = ws.currentSpaceId;
    const userId = ws.userId;
    
    console.log(`User ${userId} leaving space ${spaceId}`);
    
    // Remove from space mapping
    this.userSpaces.delete(userId);
    
    // Broadcast user leave
    this.broadcastToSpace(spaceId, {
      type: 'user:leave',
      userId: userId
    }, userId);
    
    // Unlock any cards locked by this user
    this.lockedCards.forEach((lockUserId, cardId) => {
      if (lockUserId === userId) {
        this.lockedCards.delete(cardId);
        this.broadcastToSpace(spaceId, {
          type: 'card:unlocked',
          cardId: cardId
        });
      }
    });
    
    ws.currentSpaceId = null;
  }
  
  handleCursorMove(ws, data) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const { x, y } = data;
    const userId = ws.userId;
    
    // Update user cursor
    const user = this.activeUsers.get(userId);
    if (user) {
      user.cursor = { x, y };
      user.lastActivity = Date.now();
    }
    
    // Broadcast cursor position
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'cursor:update',
      userId: userId,
      userName: ws.userName,
      userColor: ws.userColor,
      x: x,
      y: y
    }, userId);
  }
  
  handleCardLock(ws, data) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const { cardId } = data;
    const userId = ws.userId;
    
    // Check if already locked
    if (this.lockedCards.has(cardId)) {
      const lockedBy = this.lockedCards.get(cardId);
      if (lockedBy !== userId) {
        this.sendError(ws, 'Card is already locked by another user');
        return;
      }
    }
    
    // Lock the card
    this.lockedCards.set(cardId, userId);
    
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:locked',
      cardId: cardId,
      userId: userId,
      userName: ws.userName,
      userColor: ws.userColor
    });
  }
  
  handleCardUnlock(ws, data) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const { cardId } = data;
    const userId = ws.userId;
    
    // Check if locked by this user
    if (this.lockedCards.get(cardId) !== userId) {
      return; // Silently ignore
    }
    
    // Unlock the card
    this.lockedCards.delete(cardId);
    
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:unlocked',
      cardId: cardId
    });
  }
  
  handleDisconnect(ws) {
    if (!ws.userId) return;
    
    const userId = ws.userId;
    console.log(`User ${userId} disconnected`);
    
    // Leave current space
    this.handleSpaceLeave(ws);
    
    // Remove from active users
    this.activeUsers.delete(userId);
    this.userSockets.delete(userId);
  }
  
  broadcastToSpace(spaceId, message, excludeUserId = null) {
    const messageStr = JSON.stringify(message);
    
    this.userSpaces.forEach((userSpaceId, userId) => {
      if (userSpaceId === spaceId && userId !== excludeUserId) {
        const ws = this.userSockets.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      }
    });
  }
  
  sendUsersInSpace(ws, spaceId) {
    const users = [];
    
    this.userSpaces.forEach((userSpaceId, userId) => {
      if (userSpaceId === spaceId) {
        const user = this.activeUsers.get(userId);
        if (user) {
          users.push({
            id: user.id,
            name: user.name,
            color: user.color,
            picture: user.picture,
            cursor: user.cursor
          });
        }
      }
    });
    
    ws.send(JSON.stringify({
      type: 'users:list',
      users: users
    }));
  }
  
  assignUserColor(userId) {
    const usedColors = new Set();
    this.activeUsers.forEach(user => {
      usedColors.add(user.color);
    });
    
    const availableColors = this.userColors.filter(color => !usedColors.has(color));
    
    if (availableColors.length === 0) {
      return this.userColors[Math.floor(Math.random() * this.userColors.length)];
    }
    
    return availableColors[0];
  }
  
  sendError(ws, message) {
    ws.send(JSON.stringify({
      type: 'error',
      message: message
    }));
  }
  
  // Cleanup method
  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}

module.exports = WebSocketServer; 