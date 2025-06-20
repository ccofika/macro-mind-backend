const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Card = require('./models/Card');
const Space = require('./models/Space');
const Connection = require('./models/Connection');

async function debugAdminData() {
  try {
    console.log('🔍 Starting Admin Data Debug...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Check Users
    console.log('👥 === USER DATA ANALYSIS ===');
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    });
    console.log(`Total users: ${totalUsers}`);
    console.log(`Active users (last 30 days): ${activeUsers}`);
    
    const sampleUsers = await User.find().limit(3).select('name email createdAt lastLogin');
    console.log('Sample users:');
    sampleUsers.forEach(user => {
      console.log(`  - ${user.name || 'No name'} (${user.email})`);
      console.log(`    Created: ${user.createdAt}`);
      console.log(`    Last login: ${user.lastLogin || 'Never'}`);
    });

    // 2. Check Spaces
    console.log('\n🏢 === SPACE DATA ANALYSIS ===');
    const totalSpaces = await Space.countDocuments();
    const publicSpaces = await Space.countDocuments({ isPublic: true });
    const privateSpaces = await Space.countDocuments({ isPublic: false });
    console.log(`Total spaces: ${totalSpaces}`);
    console.log(`Public spaces: ${publicSpaces}`);
    console.log(`Private spaces: ${privateSpaces}`);
    
    const sampleSpaces = await Space.find().limit(5).select('name isPublic ownerId members');
    console.log('Sample spaces:');
    sampleSpaces.forEach(space => {
      console.log(`  - "${space.name}" (${space.isPublic ? 'Public' : 'Private'})`);
      console.log(`    Owner: ${space.ownerId}`);
      console.log(`    Members: ${space.members?.length || 0}`);
    });

    // 3. Check Cards
    console.log('\n📚 === CARD DATA ANALYSIS ===');
    const totalCards = await Card.countDocuments();
    const cardsByType = await Card.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log(`Total cards: ${totalCards}`);
    console.log('Cards by type:');
    cardsByType.forEach(type => {
      console.log(`  - ${type._id}: ${type.count}`);
    });

    const cardsByUser = await Card.aggregate([
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    console.log('Top card creators:');
    cardsByUser.forEach(user => {
      console.log(`  - User ${user._id}: ${user.count} cards`);
    });

    // 4. Check Connections
    console.log('\n🔗 === CONNECTION DATA ANALYSIS ===');
    const totalConnections = await Connection.countDocuments();
    console.log(`Total connections: ${totalConnections}`);
    
    if (totalConnections > 0) {
      const connectionsByUser = await Connection.aggregate([
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      console.log('Top connection creators:');
      connectionsByUser.forEach(user => {
        console.log(`  - User ${user._id}: ${user.count} connections`);
      });
    }

    // 5. Test User-Space-Card relationships
    console.log('\n🔗 === RELATIONSHIP ANALYSIS ===');
    
    // Get first user and analyze their data
    const firstUser = await User.findOne();
    if (firstUser) {
      console.log(`\nAnalyzing user: ${firstUser.name} (${firstUser.email})`);
      console.log(`User ID: ${firstUser._id} (type: ${typeof firstUser._id})`);
      
      // Find spaces owned by this user
      const userSpaces = await Space.find({
        $or: [
          { ownerId: firstUser._id },
          { ownerId: firstUser._id.toString() }
        ]
      });
      console.log(`Spaces owned by user: ${userSpaces.length}`);
      userSpaces.forEach(space => {
        console.log(`  - "${space.name}" (owner: ${space.ownerId}, type: ${typeof space.ownerId})`);
      });
      
      // Find cards created by this user
      const userCards = await Card.find({
        $or: [
          { userId: firstUser._id },
          { userId: firstUser._id.toString() },
          { userId: firstUser.email }
        ]
      });
      console.log(`Cards created by user: ${userCards.length}`);
      if (userCards.length > 0) {
        console.log('Sample card userIds:');
        userCards.slice(0, 3).forEach(card => {
          console.log(`  - Card "${card.title}": userId=${card.userId} (type: ${typeof card.userId})`);
        });
      }
    }

    // 6. Test the exact aggregation pipeline
    console.log('\n🧪 === TESTING AGGREGATION PIPELINE ===');
    
    const testAggregation = await User.aggregate([
      { $limit: 1 },
      {
        $lookup: {
          from: "cards",
          let: { userId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: [{ $toString: "$userId" }, "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "userCards"
        }
      },
      {
        $lookup: {
          from: "spaces",
          let: { userId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$ownerId", "$$userId"] },
                    { $eq: [{ $toString: "$ownerId" }, "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "ownedSpaces"
        }
      },
      {
        $addFields: {
          cardCount: { $size: "$userCards" },
          spaceCount: { $size: "$ownedSpaces" }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          cardCount: 1,
          spaceCount: 1
        }
      }
    ]);
    
    if (testAggregation.length > 0) {
      console.log('✅ Aggregation test result:', testAggregation[0]);
    } else {
      console.log('❌ Aggregation returned no results');
    }

    console.log('\n✅ Debug analysis completed!');

  } catch (error) {
    console.error('💥 Debug error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

debugAdminData(); 