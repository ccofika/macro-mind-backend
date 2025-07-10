const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Card = require('./models/Card');

// User configurations
const USERS = {
    Filip: {
        userId: 'filipkozomara@mebit.io',
        spaceId: '686fe07d932a30cff4ddbcb6',
        macroFile: '../filip_clean_macros.json',
        userName: 'Filip'
    },
    Vasilije: {
        userId: 'vasilijevitorovic@mebit.io', 
        spaceId: '686fe07e932a30cff4ddbcb9',
        macroFile: '../vasilije_clean_macros.json',
        userName: 'Vasilije'
    }
};

// Grid settings for positioning cards
const GRID_CONFIG = {
    startX: 100,
    startY: 100,
    cardWidth: 300,
    cardHeight: 200,
    horizontalSpacing: 50,
    verticalSpacing: 50,
    cardsPerRow: 8
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

function calculatePosition(index) {
    const row = Math.floor(index / GRID_CONFIG.cardsPerRow);
    const col = index % GRID_CONFIG.cardsPerRow;
    
    const x = GRID_CONFIG.startX + (col * (GRID_CONFIG.cardWidth + GRID_CONFIG.horizontalSpacing));
    const y = GRID_CONFIG.startY + (row * (GRID_CONFIG.cardHeight + GRID_CONFIG.verticalSpacing));
    
    return { x, y };
}

function processContent(content) {
    // Replace \n with double line breaks for better display in MongoDB
    // This will create proper paragraph separation
    return content.replace(/\n/g, '\n\n');
}

async function loadMacros(filePath) {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        console.log(`Loading macros from: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${fullPath}`);
        }
        
        const data = fs.readFileSync(fullPath, 'utf8');
        const macros = JSON.parse(data);
        
        console.log(`✓ Loaded ${macros.length} macros`);
        return macros;
    } catch (error) {
        console.error(`Error loading macros from ${filePath}:`, error.message);
        return [];
    }
}

async function checkExistingCards(userId, spaceId) {
    try {
        const existingCount = await Card.countDocuments({ 
            userId: userId, 
            spaceId: spaceId 
        });
        
        console.log(`Existing cards in space: ${existingCount}`);
        return existingCount;
    } catch (error) {
        console.error('Error checking existing cards:', error.message);
        return 0;
    }
}

async function importMacrosAsCards(userConfig) {
    try {
        console.log(`\n=== IMPORTING MACROS FOR ${userConfig.userName.toUpperCase()} ===`);
        console.log(`User ID: ${userConfig.userId}`);
        console.log(`Space ID: ${userConfig.spaceId}`);
        
        // Load macros
        const macros = await loadMacros(userConfig.macroFile);
        if (macros.length === 0) {
            console.log('No macros to import');
            return { success: false, imported: 0 };
        }
        
        // Check existing cards
        const existingCount = await checkExistingCards(userConfig.userId, userConfig.spaceId);
        if (existingCount > 0) {
            console.log(`⚠️  Found ${existingCount} existing cards. Continuing with import...`);
        }
        
        // Prepare cards for bulk insert
        const cardsToInsert = [];
        let importErrors = [];
        
        for (let i = 0; i < macros.length; i++) {
            const macro = macros[i];
            
            try {
                // Calculate position
                const position = calculatePosition(i);
                
                // Process content
                const processedContent = processContent(macro.content);
                
                // Create card object
                const cardData = {
                    _id: new mongoose.Types.ObjectId().toString(),
                    userId: userConfig.userId,
                    spaceId: userConfig.spaceId,
                    type: 'answer',
                    title: macro.name,
                    content: processedContent,
                    fontSize: 250,
                    position: position,
                    createdAt: macro.created_at ? new Date(macro.created_at) : new Date(),
                    updatedAt: macro.updated_at ? new Date(macro.updated_at) : new Date()
                };
                
                cardsToInsert.push(cardData);
                
            } catch (error) {
                importErrors.push({
                    macroId: macro.id,
                    macroName: macro.name,
                    error: error.message
                });
                console.warn(`Error preparing macro ${macro.id} (${macro.name}):`, error.message);
            }
        }
        
        console.log(`Prepared ${cardsToInsert.length} cards for import`);
        
        if (importErrors.length > 0) {
            console.log(`Skipped ${importErrors.length} macros due to errors`);
        }
        
        // Bulk insert cards
        if (cardsToInsert.length > 0) {
            console.log('Inserting cards into database...');
            
            const result = await Card.insertMany(cardsToInsert, { 
                ordered: false // Continue even if some inserts fail
            });
            
            console.log(`✓ Successfully imported ${result.length} cards`);
            
            // Show sample of imported cards
            console.log('\n--- Sample imported cards ---');
            for (let i = 0; i < Math.min(3, result.length); i++) {
                const card = result[i];
                console.log(`${i + 1}. ${card.title} (${card.position.x}, ${card.position.y})`);
                console.log(`   Content: ${card.content.substring(0, 100)}...`);
            }
            
            return { 
                success: true, 
                imported: result.length, 
                errors: importErrors,
                sampleCard: result[0]
            };
        } else {
            console.log('No cards to import');
            return { success: false, imported: 0, errors: importErrors };
        }
        
    } catch (error) {
        console.error(`Error importing macros for ${userConfig.userName}:`, error.message);
        return { success: false, imported: 0, error: error.message };
    }
}

