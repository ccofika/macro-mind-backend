const { v4: uuidv4 } = require('uuid');
const Card = require('../models/Card');
const Connection = require('../models/Connection');
const User = require('../models/User');
const Space = require('../models/Space');

// Get all cards for the current user or space
exports.getAllCards = async (req, res) => {
  try {
    const userId = req.user.id;
    const { spaceId } = req.query;
    
    console.log(`Getting cards for user ${userId} in space ${spaceId}`);
    
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
            console.log(`Space ${spaceId} not found`);
            return res.status(404).json({ success: false, message: 'Space not found' });
          }
          
          // Use the Space model's hasAccess method for proper permission checking
          if (!space.hasAccess(userId)) {
            console.log(`User ${userId} denied access to space ${spaceId}`);
            console.log(`Space details - isPublic: ${space.isPublic}, ownerId: ${space.ownerId}, members:`, space.members.map(m => ({ userId: m.userId, role: m.role })));
            return res.status(403).json({ success: false, message: 'Access denied to this space' });
          }
          
          console.log(`User ${userId} granted access to space ${spaceId}`);
          // User has access, get all cards in this space
          query = { spaceId: spaceId };
        } catch (spaceError) {
          console.error("Error checking space access:", spaceError);
          return res.status(500).json({ success: false, message: 'Error checking space access' });
        }
      }
    } else {
      // If no spaceId specified, get only user's cards using their email (for backwards compatibility)
      query = { userId: req.user.email };
    }
    
    const cards = await Card.find(query);
    console.log(`Found ${cards.length} cards for user ${userId} in space ${spaceId}`);
    res.json(cards);
  } catch (error) {
    console.error("Error fetching cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new card
exports.createCard = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { type, title, content, position, spaceId } = req.body;
    
    console.log(`User ${userId}/${userEmail} creating card in space ${spaceId}`);
    
    if (!type || !title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type and title are required' 
      });
    }
    
    // If spaceId is provided and not public, check if user has access to the space
    if (spaceId && spaceId !== 'public') {
      try {
        const space = await Space.findById(spaceId);
        if (!space) {
          return res.status(404).json({ 
            success: false, 
            message: 'Space not found' 
          });
        }
        
        // Check if user has access to this space
        if (!space.hasAccess(userId)) {
          console.log(`User ${userId} denied access to space ${spaceId} for card creation`);
          return res.status(403).json({ 
            success: false, 
            message: 'Access denied to this space' 
          });
        }
      } catch (spaceError) {
        console.error('Error checking space access for card creation:', spaceError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error checking space access' 
        });
      }
    }
    
    // Generate a UUID for the card
    const cardId = uuidv4();
    
    const newCard = new Card({
      _id: cardId, // Use UUID as string ID
      userId: userEmail, // Use email as userId for card ownership
      spaceId: spaceId || 'public', // Default to public space
      type,
      title,
      content: content || null,
      position: position || { x: 0, y: 0 }
    });
    
    await newCard.save();
    
    console.log(`Successfully created card ${cardId} for user ${userId}/${userEmail} in space ${spaceId}`);
    res.status(201).json(newCard);
  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a card
