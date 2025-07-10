const mongoose = require('mongoose');
require('dotenv').config();

// Import Space model
const Space = require('./models/Space');

// User data
const USERS = {
    Filip: {
        id: '6851eacfc1f421c1d214a6c9',
        spaceName: 'FilipKoz',
        description: 'Filip\'s personal macro collection imported from Intercom'
    },
    Vasilije: {
        id: '6852b001a4e43660d266530f', 
        spaceName: 'VasilijeV',
        description: 'Vasilije\'s personal macro collection imported from Intercom'
    }
};

async function connectToDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/macromind';
        console.log(`Connecting to MongoDB: ${mongoUri}`);
        
        await mongoose.connect(mongoUri);
        console.log('✓ Connected to MongoDB successfully');
        return true;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        return false;
    }
}

async function createSpace(userId, spaceName, description) {
    try {
        console.log(`\nCreating space: ${spaceName} for user: ${userId}`);
        
        // Check if space already exists
        const existingSpace = await Space.findOne({ 
            ownerId: userId, 
            name: spaceName 
        });
        
        if (existingSpace) {
            console.log(`⚠️  Space "${spaceName}" already exists for user ${userId}`);
            console.log(`   Space ID: ${existingSpace._id}`);
            return existingSpace;
        }
        
        // Create new space
        const newSpace = new Space({
            name: spaceName,
            description: description,
            ownerId: userId,
            isPublic: true, // As requested
            members: [], // Will be populated automatically by pre-save hook
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        // Save space
        const savedSpace = await newSpace.save();
        
        console.log(`✓ Space "${spaceName}" created successfully`);
        console.log(`   Space ID: ${savedSpace._id}`);
        console.log(`   Owner: ${savedSpace.ownerId}`);
        console.log(`   Public: ${savedSpace.isPublic}`);
        console.log(`   Members: ${savedSpace.members.length}`);
        
        return savedSpace;
        
    } catch (error) {
        console.error(`Error creating space "${spaceName}":`, error.message);
        return null;
    }
}

async function verifySpaceCreation(userId, spaceName) {
    try {
        const space = await Space.findOne({ 
            ownerId: userId, 
            name: spaceName 
        });
        
        if (space) {
            console.log(`\n=== VERIFICATION: ${spaceName} ===`);
            console.log(`Space ID: ${space._id}`);
            console.log(`Name: ${space.name}`);
            console.log(`Owner ID: ${space.ownerId}`);
            console.log(`Public: ${space.isPublic}`);
            console.log(`Description: ${space.description}`);
            console.log(`Members count: ${space.members.length}`);
            console.log(`Created: ${space.createdAt}`);
            console.log(`Updated: ${space.updatedAt}`);
            
            if (space.members.length > 0) {
                console.log('Members:');
                space.members.forEach((member, index) => {
                    console.log(`  ${index + 1}. User: ${member.userId}, Role: ${member.role}, Added: ${member.addedAt}`);
                });
            }
            
            return true;
        } else {
            console.log(`❌ Space verification failed for ${spaceName}`);
            return false;
        }
    } catch (error) {
        console.error(`Error verifying space ${spaceName}:`, error.message);
        return false;
    }
}

async function main() {
    console.log('=== MACRO SPACES CREATOR ===');
    console.log('Creating spaces for macro import process');
    
    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
        console.error('Failed to connect to database. Exiting...');
        process.exit(1);
    }
    
    const createdSpaces = [];
    
    // Create spaces for each user
    for (const [userName, userData] of Object.entries(USERS)) {
        console.log(`\n--- Processing ${userName} ---`);
        
        const space = await createSpace(
            userData.id,
            userData.spaceName, 
            userData.description
        );
        
        if (space) {
            createdSpaces.push({
                user: userName,
                space: space,
                spaceId: space._id
            });
        }
    }
    
    // Verify all created spaces
    console.log('\n=== VERIFICATION PHASE ===');
    let allVerified = true;
    
    for (const [userName, userData] of Object.entries(USERS)) {
        const verified = await verifySpaceCreation(userData.id, userData.spaceName);
        if (!verified) {
            allVerified = false;
        }
    }
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Spaces processed: ${Object.keys(USERS).length}`);
    console.log(`Successfully created/verified: ${createdSpaces.length}`);
    
    if (allVerified) {
        console.log('✓ All spaces verified successfully!');
        
        console.log('\nSpace IDs for next steps:');
        for (const item of createdSpaces) {
            console.log(`  ${item.user}: ${item.spaceId}`);
        }
        
        console.log('\nNext step: Import macros as cards into these spaces');
    } else {
        console.log('❌ Some spaces failed verification');
    }
    
    // Close database connection
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});

// Run the script
main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});