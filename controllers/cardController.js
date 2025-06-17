const { v4: uuidv4 } = require('uuid');
const Card = require('../models/Card');
const Connection = require('../models/Connection');
const User = require('../models/User');

// Get all cards for the current user
exports.getAllCards = async (req, res) => {
  try {
    const userId = req.user.email;
    const cards = await Card.find({ userId });
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
    const { type, title, content, position } = req.body;
    
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
    
    // Find card and ensure it belongs to the user
    const card = await Card.findOne({ _id: id, userId });
    
    if (!card) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card not found or you do not have permission to edit it' 
      });
    }
    
    // Update card with new information
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'userId') {
        card[key] = updates[key];
      }
    });
    
    // Ensure position is valid
    if (!card.position || typeof card.position !== 'object') {
      card.position = { x: 0, y: 0 };
    }
    
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

// Get all connections for the current user
exports.getAllConnections = async (req, res) => {
  try {
    const userId = req.user.email;
    const connections = await Connection.find({ userId });
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
    const { sourceId, targetId, label } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target IDs are required' 
      });
    }
    
    // Check if cards exist and belong to the user
    const sourceCard = await Card.findOne({ _id: sourceId, userId });
    const targetCard = await Card.findOne({ _id: targetId, userId });
    
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
    
    // Check if connection already exists
    const existingConnection = await Connection.findOne({
      userId,
      sourceId,
      targetId
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
      sourceId,
      targetId,
      label: label || null
    });
    
    await newConnection.save();
    
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
    
    // Find and delete the connection
    const result = await Connection.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Connection not found or you do not have permission to delete it' 
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
    
    console.log(`Updating positions for ${positions.length} cards`);
    
    // Update each card's position in the database
    const updatePromises = positions.map(item => {
      if (!item.id || !item.position) {
        console.log(`Skipping invalid position update: ${JSON.stringify(item)}`);
        return Promise.resolve();
      }
      
      console.log(`Updating card ${item.id} to position:`, item.position);
      
      return Card.findOneAndUpdate(
        { _id: item.id, userId },
        { $set: { position: item.position } },
        { new: true }
      ).catch(err => {
        console.error(`Error updating card ${item.id}:`, err);
        return null;
      });
    });
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(result => result !== null).length;
    
    console.log(`Successfully updated ${successCount} out of ${positions.length} card positions`);
    
    res.json({ 
      success: true, 
      message: `Updated ${successCount} card positions` 
    });
  } catch (error) {
    console.error("Error updating card positions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};