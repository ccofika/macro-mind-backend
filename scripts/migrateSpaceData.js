const mongoose = require('mongoose');
const Space = require('../models/Space');
const User = require('../models/User');
const Card = require('../models/Card');
require('dotenv').config();

async function migrateSpaceData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for migration');

    // 1. Migrate all spaces to ensure owner and member IDs are strings
    console.log('1. Migrating space ownership and membership data...');
    const spaces = await Space.find({});
    
    for (const space of spaces) {
      let needsUpdate = false;
      
      // Convert ownerId to string if it's ObjectId
      if (space.ownerId && typeof space.ownerId !== 'string') {
        space.ownerId = space.ownerId.toString();
        needsUpdate = true;
        console.log(`  - Converting ownerId for space ${space._id}`);
      }
      
      // Convert member userIds to strings
      if (space.members && space.members.length > 0) {
        space.members.forEach(member => {
          if (member.userId && typeof member.userId !== 'string') {
            member.userId = member.userId.toString();
            needsUpdate = true;
            console.log(`  - Converting member userId for space ${space._id}`);
          }
        });
      }
      
      // Ensure owner is in members array
      const ownerInMembers = space.members.some(member => member.userId === space.ownerId);
      if (!ownerInMembers) {
        space.members.push({
          userId: space.ownerId,
          role: 'owner',
          addedAt: new Date()
        });
        needsUpdate = true;
        console.log(`  - Added owner to members for space ${space._id}`);
      }
      
      if (needsUpdate) {
        await space.save();
        console.log(`  ✓ Updated space ${space._id} (${space.name})`);
      }
    }

    // 2. Migrate all cards to ensure userIds and spaceIds are strings
    console.log('2. Migrating card ownership data...');
    const cards = await Card.find({});
    
    for (const card of cards) {
      let needsUpdate = false;
      
      // Convert userId to string if it's ObjectId
      if (card.userId && typeof card.userId !== 'string') {
        card.userId = card.userId.toString();
        needsUpdate = true;
        console.log(`  - Converting userId for card ${card._id}`);
      }
      
      // Ensure spaceId is string
      if (card.spaceId && typeof card.spaceId !== 'string') {
        card.spaceId = card.spaceId.toString();
        needsUpdate = true;
        console.log(`  - Converting spaceId for card ${card._id}`);
      }
      
      // Set default spaceId if missing
      if (!card.spaceId) {
        card.spaceId = 'public';
        needsUpdate = true;
        console.log(`  - Setting default spaceId for card ${card._id}`);
      }
      
      if (needsUpdate) {
        await card.save();
        console.log(`  ✓ Updated card ${card._id}`);
      }
    }

    // 3. Create indexes for better performance
    console.log('3. Creating database indexes...');
    
    try {
      await Space.collection.createIndex({ ownerId: 1 });
      await Space.collection.createIndex({ 'members.userId': 1 });
      await Card.collection.createIndex({ userId: 1, spaceId: 1, type: 1 });
      console.log('  ✓ Created database indexes');
    } catch (error) {
      console.log('  - Indexes may already exist:', error.message);
    }

    // 4. Verify migration
    console.log('4. Verifying migration...');
    
    const totalSpaces = await Space.countDocuments();
    const totalCards = await Card.countDocuments();
    const totalUsers = await User.countDocuments();
    
    console.log(`  ✓ Total spaces: ${totalSpaces}`);
    console.log(`  ✓ Total cards: ${totalCards}`);
    console.log(`  ✓ Total users: ${totalUsers}`);
    
    // Check for any remaining ObjectId issues
    const spacesWithObjectIds = await Space.find({
      $or: [
        { ownerId: { $type: 'objectId' } },
        { 'members.userId': { $type: 'objectId' } }
      ]
    });
    
    if (spacesWithObjectIds.length > 0) {
      console.warn(`  ⚠️  Found ${spacesWithObjectIds.length} spaces with ObjectId issues`);
    } else {
      console.log('  ✓ All spaces have proper string IDs');
    }

    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateSpaceData()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateSpaceData; 