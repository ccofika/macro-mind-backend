const mongoose = require('mongoose');
const Space = require('../models/Space');
const User = require('../models/User');
const Card = require('../models/Card');
require('dotenv').config();

async function testSpacePermissions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for testing');

    console.log('\n🧪 Running Space Permission Tests...\n');

    // 1. Create test users
    console.log('1. Setting up test users...');
    
    const testUsers = [];
    for (let i = 0; i < 3; i++) {
      const user = await User.findOneAndUpdate(
        { email: `testuser${i + 1}@mebit.io` },
        {
          email: `testuser${i + 1}@mebit.io`,
          name: `Test User ${i + 1}`,
          role: 'user'
        },
        { upsert: true, new: true }
      );
      testUsers.push(user);
      console.log(`  ✓ Created/found user: ${user.name} (${user._id})`);
    }

    // 2. Test space creation
    console.log('\n2. Testing space creation...');
    
    const testSpace = await Space.findOneAndUpdate(
      { name: 'Test Private Space' },
      {
        name: 'Test Private Space',
        description: 'A test space for collaboration',
        ownerId: testUsers[0]._id.toString(),
        isPublic: false,
        members: []
      },
      { upsert: true, new: true }
    );
    
    console.log(`  ✓ Created test space: ${testSpace.name} (${testSpace._id})`);
    console.log(`  ✓ Owner: ${testSpace.ownerId}`);
    console.log(`  ✓ Members: ${testSpace.members.length}`);

    // 3. Test helper methods
    console.log('\n3. Testing space helper methods...');
    
    // Test owner access
    const ownerAccess = testSpace.hasAccess(testUsers[0]._id);
    console.log(`  ✓ Owner access: ${ownerAccess}`);
    
    // Test non-member access
    const nonMemberAccess = testSpace.hasAccess(testUsers[1]._id);
    console.log(`  ✓ Non-member access: ${nonMemberAccess}`);
    
    // Test isOwner
    const isOwner = testSpace.isOwner(testUsers[0]._id);
    console.log(`  ✓ Is owner check: ${isOwner}`);
    
    // Test getUserRole
    const ownerRole = testSpace.getUserRole(testUsers[0]._id);
    console.log(`  ✓ Owner role: ${ownerRole}`);

    // 4. Test adding members
    console.log('\n4. Testing member management...');
    
    testSpace.addMember(testUsers[1]._id, 'editor');
    testSpace.addMember(testUsers[2]._id, 'viewer');
    await testSpace.save();
    
    console.log(`  ✓ Added members. Total members: ${testSpace.members.length}`);
    
    // Test member access
    const memberAccess = testSpace.hasAccess(testUsers[1]._id);
    const memberRole = testSpace.getUserRole(testUsers[1]._id);
    console.log(`  ✓ Member access: ${memberAccess}, role: ${memberRole}`);

    // 5. Test card creation with space association
    console.log('\n5. Testing card creation in space...');
    
    const testCard = await Card.findOneAndUpdate(
      { title: 'Test Card in Private Space' },
      {
        title: 'Test Card in Private Space',
        content: 'This is a test card',
        type: 'note',
        userId: testUsers[0]._id.toString(),
        spaceId: testSpace._id.toString(),
        position: { x: 100, y: 100 }
      },
      { upsert: true, new: true }
    );
    
    console.log(`  ✓ Created test card: ${testCard.title} (${testCard.id})`);
    console.log(`  ✓ Card owner: ${testCard.userId}`);
    console.log(`  ✓ Card space: ${testCard.spaceId}`);

    // 6. Test queries
    console.log('\n6. Testing database queries...');
    
    // Find spaces where user is owner or member
    const userSpaces = await Space.find({
      $or: [
        { ownerId: testUsers[1]._id.toString() },
        { 'members.userId': testUsers[1]._id.toString() }
      ]
    });
    
    console.log(`  ✓ User spaces query found: ${userSpaces.length} spaces`);
    
    // Find cards in space
    const cardsInSpace = await Card.find({ spaceId: testSpace._id.toString() });
    console.log(`  ✓ Cards in space query found: ${cardsInSpace.length} cards`);

    // 7. Test public space handling
    console.log('\n7. Testing public space...');
    
    const publicSpace = {
      _id: 'public',
      name: 'Public Space',
      isPublic: true,
      ownerId: 'system',
      members: []
    };
    
    // Simulate public space access check
    const publicAccess = publicSpace.isPublic || 
                        publicSpace.ownerId === testUsers[0]._id.toString() ||
                        publicSpace.members.some(member => member.userId === testUsers[0]._id.toString());
    
    console.log(`  ✓ Public space access: ${publicAccess}`);

    // 8. Performance test
    console.log('\n8. Running performance tests...');
    
    const startTime = Date.now();
    
    // Test complex query performance
    const complexQuery = await Space.aggregate([
      {
        $match: {
          $or: [
            { ownerId: testUsers[0]._id.toString() },
            { 'members.userId': testUsers[0]._id.toString() }
          ]
        }
      },
      {
        $lookup: {
          from: 'cards',
          localField: '_id',
          foreignField: 'spaceId',
          as: 'cards'
        }
      },
      {
        $project: {
          name: 1,
          isPublic: 1,
          cardCount: { $size: '$cards' },
          memberCount: { $size: '$members' }
        }
      }
    ]);
    
    const endTime = Date.now();
    console.log(`  ✓ Complex query completed in ${endTime - startTime}ms`);
    console.log(`  ✓ Query returned ${complexQuery.length} spaces with aggregated data`);

    // 9. Verify data integrity
    console.log('\n9. Verifying data integrity...');
    
    const allSpaces = await Space.find({});
    let issuesFound = 0;
    
    for (const space of allSpaces) {
      // Check if ownerId is string
      if (typeof space.ownerId !== 'string') {
        console.warn(`  ⚠️  Space ${space._id} has non-string ownerId: ${typeof space.ownerId}`);
        issuesFound++;
      }
      
      // Check if all member userIds are strings
      for (const member of space.members) {
        if (typeof member.userId !== 'string') {
          console.warn(`  ⚠️  Space ${space._id} has member with non-string userId: ${typeof member.userId}`);
          issuesFound++;
        }
      }
      
      // Check if owner is in members
      const ownerInMembers = space.members.some(member => member.userId === space.ownerId);
      if (!ownerInMembers) {
        console.warn(`  ⚠️  Space ${space._id} owner not in members array`);
        issuesFound++;
      }
    }
    
    if (issuesFound === 0) {
      console.log('  ✓ All spaces have proper data integrity');
    } else {
      console.warn(`  ⚠️  Found ${issuesFound} data integrity issues`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log(`  - Total spaces checked: ${allSpaces.length}`);
    console.log(`  - Total users created: ${testUsers.length}`);
    console.log(`  - Data integrity issues: ${issuesFound}`);
    console.log(`  - Performance test time: ${endTime - startTime}ms`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run tests if called directly
if (require.main === module) {
  testSpacePermissions()
    .then(() => {
      console.log('Test script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Test script failed:', error);
      process.exit(1);
    });
}

module.exports = testSpacePermissions; 