async function verifyImport(userId, spaceId, expectedCount) {
    try {
        console.log(`\n--- Verifying import for ${userId} ---`);
        
        const totalCards = await Card.countDocuments({ 
            userId: userId, 
            spaceId: spaceId 
        });
        
        const answerCards = await Card.countDocuments({ 
            userId: userId, 
            spaceId: spaceId, 
            type: 'answer' 
        });
        
        console.log(`Total cards in space: ${totalCards}`);
        console.log(`Answer cards: ${answerCards}`);
        console.log(`Expected: ${expectedCount}`);
        
        // Get a sample card to verify structure
        const sampleCard = await Card.findOne({ 
            userId: userId, 
            spaceId: spaceId 
        });
        
        if (sampleCard) {
            console.log('\nSample card:');
            console.log(`  ID: ${sampleCard._id}`);
            console.log(`  Title: ${sampleCard.title}`);
            console.log(`  Type: ${sampleCard.type}`);
            console.log(`  Position: (${sampleCard.position.x}, ${sampleCard.position.y})`);
            console.log(`  Content preview: ${sampleCard.content.substring(0, 150)}...`);
        }
        
        return totalCards >= expectedCount;
    } catch (error) {
        console.error('Error verifying import:', error.message);
        return false;
    }
}

async function main() {
    console.log('=== MACRO TO CARDS IMPORTER ===');
    console.log('Importing macros as answer cards into user spaces');
    
    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
        console.error('Failed to connect to database. Exiting...');
        process.exit(1);
    }
    
    const importResults = [];
    
    // Import macros for each user
    for (const [userName, userConfig] of Object.entries(USERS)) {
        const result = await importMacrosAsCards(userConfig);
        importResults.push({
            user: userName,
            ...result
        });
    }
    
    // Verification phase
    console.log('\n=== VERIFICATION PHASE ===');
    for (const [userName, userConfig] of Object.entries(USERS)) {
        const result = importResults.find(r => r.user === userName);
        if (result && result.success) {
            await verifyImport(userConfig.userId, userConfig.spaceId, result.imported);
        }
    }
    
    // Final summary
    console.log('\n=== IMPORT SUMMARY ===');
    let totalImported = 0;
    for (const result of importResults) {
        console.log(`${result.user}: ${result.imported} cards imported (Success: ${result.success})`);
        if (result.errors && result.errors.length > 0) {
            console.log(`  Errors: ${result.errors.length}`);
        }
        totalImported += result.imported || 0;
    }
    
    console.log(`\nTotal cards imported: ${totalImported}`);
    console.log('✓ Macro import process completed!');
    
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