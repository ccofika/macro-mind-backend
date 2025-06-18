const { v4: uuidv4 } = require('uuid');
const Card = require('../models/Card');
const Connection = require('../models/Connection');
const User = require('../models/User');
const Space = require('../models/Space');

// Get all cards for the current user or space
exports.getAllCards = async (req, res) => {
  try {
    const userId = req.user.email;
    const { spaceId } = req.query;
    
    let query = {};
    
    if (spaceId) {
      if (spaceId === 'public') {
        // For public space, get all cards in the public space
        query = { spaceId: 'public' };
      } else {
        // For private spaces, we need to check if user has access to the space
        // and if they do, get all cards in that space
        try {
          const space = await Space.findById(spaceId);
          
          if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
          }
          
          // Check if user has access to this space
          const isMember = space.members.some(member => member.userId === userId);
          const isOwner = space.ownerId === userId;
          
          if (!space.isPublic && !isMember && !isOwner) {
            return res.status(403).json({ success: false, message: 'Access denied to this space' });
          }
          
          // User has access, get all cards in this space
          query = { spaceId: spaceId };
        } catch (spaceError) {
          console.error("Error checking space access:", spaceError);
          return res.status(500).json({ success: false, message: 'Error checking space access' });
        }
      }
    } else {
      // If no spaceId specified, get only user's personal cards (backwards compatibility)
      query = { userId };
    }
    
    const cards = await Card.find(query);
    res.json(cards);
  } catch (error) {
    console.error("Error fetching cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new card
exports.createCard = async (req, res) => {
  try {
    const userId = req.user.email;
    const { type, title, content, position, spaceId } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type and title are required' 
      });
    }
    
    // Generate a UUID for the card
    const cardId = uuidv4();
    
    const newCard = new Card({
      _id: cardId, // Use UUID as string ID
      userId,
      spaceId: spaceId || 'public', // Default to public space
      type,
      title,
      content: content || null,
      position: position || { x: 0, y: 0 }
    });
    
    await newCard.save();
    
    res.status(201).json(newCard);
  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a card
exports.updateCard = async (req, res) => {
  try {
    const userId = req.user.email;
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`User ${userId} attempting to update card ${id} with:`, updates);
    
    // Find card first
    const card = await Card.findOne({ _id: id });
    
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found' 
      });
    }
    
    // Check if user has permission to update this card
    let hasPermission = false;
    
    if (card.spaceId === 'public' || card.userId === userId) {
      hasPermission = true;
    } else if (card.spaceId && card.spaceId !== 'public') {
      // For private space cards, check if user has access to the space
      try {
        const space = await Space.findById(card.spaceId);
        if (space) {
          const hasAccess = space.hasAccess(userId);
          if (hasAccess && space.canUserEdit(userId)) {
            hasPermission = true;
          }
        }
      } catch (spaceError) {
        console.error(`Error checking space permissions for card ${id}:`, spaceError);
      }
    }
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to edit this card' 
      });
    }
    
    // Update card with new information
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'userId' && key !== 'spaceId') {
        card[key] = updates[key];
      }
    });
    
    // Ensure position is valid
    if (card.position && typeof card.position !== 'object') {
      card.position = { x: 0, y: 0 };
    }
    
    // Update the updatedAt timestamp
    card.updatedAt = new Date();
    
    await card.save();
    
    console.log(`Successfully updated card ${id} for user ${userId}`);
    res.json(card);
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a card
exports.deleteCard = async (req, res) => {
  try {
    const userId = req.user.email;
    const { id } = req.params;
    
    // Find card and ensure it belongs to the user
    const card = await Card.findOne({ _id: id, userId });
    
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found or you do not have permission to delete it' 
      });
    }
    
    // Delete the card
    await Card.deleteOne({ _id: id });
    
    // Also remove any connections that involve this card
    await Connection.deleteMany({
      userId,
      $or: [{ sourceId: id }, { targetId: id }]
    });
    
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error("Error deleting card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete multiple cards
exports.deleteMultipleCards = async (req, res) => {
  try {
    const userId = req.user.email;
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or empty card IDs array' 
      });
    }
    
    // Check if all cards belong to the current user
    const cards = await Card.find({ _id: { $in: ids }, userId });
    
    if (cards.length !== ids.length) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete one or more of these cards' 
      });
    }
    
    // Delete the cards
    await Card.deleteMany({ _id: { $in: ids }, userId });
    
    // Also remove any connections that involve these cards
    await Connection.deleteMany({
      userId,
      $or: [
        { sourceId: { $in: ids } },
        { targetId: { $in: ids } }
      ]
    });
    
    res.json({ 
      success: true, 
      message: `${ids.length} cards deleted successfully` 
    });
  } catch (error) {
    console.error("Error deleting multiple cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all connections for the current user or space
exports.getAllConnections = async (req, res) => {
  try {
    const userId = req.user.email;
    const { spaceId } = req.query;
    
    let query = {};
    
    if (spaceId) {
      if (spaceId === 'public') {
        // For public space, get all connections in the public space
        query = { spaceId: 'public' };
      } else {
        // For private spaces, check access and get all connections in that space
        try {
          const space = await Space.findById(spaceId);
          
          if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
          }
          
          // Check if user has access to this space
          const isMember = space.members.some(member => member.userId === userId);
          const isOwner = space.ownerId === userId;
          
          if (!space.isPublic && !isMember && !isOwner) {
            return res.status(403).json({ success: false, message: 'Access denied to this space' });
          }
          
          // User has access, get all connections in this space
          query = { spaceId: spaceId };
        } catch (spaceError) {
          console.error("Error checking space access:", spaceError);
          return res.status(500).json({ success: false, message: 'Error checking space access' });
        }
      }
    } else {
      // If no spaceId specified, get only user's personal connections (backwards compatibility)
      query = { userId };
    }
    
    const connections = await Connection.find(query);
    res.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new connection
exports.createConnection = async (req, res) => {
  try {
    const userId = req.user.email;
    const { sourceId, targetId, label, spaceId } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target IDs are required' 
      });
    }
    
    // Check if cards exist and user has access to them
    const sourceCard = await Card.findOne({ _id: sourceId });
    const targetCard = await Card.findOne({ _id: targetId });
    
    if (!sourceCard) {
      return res.status(404).json({ 
        success: false, 
        message: 'Source card not found' 
      });
    }
    
    if (!targetCard) {
      return res.status(404).json({ 
        success: false, 
        message: 'Target card not found' 
      });
    }
    
    // Check if cards are in the same space
    if (sourceCard.spaceId !== targetCard.spaceId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cards must be in the same space to connect' 
      });
    }
    
    // Check if user has access to the space
    const cardSpaceId = sourceCard.spaceId || 'public';
    
    if (cardSpaceId !== 'public') {
      try {
        const space = await Space.findById(cardSpaceId);
        if (!space) {
          return res.status(404).json({ 
            success: false, 
            message: 'Space not found' 
          });
        }
        
        // Check if user has access to this space
        if (!space.hasAccess(userId)) {
          return res.status(403).json({ 
            success: false, 
            message: 'You do not have access to this space' 
          });
        }
      } catch (spaceError) {
        console.error("Error checking space access:", spaceError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking space access' 
        });
      }
    }
    
    // Use spaceId from cards (already validated they're in the same space)
    const connectionSpaceId = cardSpaceId;
    
    // Check if connection already exists (bidirectional check)
    const existingConnection = await Connection.findOne({
      spaceId: connectionSpaceId,
      $or: [
        { sourceId, targetId },
        { sourceId: targetId, targetId: sourceId }
      ]
    });
    
    if (existingConnection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Connection already exists' 
      });
    }
    
    // Generate a UUID for the connection
    const connectionId = uuidv4();
    
    // Create new connection
    const newConnection = new Connection({
      _id: connectionId, // Use UUID as string ID
      userId,
      spaceId: connectionSpaceId,
      sourceId,
      targetId,
      label: label || null
    });
    
    console.log('Creating connection:', {
      connectionId,
      userId,
      spaceId: connectionSpaceId,
      sourceId,
      targetId,
      label: label || null
    });
    
    await newConnection.save();
    
    console.log('Connection created successfully:', newConnection);
    
    res.status(201).json(newConnection);
  } catch (error) {
    console.error("Error creating connection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a connection
exports.deleteConnection = async (req, res) => {
  try {
    const userId = req.user.email;
    const { id } = req.params;
    
    // Find the connection first to check permissions
    const connection = await Connection.findOne({ _id: id });
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Connection not found' 
      });
    }
    
    // Check if user has access to this space
    if (connection.spaceId !== 'public') {
      try {
        const space = await Space.findById(connection.spaceId);
        if (!space) {
          return res.status(404).json({ 
            success: false, 
            message: 'Space not found' 
          });
        }
        
        // Check if user has access to this space
        if (!space.hasAccess(userId)) {
          return res.status(403).json({ 
            success: false, 
            message: 'You do not have permission to delete this connection' 
          });
        }
      } catch (spaceError) {
        console.error("Error checking space access:", spaceError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking space access' 
        });
      }
    }
    
    // Delete the connection
    const result = await Connection.deleteOne({ _id: id });
    
    if (result.deletedCount === 0) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to delete connection' 
      });
    }
    
    res.json({ success: true, message: 'Connection deleted successfully' });
  } catch (error) {
    console.error("Error deleting connection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a connection
exports.updateConnection = async (req, res) => {
  try {
    const userId = req.user.email;
    const { id } = req.params;
    const { label } = req.body;
    
    // Find connection and ensure it belongs to the user
    const connection = await Connection.findOne({ _id: id, userId });
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Connection not found or you do not have permission to edit it' 
      });
    }
    
    // Update connection
    connection.label = label;
    await connection.save();
    
    res.json(connection);
  } catch (error) {
    console.error("Error updating connection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Save current canvas state
exports.saveCanvasState = async (req, res) => {
  try {
    const userId = req.user.email;
    const { zoom, pan } = req.body;
    
    if (!zoom || !pan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Zoom and pan are required' 
      });
    }
    
    // Find the user and update their canvas state
    await User.findOneAndUpdate(
      { email: userId },
      { 
        $set: { 
          canvasState: { zoom, pan, updatedAt: new Date() } 
        } 
      },
      { new: true }
    );
    
    res.json({ 
      success: true, 
      message: 'Canvas state saved successfully' 
    });
  } catch (error) {
    console.error("Error saving canvas state:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update card positions
exports.updateCardPositions = async (req, res) => {
  try {
    const userId = req.user.email;
    const { positions } = req.body;
    
    if (!Array.isArray(positions)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Positions must be an array' 
      });
    }
    
    console.log(`Updating positions for ${positions.length} cards for user ${userId}`);
    
    // Update each card's position in the database
    const updatePromises = positions.map(async (item) => {
      if (!item.id || !item.position) {
        console.log(`Skipping invalid position update: ${JSON.stringify(item)}`);
        return null;
      }
      
      console.log(`Updating card ${item.id} to position:`, item.position);
      
      try {
        // First find the card to check permissions
        const card = await Card.findOne({ _id: item.id });
        
        if (!card) {
          console.log(`Card ${item.id} not found`);
          return null;
        }
        
        // Check if user has permission to update this card
        // For public space cards or if user is the owner
        if (card.spaceId === 'public' || card.userId === userId) {
          const updatedCard = await Card.findOneAndUpdate(
            { _id: item.id },
            { 
              $set: { 
                position: item.position,
                updatedAt: new Date()
              } 
            },
            { new: true }
          );
          
          console.log(`Successfully updated card ${item.id} position`);
          return updatedCard;
        } else {
          // For private space cards, check if user has access to the space
          if (card.spaceId && card.spaceId !== 'public') {
            try {
              const space = await Space.findById(card.spaceId);
              if (space) {
                const hasAccess = space.hasAccess(userId);
                if (hasAccess && space.canUserEdit(userId)) {
                  const updatedCard = await Card.findOneAndUpdate(
                    { _id: item.id },
                    { 
                      $set: { 
                        position: item.position,
                        updatedAt: new Date()
                      } 
                    },
                    { new: true }
                  );
                  
                  console.log(`Successfully updated card ${item.id} position in space ${card.spaceId}`);
                  return updatedCard;
                } else {
                  console.log(`User ${userId} does not have edit access to space ${card.spaceId}`);
                  return null;
                }
              }
            } catch (spaceError) {
              console.error(`Error checking space permissions for card ${item.id}:`, spaceError);
              return null;
            }
          }
          
          console.log(`User ${userId} does not have permission to update card ${item.id}`);
          return null;
        }
      } catch (err) {
        console.error(`Error updating card ${item.id}:`, err);
        return null;
      }
    });
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(result => result !== null).length;
    
    console.log(`Successfully updated ${successCount} out of ${positions.length} card positions`);
    
    res.json({ 
      success: true, 
      message: `Updated ${successCount} card positions`,
      updated: successCount,
      total: positions.length
    });
  } catch (error) {
    console.error("Error updating card positions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};