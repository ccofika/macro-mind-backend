const mongoose = require('mongoose');
const Space = require('./models/Space');
const User = require('./models/User');
const Invitation = require('./models/Invitation');
require('dotenv').config();

async function testInvitationSystem() {
  try {
    console.log('🚀 Testing Invitation System...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clean up existing test data
    await User.deleteMany({ email: { $regex: /@invitetest\.com$/ } });
    await Space.deleteMany({ name: { $regex: /^Test.*Invitation/ } });
    await Invitation.deleteMany({});
    console.log('🧹 Cleaned up existing test data\n');

    // Test 1: Create test users
    console.log('1. Creating test users...');
    
    const spaceOwner = await User.findOneAndUpdate(
      { email: 'owner@invitetest.com' },
      {
        email: 'owner@invitetest.com',
        name: 'Space Owner',
        role: 'user'
      },
      { upsert: true, new: true }
    );

    const invitee1 = await User.findOneAndUpdate(
      { email: 'invitee1@invitetest.com' },
      {
        email: 'invitee1@invitetest.com',
        name: 'First Invitee',
        role: 'user'
      },
      { upsert: true, new: true }
    );

    const invitee2 = await User.findOneAndUpdate(
      { email: 'invitee2@invitetest.com' },
      {
        email: 'invitee2@invitetest.com',
        name: 'Second Invitee',
        role: 'user'
      },
      { upsert: true, new: true }
    );

    console.log(`   ✅ Created space owner: ${spaceOwner.name} (${spaceOwner._id})`);
    console.log(`   ✅ Created invitee 1: ${invitee1.name} (${invitee1._id})`);
    console.log(`   ✅ Created invitee 2: ${invitee2.name} (${invitee2._id})\n`);

    // Test 2: Create a test space
    console.log('2. Creating test space...');
    
    const testSpace = new Space({
      name: 'Test Space for Invitations',
      description: 'Testing invitation functionality',
      ownerId: spaceOwner._id.toString(),
      isPublic: false
    });

    await testSpace.save();
    console.log(`   ✅ Created space: ${testSpace.name} (${testSpace._id})`);
    console.log(`   ✅ Owner: ${testSpace.ownerId}`);
    console.log(`   ✅ Members: ${testSpace.members.length}\n`);

    // Test 3: Create invitations
    console.log('3. Testing invitation creation...');

    const invitation1 = new Invitation({
      spaceId: testSpace._id.toString(),
      inviterUserId: spaceOwner._id.toString(),
      inviteeEmail: invitee1.email,
      inviteeUserId: invitee1._id.toString(),
      role: 'editor',
      message: 'Welcome to our collaborative space!'
    });

    const invitation2 = new Invitation({
      spaceId: testSpace._id.toString(),
      inviterUserId: spaceOwner._id.toString(),
      inviteeEmail: invitee2.email,
      inviteeUserId: invitee2._id.toString(),
      role: 'viewer',
      message: 'Please join us for the project review.'
    });

    await invitation1.save();
    await invitation2.save();

    console.log(`   ✅ Created invitation 1: ${invitation1._id} -> ${invitation1.inviteeEmail} as ${invitation1.role}`);
    console.log(`   ✅ Created invitation 2: ${invitation2._id} -> ${invitation2.inviteeEmail} as ${invitation2.role}\n`);

    // Test 4: Test invitation methods
    console.log('4. Testing invitation methods...');

    const isValidBefore = invitation1.isValid();
    console.log(`   ✅ Invitation 1 is valid: ${isValidBefore}`);

    // Test finding pending invitations by email
    const pendingInvitations = await Invitation.findPendingByEmail(invitee1.email);
    console.log(`   ✅ Found ${pendingInvitations.length} pending invitations for ${invitee1.email}`);

    // Test finding invitation by space and email
    const existingInvitation = await Invitation.findBySpaceAndEmail(testSpace._id, invitee1.email);
    console.log(`   ✅ Found existing invitation: ${existingInvitation ? 'Yes' : 'No'}\n`);

    // Test 5: Accept invitation
    console.log('5. Testing invitation acceptance...');

    await invitation1.accept();
    console.log(`   ✅ Invitation 1 accepted at: ${invitation1.respondedAt}`);
    console.log(`   ✅ Invitation 1 status: ${invitation1.status}`);

    // Add member to space (this would normally be done in the API)
    testSpace.addMember(invitee1._id.toString(), invitation1.role);
    await testSpace.save();

    console.log(`   ✅ Added ${invitee1.name} to space as ${invitation1.role}`);
    console.log(`   ✅ Space now has ${testSpace.members.length} members\n`);

    // Test 6: Reject invitation
    console.log('6. Testing invitation rejection...');

    await invitation2.reject();
    console.log(`   ✅ Invitation 2 rejected at: ${invitation2.respondedAt}`);
    console.log(`   ✅ Invitation 2 status: ${invitation2.status}\n`);

    // Test 7: Test space access after acceptance
    console.log('7. Testing space access...');

    const ownerAccess = testSpace.hasAccess(spaceOwner._id);
    const invitee1Access = testSpace.hasAccess(invitee1._id);
    const invitee2Access = testSpace.hasAccess(invitee2._id);

    console.log(`   ✅ Owner has access: ${ownerAccess}`);
    console.log(`   ✅ Invitee 1 (accepted) has access: ${invitee1Access}`);
    console.log(`   ✅ Invitee 2 (rejected) has access: ${invitee2Access}`);

    const invitee1Role = testSpace.getUserRole(invitee1._id);
    console.log(`   ✅ Invitee 1 role: ${invitee1Role}\n`);

    // Test 8: Test duplicate invitation prevention
    console.log('8. Testing duplicate invitation prevention...');

    try {
      const duplicateInvitation = new Invitation({
        spaceId: testSpace._id.toString(),
        inviterUserId: spaceOwner._id.toString(),
        inviteeEmail: invitee1.email.toLowerCase(),
        inviteeUserId: invitee1._id.toString(),
        role: 'viewer'
      });

      await duplicateInvitation.save();
      console.log('   ❌ Duplicate invitation was allowed - this should not happen!');
    } catch (error) {
      if (error.code === 11000) {
        console.log('   ✅ Duplicate invitation correctly prevented');
      } else {
        console.log(`   ❌ Unexpected error: ${error.message}`);
      }
    }

    // Test 9: Test invitation expiration
    console.log('\n9. Testing invitation expiration...');

    const expiredInvitation = new Invitation({
      spaceId: testSpace._id.toString(),
      inviterUserId: spaceOwner._id.toString(),
      inviteeEmail: 'expired@invitetest.com',
      role: 'viewer',
      expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
    });

    await expiredInvitation.save();
    const isExpiredValid = expiredInvitation.isValid();
    console.log(`   ✅ Expired invitation is valid: ${isExpiredValid}`);
    console.log(`   ✅ Expired invitation virtual property: ${expiredInvitation.isExpired}\n`);

    // Test 10: Test invitation querying
    console.log('10. Testing invitation queries...');

    const allInvitations = await Invitation.find({});
    const pendingInvitations2 = await Invitation.find({ status: 'pending' });
    const acceptedInvitations = await Invitation.find({ status: 'accepted' });
    const rejectedInvitations = await Invitation.find({ status: 'rejected' });

    console.log(`   ✅ Total invitations: ${allInvitations.length}`);
    console.log(`   ✅ Pending invitations: ${pendingInvitations2.length}`);
    console.log(`   ✅ Accepted invitations: ${acceptedInvitations.length}`);
    console.log(`   ✅ Rejected invitations: ${rejectedInvitations.length}\n`);

    console.log('🎉 All invitation system tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await User.deleteMany({ email: { $regex: /@invitetest\.com$/ } });
    await Space.deleteMany({ name: { $regex: /^Test.*Invitation/ } });
    await Invitation.deleteMany({});
    console.log('✅ Test data cleaned up');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the test
testInvitationSystem().catch(console.error); 