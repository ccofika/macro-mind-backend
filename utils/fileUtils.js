const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const cardsFile = path.join(dataDir, 'cards.json');
const connectionsFile = path.join(dataDir, 'connections.json');

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

// Read cards from JSON file
exports.readCards = async () => {
  try {
    await ensureDataDir();
    
    try {
      const data = await fs.readFile(cardsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create empty file if it doesn't exist
        await fs.writeFile(cardsFile, '[]', 'utf8');
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reading cards:', error);
    throw new Error('Failed to read cards data');
  }
};

// Write cards to JSON file
exports.writeCards = async (cards) => {
  try {
    await ensureDataDir();
    
    // Ensure position data is stored correctly
    const validCards = cards.map(card => {
      if (!card.position || typeof card.position !== 'object') {
        card.position = { x: 0, y: 0 };
      }
      return card;
    });
    
    await fs.writeFile(cardsFile, JSON.stringify(validCards, null, 2), 'utf8');
    console.log('Cards saved successfully:', validCards.length, 'cards');
    return true;
  } catch (error) {
    console.error('Error writing cards:', error);
    throw new Error('Failed to write cards data');
  }
};

// Read connections from JSON file
exports.readConnections = async () => {
  try {
    await ensureDataDir();
    
    try {
      const data = await fs.readFile(connectionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create empty file if it doesn't exist
        await fs.writeFile(connectionsFile, '[]', 'utf8');
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reading connections:', error);
    throw new Error('Failed to read connections data');
  }
};

// Write connections to JSON file
exports.writeConnections = async (connections) => {
  try {
    await ensureDataDir();
    await fs.writeFile(connectionsFile, JSON.stringify(connections, null, 2), 'utf8');
    console.log('Connections saved successfully:', connections.length, 'connections');
    return true;
  } catch (error) {
    console.error('Error writing connections:', error);
    throw new Error('Failed to write connections data');
  }
};