/**
 * Migration script to transfer data from JSON files to MongoDB
 * 
 * Run this script once after setting up MongoDB to migrate all existing data
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User');
const Card = require('../models/Card');
const Connection = require('../models/Connection');

// Import DB connection
const connectDB = require('./dbConnect');

// File paths
const dataDir = path.join(__dirname, '../data');
const cardsFile = path.join(dataDir, 'cards.json');
const connectionsFile = path.join(dataDir, 'connections.json');
const usersFile = path.join(dataDir, 'users.json');

// Helper function to read JSON file
const readJsonFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found: ${filePath}, returning empty array/object`);
      return filePath.endsWith('users.json') ? {} : [];
    }
    throw error;
  }
};

// Migrate users
const migrateUsers = async () => {
  try {
    console.log('Migrating users...');
    const usersData = await readJsonFile(usersFile);
    
    // Create an array of users from the object
    const users = Object.values(usersData);
    
    if (users.length === 0) {
      console.log('No users to migrate');
      return;
    }
    
    // Check if users already exist in MongoDB
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      console.log(`Skipping user migration: ${existingCount} users already exist in MongoDB`);
      return;
    }
    
    // Prepare users for MongoDB
    const mongoUsers = users.map(user => ({
      email: user.email,
      password: user.password, // Already hashed in the JSON file
      name: user.name,
      picture: user.picture || null,
      googleId: user.googleId || null,
      role: user.role || 'user',
      createdAt: user.createdAt ? new Date(user.createdAt) : new Date()
    }));
    
    // Insert users into MongoDB
    await User.insertMany(mongoUsers);
    console.log(`Migrated ${mongoUsers.length} users to MongoDB`);
  } catch (error) {
    console.error('Error migrating users:', error);
    throw error;
  }
};

// Migrate cards
const migrateCards = async () => {
  try {
    console.log('Migrating cards...');
    const cardsData = await readJsonFile(cardsFile);
    
    if (cardsData.length === 0) {
      console.log('No cards to migrate');
      return;
    }
    
    // Check if cards already exist in MongoDB
    const existingCount = await Card.countDocuments();
    if (existingCount > 0) {
      console.log(`Skipping card migration: ${existingCount} cards already exist in MongoDB`);
      return;
    }
    
    // Prepare cards for MongoDB and filter out invalid ones
    const validCards = cardsData.filter(card => card.userId && card.id);
    console.log(`Found ${validCards.length} valid cards out of ${cardsData.length} total cards`);
    
    if (validCards.length === 0) {
      console.log('No valid cards to migrate');
      return;
    }
    
    const mongoCards = validCards.map(card => ({
      _id: card.id, // Use the UUID as string ID
      userId: card.userId,
      type: card.type || 'note', // Default type if missing
      title: card.title || 'Untitled', // Default title if missing
      content: card.content || null,
      position: card.position || { x: 0, y: 0 },
      createdAt: card.createdAt ? new Date(card.createdAt) : new Date(),
      updatedAt: card.updatedAt ? new Date(card.updatedAt) : new Date()
    }));
    
    // Insert cards into MongoDB in smaller batches to avoid issues
    const batchSize = 20;
    for (let i = 0; i < mongoCards.length; i += batchSize) {
      const batch = mongoCards.slice(i, i + batchSize);
      await Card.insertMany(batch, { ordered: false });
      console.log(`Migrated batch ${i/batchSize + 1} of ${Math.ceil(mongoCards.length/batchSize)}`);
    }
    
    console.log(`Migrated ${mongoCards.length} cards to MongoDB`);
  } catch (error) {
    console.error('Error migrating cards:', error);
    throw error;
  }
};

// Migrate connections
const migrateConnections = async () => {
  try {
    console.log('Migrating connections...');
    const connectionsData = await readJsonFile(connectionsFile);
    
    if (connectionsData.length === 0) {
      console.log('No connections to migrate');
      return;
    }
    
    // Check if connections already exist in MongoDB
    const existingCount = await Connection.countDocuments();
    if (existingCount > 0) {
      console.log(`Skipping connection migration: ${existingCount} connections already exist in MongoDB`);
      return;
    }
    
    // Filter out invalid connections
    const validConnections = connectionsData.filter(conn => 
      conn.userId && conn.sourceId && conn.targetId && conn.id
    );
    
    console.log(`Found ${validConnections.length} valid connections out of ${connectionsData.length} total connections`);
    
    if (validConnections.length === 0) {
      console.log('No valid connections to migrate');
      return;
    }
    
    // Prepare connections for MongoDB
    const mongoConnections = validConnections.map(conn => ({
      _id: conn.id, // Use the UUID as string ID
      userId: conn.userId,
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      label: conn.label || null,
      createdAt: conn.createdAt ? new Date(conn.createdAt) : new Date()
    }));
    
    // Insert connections into MongoDB
    await Connection.insertMany(mongoConnections, { ordered: false });
    console.log(`Migrated ${mongoConnections.length} connections to MongoDB`);
  } catch (error) {
    console.error('Error migrating connections:', error);
    throw error;
  }
};

// Main migration function
const migrate = async () => {
  try {
    console.log('Starting migration from JSON files to MongoDB...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Run migrations
    await migrateUsers();
    await migrateCards();
    await migrateConnections();
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
migrate(); 