const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '../data');
const cardsFile = path.join(dataDir, 'cards.json');
const connectionsFile = path.join(dataDir, 'connections.json');
const usersFile = path.join(dataDir, 'users.json');

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
exports.readCards = async (userId) => {
  try {
    await ensureDataDir();
    
    try {
      const data = await fs.readFile(cardsFile, 'utf8');
      const allCards = JSON.parse(data);
      
      // If userId is provided, filter cards by user
      if (userId) {
        return allCards.filter(card => card.userId === userId);
      }
      
      return allCards;
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
exports.readConnections = async (userId) => {
  try {
    await ensureDataDir();
    
    try {
      const data = await fs.readFile(connectionsFile, 'utf8');
      const allConnections = JSON.parse(data);
      
      // If userId is provided, filter connections by user
      if (userId) {
        return allConnections.filter(conn => conn.userId === userId);
      }
      
      return allConnections;
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

// User related functions
exports.readUsers = async () => {
  try {
    await ensureDataDir();
    
    try {
      const data = await fs.readFile(usersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create default users if file doesn't exist
        const defaultUsers = {
          'admin@mebit.io': {
            email: 'admin@mebit.io',
            password: await bcrypt.hash('test123', 10),
            name: 'Admin User',
            role: 'admin',
            createdAt: new Date().toISOString()
          },
          'agent@mebit.io': {
            email: 'agent@mebit.io',
            password: await bcrypt.hash('pass456', 10),
            name: 'Agent User',
            role: 'user',
            createdAt: new Date().toISOString()
          }
        };
        
        await fs.writeFile(usersFile, JSON.stringify(defaultUsers, null, 2), 'utf8');
        return defaultUsers;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reading users:', error);
    throw new Error('Failed to read users data');
  }
};

exports.writeUsers = async (users) => {
  try {
    await ensureDataDir();
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing users:', error);
    throw new Error('Failed to write users data');
  }
};

exports.findUserByEmail = async (email) => {
  const users = await this.readUsers();
  return users[email] || null;
};

exports.createUser = async (userData) => {
  const users = await this.readUsers();
  
  if (users[userData.email]) {
    throw new Error('User already exists');
  }
  
  // Hash password if provided
  if (userData.password) {
    userData.password = await bcrypt.hash(userData.password, 10);
  }
  
  users[userData.email] = {
    ...userData,
    createdAt: new Date().toISOString()
  };
  
  await this.writeUsers(users);
  
  // Return user without password
  const { password, ...userWithoutPassword } = users[userData.email];
  return userWithoutPassword;
};