exports.updateCard = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`User ${userId}/${userEmail} attempting to update card ${id} with:`, updates);
    
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
    
    if (card.spaceId === 'public' || card.userId === userEmail) {
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
    
    res.json(card);
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a card
exports.deleteCard = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { id } = req.params;
    
    console.log(`User ${userId}/${userEmail} attempting to delete card ${id}`);
    
    // Find card first
    const card = await Card.findOne({ _id: id });
    
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found' 
      });
    }
    
    // Check if user has permission to delete this card
    let hasPermission = false;
    
    if (card.spaceId === 'public' || card.userId === userEmail) {
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
        message: 'You do not have permission to delete this card' 
      });
    }
    
    // Delete the card
    await Card.deleteOne({ _id: id });
    
    // Also remove any connections that involve this card
    // For public space, remove all connections
    // For private spaces, remove connections in the same space
    if (card.spaceId === 'public') {
      await Connection.deleteMany({
        spaceId: 'public',
        $or: [{ sourceId: id }, { targetId: id }]
      });
    } else {
      await Connection.deleteMany({
        spaceId: card.spaceId,
        $or: [{ sourceId: id }, { targetId: id }]
      });
    }
    
    console.log(`Successfully deleted card ${id} for user ${userId}/${userEmail}`);
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error("Error deleting card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete multiple cards
exports.deleteMultipleCards = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { ids } = req.body;
    
    console.log(`User ${userId}/${userEmail} attempting to delete multiple cards:`, ids);
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or empty card IDs array' 
      });
    }
    
    // Find all cards first
    const cards = await Card.find({ _id: { $in: ids } });
    
    if (cards.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No cards found' 
      });
    }
    
    // Check permissions for each card
    const allowedCardIds = [];
    const spaceMap = new Map();
    
    for (const card of cards) {
      let hasPermission = false;
      
      if (card.spaceId === 'public' || card.userId === userEmail) {
        hasPermission = true;
      } else if (card.spaceId && card.spaceId !== 'public') {
        // For private space cards, check if user has access to the space
        try {
          let space = spaceMap.get(card.spaceId);
          if (!space) {
            space = await Space.findById(card.spaceId);
            spaceMap.set(card.spaceId, space);
          }
          
          if (space) {
            const hasAccess = space.hasAccess(userId);
            if (hasAccess && space.canUserEdit(userId)) {
              hasPermission = true;
            }
          }
        } catch (spaceError) {
          console.error(`Error checking space permissions for card ${card._id}:`, spaceError);
        }
      }
      
      if (hasPermission) {
        allowedCardIds.push(card._id);
      }
    }
    
    if (allowedCardIds.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete any of these cards' 
      });
    }
    
    // Delete the allowed cards
    await Card.deleteMany({ _id: { $in: allowedCardIds } });
    
    // Also remove any connections that involve these cards
    // Group by space for efficient deletion
    const spaceCardMap = new Map();
    cards.forEach(card => {
      if (allowedCardIds.includes(card._id)) {
        const spaceId = card.spaceId || 'public';
        if (!spaceCardMap.has(spaceId)) {
          spaceCardMap.set(spaceId, []);
        }
        spaceCardMap.get(spaceId).push(card._id);
      }
    });
    
    // Delete connections for each space
    for (const [spaceId, cardIds] of spaceCardMap) {
      await Connection.deleteMany({
        spaceId: spaceId,
        $or: [
          { sourceId: { $in: cardIds } },
          { targetId: { $in: cardIds } }
        ]
      });
    }
    
    console.log(`Successfully deleted ${allowedCardIds.length} out of ${ids.length} cards for user ${userId}/${userEmail}`);
    
    res.json({ 
      success: true, 
      message: `${allowedCardIds.length} cards deleted successfully`,
      deleted: allowedCardIds.length,
      total: ids.length
    });
  } catch (error) {
    console.error("Error deleting multiple cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all connections for the current user or space
exports.getAllConnections = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { spaceId } = req.query;
    
    console.log(`Getting connections for user ${userId}/${userEmail} in space ${spaceId}`);
    
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
            console.log(`Space ${spaceId} not found`);
            return res.status(404).json({ success: false, message: 'Space not found' });
          }
          
          // Use the Space model's hasAccess method for proper permission checking
          if (!space.hasAccess(userId)) {
            console.log(`User ${userId} denied access to space ${spaceId}`);
            console.log(`Space details - isPublic: ${space.isPublic}, ownerId: ${space.ownerId}, members:`, space.members.map(m => ({ userId: m.userId, role: m.role })));
            return res.status(403).json({ success: false, message: 'Access denied to this space' });
          }
          
          console.log(`User ${userId} granted access to space ${spaceId}`);
          // User has access, get all connections in this space
          query = { spaceId: spaceId };
        } catch (spaceError) {
          console.error("Error checking space access:", spaceError);
          return res.status(500).json({ success: false, message: 'Error checking space access' });
        }
      }
    } else {
      // If no spaceId specified, get only user's personal connections (backwards compatibility)
      query = { userId: userEmail };
    }
    
    const connections = await Connection.find(query);
    console.log(`Found ${connections.length} connections for user ${userId} in space ${spaceId}`);
    res.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new connection
