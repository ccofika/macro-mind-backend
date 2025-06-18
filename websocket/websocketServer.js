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
    this.selectedCards = new Map(); // userId -> cardId (only one card per user)
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
            case 'card:select':
              this.handleCardSelect(ws, data);
              break;
            case 'card:deselect':
              this.handleCardDeselect(ws, data);
              break;
            case 'card:created':
              this.handleCardCreated(ws, data);
              break;
            case 'card:updated':
              this.handleCardUpdated(ws, data);
              break;
            case 'card:deleted':
              this.handleCardDeleted(ws, data);
              break;
            case 'connection:created':
              this.handleConnectionCreated(ws, data);
              break;
            case 'connection:deleted':
              this.handleConnectionDeleted(ws, data);
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
      
      console.log('WebSocket: User data set:', { 
        userId, 
        userName: user.name, 
        userColor: ws.userColor 
      });
      
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
      
      console.log('WebSocket: Total active users:', this.activeUsers.size);
      
      // Send success response
      ws.send(JSON.stringify({
        type: 'auth:success',
        userId: userId,
        userName: user.name,
        userColor: ws.userColor
      }));
      
      console.log('Authentication successful for:', user.name);
      
      // Don't auto-join public space - let frontend decide which space to join
      
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
      
      // Leave current space if any (but don't broadcast if joining the same space)
      if (ws.currentSpaceId && ws.currentSpaceId !== spaceId) {
        this.handleSpaceLeave(ws);
      } else if (ws.currentSpaceId === spaceId) {
        // Already in this space, just send confirmation
        ws.send(JSON.stringify({
          type: 'space:joined',
          spaceId: spaceId,
          name: spaceId === 'public' ? 'Public Space' : 'Space',
          isPublic: spaceId === 'public'
        }));
        this.sendUsersInSpace(ws, spaceId);
        return;
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
        
        // Broadcast to other users that this user joined
        this.broadcastToSpace('public', {
          type: 'user:join',
          userId: userId,
          userName: ws.userName,
          userColor: ws.userColor,
          timestamp: Date.now()
        }, userId); // Exclude self from broadcast
        
        // Send list of all users to the newly joined user
        this.sendUsersInSpace(ws, 'public');
        
        console.log(`Total users in public space: ${Array.from(this.userSpaces.values()).filter(s => s === 'public').length}`);
        console.log(`User ${userId} joined public space`);
        return;
      }
      
      // Handle private spaces
      const space = await Space.findById(spaceId);
      if (!space) {
        console.log(`WebSocket: Space ${spaceId} not found`);
        this.sendError(ws, 'Space not found');
        return;
      }
      
      // Check permissions using helper method
      if (!space.hasAccess(userId)) {
        console.log(`WebSocket: User ${userId} denied access to space ${spaceId}`);
        console.log(`WebSocket: Space details - isPublic: ${space.isPublic}, ownerId: ${space.ownerId}, members:`, space.members.map(m => ({ userId: m.userId, role: m.role })));
        this.sendError(ws, 'Access denied to this space');
        return;
      }
      
      console.log(`WebSocket: User ${userId} granted access to space ${spaceId}`);
      
      // Join the space
      ws.currentSpaceId = spaceId;
      this.userSpaces.set(userId, spaceId);
      
      ws.send(JSON.stringify({
        type: 'space:joined',
        spaceId: spaceId,
        name: space.name,
        isPublic: space.isPublic
      }));
      
      // Broadcast user join to other users in the space (exclude self)
      this.broadcastToSpace(spaceId, {
        type: 'user:join',
        userId: userId,
        userName: ws.userName,
        userColor: ws.userColor,
        timestamp: Date.now()
      }, userId);
      
      // Send current users list to the newly joined user
      this.sendUsersInSpace(ws, spaceId);
      
      console.log(`Total users in space ${spaceId}: ${Array.from(this.userSpaces.values()).filter(s => s === spaceId).length}`);
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
    const userName = ws.userName;
    
    console.log(`User ${userId} (${userName}) leaving space ${spaceId}`);
    
    // Remove from space mapping
    this.userSpaces.delete(userId);
    
    // Clear selected card for this user
    this.selectedCards.delete(userId);
    
    // Broadcast user leave to ALL other users in the space
    this.broadcastToSpace(spaceId, {
      type: 'user:leave',
      userId: userId,
      userName: userName
    });
    
    // Unlock any cards locked by this user
    this.lockedCards.forEach((lockUserId, cardId) => {
      if (lockUserId === userId) {
        this.lockedCards.delete(cardId);
        this.broadcastToSpace(spaceId, {
          type: 'card:unlocked',
          cardId: cardId
        });
        console.log(`Unlocked card ${cardId} due to user ${userId} leaving space`);
      }
    });
    
    ws.currentSpaceId = null;
    console.log(`User ${userId} successfully left space ${spaceId}`);
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
      type: 'cursor:move',
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

  handleCardSelect(ws, data) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const { cardId } = data;
    const userId = ws.userId;
    
    console.log(`User ${userId} selecting card ${cardId} in space ${ws.currentSpaceId}`);
    
    // Check if user already has a selected card
    const currentSelected = this.selectedCards.get(userId);
    if (currentSelected && currentSelected !== cardId) {
      // Deselect previous card first
      this.selectedCards.delete(userId);
      
      // Broadcast deselection of previous card
      this.broadcastToSpace(ws.currentSpaceId, {
        type: 'card:deselected',
        cardId: currentSelected,
        userId: userId,
        userName: ws.userName
      });
      
      // Also unlock the previous card
      if (this.lockedCards.get(currentSelected) === userId) {
        this.lockedCards.delete(currentSelected);
        this.broadcastToSpace(ws.currentSpaceId, {
          type: 'card:unlocked',
          cardId: currentSelected
        });
      }
    }
    
    // Select new card
    this.selectedCards.set(userId, cardId);
    
    // Lock the card
    this.lockedCards.set(cardId, userId);
    
    // Broadcast selection and lock
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:selected',
      cardId: cardId,
      userId: userId,
      userName: ws.userName,
      userColor: ws.userColor
    });
    
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:locked',
      cardId: cardId,
      userId: userId,
      userName: ws.userName,
      userColor: ws.userColor
    });
  }

  handleCardDeselect(ws, data) {
    if (!ws.currentSpaceId || !ws.userId) return;
    
    const { cardId } = data;
    const userId = ws.userId;
    
    console.log(`User ${userId} deselecting card ${cardId} in space ${ws.currentSpaceId}`);
    
    // Check if this card is selected by this user
    if (this.selectedCards.get(userId) !== cardId) {
      return; // Silently ignore
    }
    
    // Deselect card
    this.selectedCards.delete(userId);
    
    // Unlock card
    if (this.lockedCards.get(cardId) === userId) {
      this.lockedCards.delete(cardId);
      
      this.broadcastToSpace(ws.currentSpaceId, {
        type: 'card:unlocked',
        cardId: cardId
      });
    }
    
    // Broadcast deselection
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:deselected',
      cardId: cardId,
      userId: userId,
      userName: ws.userName
    });
  }
  
  handleDisconnect(ws) {
    if (!ws.userId) {
      console.log('WebSocket: Disconnect called for unauthenticated connection');
      return;
    }
    
    const userId = ws.userId;
    const userName = ws.userName;
    const currentSpace = ws.currentSpaceId;
    
    console.log(`WebSocket: User ${userId} (${userName}) disconnected from space ${currentSpace || 'none'}`);
    
    // Leave current space first
    this.handleSpaceLeave(ws);
    
    // Remove from all mappings
    this.activeUsers.delete(userId);
    this.userSockets.delete(userId);
    this.userSpaces.delete(userId);
    this.selectedCards.delete(userId);
    
    // Clean up any card locks by this user
    let unlockedCards = 0;
    this.lockedCards.forEach((lockUserId, cardId) => {
      if (lockUserId === userId) {
        this.lockedCards.delete(cardId);
        unlockedCards++;
        
        // Broadcast unlock to all users in the current space
        if (currentSpace) {
          this.broadcastToSpace(currentSpace, {
            type: 'card:unlocked',
            cardId: cardId
          });
        }
      }
    });
    
    console.log(`WebSocket: Cleaned up user ${userId} - unlocked ${unlockedCards} cards, active users: ${this.activeUsers.size}, total spaces: ${this.userSpaces.size}`);
  }
  
  broadcastToSpace(spaceId, message, excludeUserId = null) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    // Only log non-cursor messages to avoid console spam
    if (message.type !== 'cursor:move') {
      console.log(`Broadcasting to space ${spaceId}:`, message.type, excludeUserId ? `(excluding ${excludeUserId})` : '(to all)');
    }
    
    this.userSpaces.forEach((userSpaceId, userId) => {
      if (userSpaceId === spaceId && userId !== excludeUserId) {
        const ws = this.userSockets.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
          sentCount++;
          if (message.type !== 'cursor:move') {
            console.log(`  -> Sent to user ${userId}`);
          }
        } else if (message.type !== 'cursor:move') {
          console.log(`  -> Failed to send to user ${userId} (socket not ready)`);
        }
      }
    });
    
    if (message.type !== 'cursor:move') {
      console.log(`Broadcast sent to ${sentCount} users in space ${spaceId}`);
    }
  }
  
  sendUsersInSpace(ws, spaceId) {
    const users = [];
    let totalInSpace = 0;
    
    this.userSpaces.forEach((userSpaceId, userId) => {
      if (userSpaceId === spaceId) {
        totalInSpace++;
        const user = this.activeUsers.get(userId);
        if (user) {
          users.push({
            id: user.id,
            name: user.name,
            color: user.color,
            picture: user.picture,
            cursor: user.cursor || { x: 0, y: 0 }
          });
        } else {
          console.warn(`WebSocket: User ${userId} in space ${spaceId} but not in activeUsers`);
        }
      }
    });
    
    console.log(`WebSocket: Sending ${users.length} users to newly joined user in space ${spaceId} (total mapped: ${totalInSpace})`);
    
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
  
  // Card and connection event handlers
  handleCardCreated(ws, data) {
    if (!ws.currentSpaceId) return;
    
    console.log(`Card created in space ${ws.currentSpaceId}:`, data.card.id);
    
    // Broadcast to all users in the same space except the sender
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:created',
      card: data.card,
      userId: ws.userId,
      userName: ws.userName
    }, ws.userId);
  }

  handleCardUpdated(ws, data) {
    if (!ws.currentSpaceId) return;
    
    console.log(`Card updated in space ${ws.currentSpaceId}:`, data.card.id);
    
    // Broadcast to all users in the same space except the sender
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:updated',
      card: data.card,
      userId: ws.userId,
      userName: ws.userName
    }, ws.userId);
  }

  handleCardDeleted(ws, data) {
    if (!ws.currentSpaceId) return;
    
    console.log(`Card deleted in space ${ws.currentSpaceId}:`, data.cardId);
    
    // Broadcast to all users in the same space except the sender
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'card:deleted',
      cardId: data.cardId,
      userId: ws.userId,
      userName: ws.userName
    }, ws.userId);
  }

  handleConnectionCreated(ws, data) {
    if (!ws.currentSpaceId) return;
    
    console.log(`Connection created in space ${ws.currentSpaceId}:`, data.connection.id);
    
    // Broadcast to all users in the same space except the sender
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'connection:created',
      connection: data.connection,
      userId: ws.userId,
      userName: ws.userName
    }, ws.userId);
  }

  handleConnectionDeleted(ws, data) {
    if (!ws.currentSpaceId) return;
    
    console.log(`Connection deleted in space ${ws.currentSpaceId}:`, data.connectionId);
    
    // Broadcast to all users in the same space except the sender
    this.broadcastToSpace(ws.currentSpaceId, {
      type: 'connection:deleted',
      connectionId: data.connectionId,
      userId: ws.userId,
      userName: ws.userName
    }, ws.userId);
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