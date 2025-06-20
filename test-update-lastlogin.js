const User = require('./models/User');
const Card = require('./models/Card');
const Connection = require('./models/Connection');
const AIChatConversation = require('./models/AIChatConversation');
require('./utils/dbConnect');

async function updateLastLoginForTestUsers() {
  try {
    console.log('🔄 Updating lastLogin for test users...\n');

    // Get all users
    const users = await User.find();
    console.log(`📊 Found ${users.length} users`);

    if (users.length === 0) {
      console.log('⚠️ No users found in database');
      return;
    }

    // Update lastLogin for some users to test active users functionality
    const now = new Date();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    let updatedCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      let newLastLogin;

      // Distribute users across different login times
      if (i % 4 === 0) {
        newLastLogin = now; // Very recent
      } else if (i % 4 === 1) {
        newLastLogin = twentyFourHoursAgo; // Active within 24h
      } else if (i % 4 === 2) {
        newLastLogin = sevenDaysAgo; // Active within 7d
      } else {
        newLastLogin = thirtyDaysAgo; // Active within 30d
      }

      try {
        await User.findByIdAndUpdate(user._id, {
          lastLogin: newLastLogin
        });
        updatedCount++;
        console.log(`✅ Updated ${user.name} (${user.email}) - lastLogin: ${newLastLogin.toISOString()}`);
      } catch (error) {
        console.error(`❌ Error updating ${user.email}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully updated lastLogin for ${updatedCount} users`);

    // Display statistics
    const activeUsers24h = await User.countDocuments({ 
      lastLogin: { $gte: new Date(now - 24 * 60 * 60 * 1000) } 
    });
    const activeUsers7d = await User.countDocuments({ 
      lastLogin: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } 
    });
    const activeUsers30d = await User.countDocuments({ 
      lastLogin: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } 
    });

    console.log('\n📊 Active Users Statistics:');
    console.log(`  - Active in last 24h: ${activeUsers24h}`);
    console.log(`  - Active in last 7d: ${activeUsers7d}`);
    console.log(`  - Active in last 30d: ${activeUsers30d}`);
    console.log(`  - Total users: ${users.length}`);

    // Also create some test cards and activity if there are none
    const cardCount = await Card.countDocuments();
    console.log(`\n📊 Current database stats:`);
    console.log(`  - Cards: ${cardCount}`);
    console.log(`  - Connections: ${await Connection.countDocuments()}`);
    console.log(`  - AI Conversations: ${await AIChatConversation.countDocuments()}`);

    if (cardCount < 5) {
      console.log('\n🔄 Creating some test cards for recent activity...');
      
      for (let i = 0; i < Math.min(5, users.length); i++) {
        const user = users[i];
        try {
          await Card.create({
            userId: user._id.toString(),
            spaceId: 'public',
            type: 'note',
            title: `Test Card ${i + 1}`,
            content: `This is a test card created for demonstration purposes.`,
            position: { x: i * 100, y: i * 50 }
          });
          console.log(`✅ Created test card for ${user.name}`);
        } catch (error) {
          console.error(`❌ Error creating card for ${user.email}:`, error.message);
        }
      }
    }

    console.log('\n🎉 Test data update completed!');
    console.log('Now you can test the admin dashboard to see active users and recent activity.');

  } catch (error) {
    console.error('💥 Error updating test data:', error);
  } finally {
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  updateLastLoginForTestUsers();
}

module.exports = { updateLastLoginForTestUsers }; 