exports.createConnection = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { sourceId, targetId, label, spaceId } = req.body;
    
    console.log(`User ${userId}/${userEmail} creating connection between ${sourceId} and ${targetId} in space ${spaceId}`);
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target IDs are required' 
      });
    }
    
    if (sourceId === targetId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot connect a card to itself' 
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
    
    // Use the space from the cards themselves
    const cardSpaceId = sourceCard.spaceId || 'public';
    
    // Check if user has access to the space
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
          console.log(`User ${userId} denied access to space ${cardSpaceId} for connection creation`);
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
    
    // Check if connection already exists (bidirectional)
    const existingConnection = await Connection.findOne({
      spaceId: cardSpaceId,
      $or: [
        { sourceId: sourceId, targetId: targetId },
        { sourceId: targetId, targetId: sourceId }
      ]
    });
    
    if (existingConnection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Connection already exists between these cards' 
      });
    }
    
    // Generate a UUID for the connection
    const connectionId = uuidv4();
    
    const connection = new Connection({
      _id: connectionId,
      sourceId,
      targetId,
      label: label || '',
      userId: userEmail, // Use email for connection ownership
      spaceId: cardSpaceId
    });
    
    await connection.save();
    
    console.log(`Successfully created connection ${connectionId} for user ${userId}/${userEmail} in space ${cardSpaceId}`);
    res.status(201).json(connection);
  } catch (error) {
    console.error("Error creating connection:", error);
    
    // Handle duplicate connection error from pre-save hook
    if (error.code === 'DUPLICATE_CONNECTION') {
      return res.status(400).json({ 
        success: false, 
        message: 'Connection already exists between these cards' 
      });
    }
    
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a connection
exports.deleteConnection = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id;
    const { id } = req.params;
    
    console.log(`User ${userId}/${userEmail} attempting to delete connection ${id}`);
    
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
          console.log(`User ${userId} denied access to space ${connection.spaceId} for connection deletion`);
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
    
    console.log(`Successfully deleted connection ${id} for user ${userId}/${userEmail}`);
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
    const userEmail = req.user.email;
    const userId = req.user.id;
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

// Search cards across spaces with advanced filtering
exports.searchCards = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, spaceId, limit = 20, searchMode = 'global' } = req.query;
    
    console.log(`User ${userId} searching for "${query}" in mode ${searchMode}`);
    
    if (!query || query.trim() === '') {
      return res.json([]);
    }
    
    const searchTerm = query.trim();
    let searchQuery = {};
    
    if (searchMode === 'local' && spaceId) {
      // Local search - within specific space
      if (spaceId === 'public') {
        searchQuery = { spaceId: 'public' };
      } else {
        // Check if user has access to the space
        try {
          const space = await Space.findById(spaceId);
          if (!space || !space.hasAccess(userId)) {
            return res.status(403).json({ 
              success: false, 
              message: 'Access denied to this space' 
            });
          }
          searchQuery = { spaceId: spaceId };
        } catch (spaceError) {
          console.error("Error checking space access for search:", spaceError);
          return res.status(500).json({ 
            success: false, 
            message: 'Error checking space access' 
          });
        }
      }
    } else {
      // Global search - across all accessible spaces
      const userIdStr = userId.toString();
      
      // Get all spaces user has access to
      const accessibleSpaces = await Space.find({
        $or: [
          { ownerId: userIdStr },
          { 'members.userId': userIdStr },
          { isPublic: true }
        ]
      });
      
      const spaceIds = ['public', ...accessibleSpaces.map(space => space._id.toString())];
      
      searchQuery = {
        $or: [
          { spaceId: 'public' },
          { spaceId: { $in: spaceIds } }
        ]
      };
    }
    
    // Add text search criteria with MongoDB text search or regex
    const textSearchQuery = {
      $and: [
        searchQuery,
        {
          $or: [
            { title: { $regex: searchTerm, $options: 'i' } },
            { content: { $regex: searchTerm, $options: 'i' } }
          ]
        }
      ]
    };
    
    // Execute search with sorting by relevance
    const cards = await Card.find(textSearchQuery)
      .limit(parseInt(limit))
      .sort({
        // Prioritize category cards
        type: 1,
        // Then sort by creation date (newest first)
        createdAt: -1
      });
    
    // Calculate relevance scores
    const scoredResults = cards.map(card => {
      let score = 0;
      const titleLower = card.title.toLowerCase();
      const contentLower = (card.content || '').toLowerCase();
      const termLower = searchTerm.toLowerCase();
      
      // Category cards get 3x multiplier
      if (card.type === 'category') score += 30;
      
      // Title matches get highest priority
      if (titleLower.includes(termLower)) {
        score += 20;
        // Exact match gets maximum priority
        if (titleLower === termLower) score += 30;
        // Starts with term gets high priority
        if (titleLower.startsWith(termLower)) score += 15;
      }
      
      // Content matches get medium priority
      if (contentLower.includes(termLower)) {
        score += 10;
      }
      
      return {
        ...card.toJSON(),
        relevanceScore: score
      };
    });
    
    // Sort by relevance score
    const sortedResults = scoredResults.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.title.localeCompare(b.title);
    });
    
    console.log(`Found ${sortedResults.length} search results for "${searchTerm}"`);
    res.json(sortedResults);
    
  } catch (error) {
    console.error("Error searching cards:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Search failed: ' + error.message 
    });
  }
};