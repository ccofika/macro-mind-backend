const { v4: uuidv4 } = require('uuid');
const fileUtils = require('../utils/fileUtils');

// Get all cards
exports.getAllCards = async (req, res) => {
  try {
    const cards = await fileUtils.readCards();
    res.json(cards);
  } catch (error) {
    console.error("Error fetching cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new card
exports.createCard = async (req, res) => {
  try {
    const { type, title, content, position } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type and title are required' 
      });
    }
    
    const newCard = {
      id: uuidv4(),
      type,
      title,
      content: content || null,
      position: position || { x: 0, y: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const cards = await fileUtils.readCards();
    cards.push(newCard);
    await fileUtils.writeCards(cards);
    
    res.status(201).json(newCard);
  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a card
exports.updateCard = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const cards = await fileUtils.readCards();
    const cardIndex = cards.findIndex(card => card.id === id);
    
    if (cardIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found' 
      });
    }
    
    // Update card with new information
    cards[cardIndex] = {
      ...cards[cardIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Ensure position is valid
    if (!cards[cardIndex].position || typeof cards[cardIndex].position !== 'object') {
      cards[cardIndex].position = { x: 0, y: 0 };
    }
    
    await fileUtils.writeCards(cards);
    res.json(cards[cardIndex]);
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a card
exports.deleteCard = async (req, res) => {
  try {
    const { id } = req.params;
    
    const cards = await fileUtils.readCards();
    const updatedCards = cards.filter(card => card.id !== id);
    
    if (cards.length === updatedCards.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found' 
      });
    }
    
    // Save updated cards list
    await fileUtils.writeCards(updatedCards);
    
    // Also remove any connections that involve this card
    const connections = await fileUtils.readConnections();
    const updatedConnections = connections.filter(
      conn => conn.sourceId !== id && conn.targetId !== id
    );
    
    if (connections.length !== updatedConnections.length) {
      await fileUtils.writeConnections(updatedConnections);
    }
    
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error("Error deleting card:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all connections
exports.getAllConnections = async (req, res) => {
  try {
    const connections = await fileUtils.readConnections();
    res.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new connection
exports.createConnection = async (req, res) => {
  try {
    const { sourceId, targetId } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target IDs are required' 
      });
    }
    
    // Check if cards exist
    const cards = await fileUtils.readCards();
    const sourceExists = cards.some(card => card.id === sourceId);
    const targetExists = cards.some(card => card.id === targetId);
    
    if (!sourceExists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Source card not found' 
      });
    }
    
    if (!targetExists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Target card not found' 
      });
    }
    
    // Check if connection already exists
    const connections = await fileUtils.readConnections();
    const connectionExists = connections.some(
      conn => conn.sourceId === sourceId && conn.targetId === targetId
    );
    
    if (connectionExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Connection already exists' 
      });
    }
    
    const newConnection = {
      id: uuidv4(),
      sourceId,
      targetId,
      createdAt: new Date().toISOString()
    };
    
    connections.push(newConnection);
    await fileUtils.writeConnections(connections);
    
    res.status(201).json(newConnection);
  } catch (error) {
    console.error("Error creating connection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a connection
exports.deleteConnection = async (req, res) => {
  try {
    const { id } = req.params;
    
    const connections = await fileUtils.readConnections();
    const updatedConnections = connections.filter(conn => conn.id !== id);
    
    if (connections.length === updatedConnections.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Connection not found' 
      });
    }
    
    await fileUtils.writeConnections(updatedConnections);
    
    res.json({ success: true, message: 'Connection deleted successfully' });
  } catch (error) {
    console.error("Error deleting connection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Save current canvas state
exports.saveCanvasState = async (req, res) => {
  try {
    // U stvarnoj implementaciji, trebalo bi da sačuvamo canvas state u bazi
    // Za sada samo vraćamo uspešan odgovor
    res.json({ success: true, message: 'Canvas state saved' });
  } catch (error) {
    console.error("Error saving canvas state:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Bulk update card positions
exports.updateCardPositions = async (req, res) => {
  try {
    const { positions } = req.body;
    
    if (!Array.isArray(positions)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Positions must be an array' 
      });
    }
    
    const cards = await fileUtils.readCards();
    let updated = false;
    
    positions.forEach(item => {
      if (!item.id || !item.position) return;
      
      const cardIndex = cards.findIndex(card => card.id === item.id);
      if (cardIndex !== -1) {
        cards[cardIndex].position = item.position;
        cards[cardIndex].updatedAt = new Date().toISOString();
        updated = true;
      }
    });
    
    if (updated) {
      await fileUtils.writeCards(cards);
    }
    
    res.json({ success: true, message: 'Card positions updated' });
  } catch (error) {
    console.error("Error updating card positions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete multiple cards
exports.deleteMultipleCards = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Card IDs array is required' 
      });
    }
    
    // Create a Set for faster lookups
    const idsSet = new Set(ids);
    
    // Remove cards
    const cards = await fileUtils.readCards();
    const updatedCards = cards.filter(card => !idsSet.has(card.id));
    
    // If no cards were deleted, return 404
    if (cards.length === updatedCards.length) {
      return res.status(404).json({
        success: false,
        message: 'No cards found with the provided IDs'
      });
    }
    
    await fileUtils.writeCards(updatedCards);
    
    // Also remove any connections that involve these cards
    const connections = await fileUtils.readConnections();
    const updatedConnections = connections.filter(
      conn => !idsSet.has(conn.sourceId) && !idsSet.has(conn.targetId)
    );
    
    if (connections.length !== updatedConnections.length) {
      await fileUtils.writeConnections(updatedConnections);
    }
    
    res.json({ 
      success: true, 
      message: `${cards.length - updatedCards.length} cards deleted successfully` 
    });
  } catch (error) {
    console.error("Error deleting multiple cards:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};