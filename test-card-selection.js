const WebSocket = require('ws');
const colors = require('colors');

// Test configuration
const WS_URL = 'ws://localhost:8001';
const TEST_TIMEOUT = 10000;

// Test users
const users = [
  { id: 'user1', email: 'test1@example.com', name: 'Test User 1' },
  { id: 'user2', email: 'test2@example.com', name: 'Test User 2' }
];

// Mock tokens for testing
const mockTokens = {
  'user1': 'mock-token-user1',
  'user2': 'mock-token-user2'
};

class TestUser {
  constructor(userInfo) {
    this.userInfo = userInfo;
    this.ws = null;
    this.isAuthenticated = false;
    this.currentSpace = null;
    this.selectedCard = null;
    this.lockedCards = new Set();
    this.selectionEvents = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`${this.userInfo.name}: Connecting to WebSocket...`.blue);
      
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        console.log(`${this.userInfo.name}: Connected to WebSocket`.green);
        this.authenticate();
      });
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });
      
      this.ws.on('error', (error) => {
        console.error(`${this.userInfo.name}: WebSocket error:`.red, error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log(`${this.userInfo.name}: WebSocket connection closed`.yellow);
      });
      
      // Resolve when authenticated
      setTimeout(() => {
        if (this.isAuthenticated) {
          resolve();
        } else {
          reject(new Error('Authentication timeout'));
        }
      }, 5000);
    });
  }

  authenticate() {
    console.log(`${this.userInfo.name}: Authenticating...`.blue);
    this.send({
      type: 'auth',
      token: mockTokens[this.userInfo.id]
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  handleMessage(message) {
    console.log(`${this.userInfo.name}: Received:`.cyan, message.type);
    
    switch (message.type) {
      case 'auth:success':
        console.log(`${this.userInfo.name}: Authentication successful`.green);
        this.isAuthenticated = true;
        break;
        
      case 'auth:error':
        console.error(`${this.userInfo.name}: Authentication failed:`.red, message.message);
        break;
        
      case 'space:joined':
        console.log(`${this.userInfo.name}: Joined space:`.green, message.spaceId);
        this.currentSpace = message.spaceId;
        break;
        
      case 'locks:list':
        console.log(`${this.userInfo.name}: Received locks list:`.cyan, message.locks.length, 'locks');
        this.lockedCards.clear();
        message.locks.forEach(lock => {
          this.lockedCards.add(lock.cardId);
        });
        break;
        
      case 'selections:list':
        console.log(`${this.userInfo.name}: Received selections list:`.cyan, message.selections.length, 'selections');
        message.selections.forEach(selection => {
          this.selectionEvents.push({
            type: 'initial',
            cardId: selection.cardId,
            userId: selection.userId,
            userName: selection.userName
          });
        });
        break;
        
      case 'card:selected':
        console.log(`${this.userInfo.name}: Card selected:`.green, message.cardId, 'by', message.userName);
        if (message.userId === this.userInfo.id) {
          this.selectedCard = message.cardId;
        }
        this.selectionEvents.push({
          type: 'selected',
          cardId: message.cardId,
          userId: message.userId,
          userName: message.userName
        });
        break;
        
      case 'card:deselected':
        console.log(`${this.userInfo.name}: Card deselected:`.yellow, message.cardId, 'by', message.userName);
        if (message.userId === this.userInfo.id) {
          this.selectedCard = null;
        }
        this.selectionEvents.push({
          type: 'deselected',
          cardId: message.cardId,
          userId: message.userId,
          userName: message.userName
        });
        break;
        
      case 'card:locked':
        console.log(`${this.userInfo.name}: Card locked:`.magenta, message.cardId, 'by', message.userName);
        this.lockedCards.add(message.cardId);
        break;
        
      case 'card:unlocked':
        console.log(`${this.userInfo.name}: Card unlocked:`.white, message.cardId);
        this.lockedCards.delete(message.cardId);
        break;
        
      case 'error':
        console.error(`${this.userInfo.name}: Server error:`.red, message.message);
        break;
        
      default:
        // Ignore other message types for this test
        break;
    }
  }

  async joinSpace(spaceId) {
    console.log(`${this.userInfo.name}: Joining space:`.blue, spaceId);
    return this.send({
      type: 'space:join',
      spaceId: spaceId
    });
  }

  async selectCard(cardId) {
    console.log(`${this.userInfo.name}: Selecting card:`.blue, cardId);
    return this.send({
      type: 'card:select',
      cardId: cardId
    });
  }

  async deselectCard(cardId) {
    console.log(`${this.userInfo.name}: Deselecting card:`.blue, cardId);
    return this.send({
      type: 'card:deselect',
      cardId: cardId
    });
  }

  async clearAllSelections() {
    console.log(`${this.userInfo.name}: Clearing all selections`.blue);
    return this.send({
      type: 'canvas:clearSelection'
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== Card Selection and Locking System Test ==='.rainbow);
  
  const testUser1 = new TestUser(users[0]);
  const testUser2 = new TestUser(users[1]);
  
  try {
    // Connect both users
    console.log('\n1. Connecting users...'.bold);
    await testUser1.connect();
    await testUser2.connect();
    
    // Both users join public space
    console.log('\n2. Joining public space...'.bold);
    await testUser1.joinSpace('public');
    await testUser2.joinSpace('public');
    await sleep(1000);
    
    // Test 1: Single card selection
    console.log('\n3. Testing single card selection...'.bold);
    const cardId1 = 'test-card-1';
    await testUser1.selectCard(cardId1);
    await sleep(500);
    
    console.log(`User1 selected card: ${testUser1.selectedCard}`);
    console.log(`User2 sees locks: ${Array.from(testUser2.lockedCards)}`);
    
    // Test 2: Second user tries to select same card - should work but deselect first
    console.log('\n4. Testing card selection switch...'.bold);
    const cardId2 = 'test-card-2';
    await testUser1.selectCard(cardId2); // Should deselect cardId1 first
    await sleep(500);
    
    console.log(`User1 selected card: ${testUser1.selectedCard}`);
    console.log(`User1 selection events: ${testUser1.selectionEvents.length}`);
    
    // Test 3: Canvas clear selection
    console.log('\n5. Testing canvas clear selection...'.bold);
    await testUser1.clearAllSelections();
    await sleep(500);
    
    console.log(`User1 selected card: ${testUser1.selectedCard}`);
    console.log(`User2 sees locks: ${Array.from(testUser2.lockedCards)}`);
    
    // Test 4: User leaves and rejoins space
    console.log('\n6. Testing user leave and rejoin...'.bold);
    await testUser2.selectCard(cardId1);
    await sleep(500);
    
    console.log(`User2 selected card: ${testUser2.selectedCard}`);
    
    // User1 leaves and rejoins
    testUser1.disconnect();
    await sleep(1000);
    
    const newTestUser1 = new TestUser(users[0]);
    await newTestUser1.connect();
    await newTestUser1.joinSpace('public');
    await sleep(1000);
    
    console.log(`New User1 sees locks: ${Array.from(newTestUser1.lockedCards)}`);
    console.log(`New User1 selection events: ${newTestUser1.selectionEvents.length}`);
    
    // Print summary
    console.log('\n=== Test Summary ==='.rainbow);
    console.log(`User1 selection events: ${testUser1.selectionEvents.length}`);
    console.log(`User2 selection events: ${testUser2.selectionEvents.length}`);
    console.log(`New User1 initial locks: ${Array.from(newTestUser1.lockedCards).length}`);
    console.log(`New User1 initial selections: ${newTestUser1.selectionEvents.filter(e => e.type === 'initial').length}`);
    
    // Cleanup
    testUser2.disconnect();
    newTestUser1.disconnect();
    
    console.log('\n✅ All tests completed successfully!'.green);
    
  } catch (error) {
    console.error('\n❌ Test failed:'.red, error);
    
    // Cleanup on error
    testUser1.disconnect();
    testUser2.disconnect();
  }
}

// Run tests
runTests().catch(console.error); 