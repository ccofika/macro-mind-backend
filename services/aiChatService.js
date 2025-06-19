const { OpenAI } = require('openai');
const Card = require('../models/Card');
const Space = require('../models/Space');
const Connection = require('../models/Connection');
const ConversationStateManager = require('./conversationStateManager');
const CardWorkflowEngine = require('./cardWorkflowEngine');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI client
let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('AI Chat Service: OpenAI client initialized');
} else {
  console.log('AI Chat Service: OpenAI API key not configured');
}

// Load agent guidelines
let agentGuidelines = '';
try {
  const guidelinesFilePath = path.join(__dirname, '../data/agent-guidelines.txt');
  agentGuidelines = fs.readFileSync(guidelinesFilePath, 'utf8');
} catch (error) {
  console.error('AI Chat Service: Failed to load agent guidelines:', error);
  agentGuidelines = 'Be professional, clear, and helpful in all communications.';
}

// AI Mode Configurations
const AI_MODES = {
  macro: {
    name: 'Macro',
    systemPrompt: `You are an expert customer service AI assistant specialized in generating complete, professional responses using card templates and company knowledge base.

${agentGuidelines}

MACRO MODE INSTRUCTIONS:
Your task is to generate complete customer service responses using the provided card templates. Follow this process:

1. ANALYZE CUSTOMER INTENT:
   - Identify the customer's main concern (complaint, inquiry, request, etc.)
   - Determine the appropriate tone needed (apologetic, helpful, informative, etc.)
   - Note any specific details mentioned (order numbers, dates, products, etc.)

2. USE CARD TEMPLATES:
   - Search through the provided card content for relevant templates
   - Merge information from multiple cards when applicable
   - Use exact procedures, policies, and language from the cards
   - Maintain consistency with company guidelines

3. GENERATE COMPLETE RESPONSE:
   - Create a full, ready-to-send customer service response
   - Include appropriate greeting and closing
   - Address all customer concerns mentioned
   - Provide specific next steps or solutions
   - Include relevant policies, procedures, or contact information from cards
   - Use professional, empathetic tone throughout

4. RESPONSE STRUCTURE:
   - Opening: Acknowledge the customer's concern
   - Body: Address issues using card information, provide solutions
   - Closing: Offer additional help, provide next steps
   - Include specific details like order numbers, policies, contact info when relevant

5. QUALITY STANDARDS:
   - Response must be complete and ready to send
   - Must sound natural and human-like
   - Should resolve or advance the customer's inquiry
   - Include specific, actionable information
   - Maintain professional customer service tone

Always prioritize accuracy and helpfulness. Use the card templates as your primary source of information.`,
    temperature: 0.3,
    maxTokens: 800
  },
  
  rephrase: {
    name: 'Rephrase',
    systemPrompt: `You are a professional text improvement specialist. Rewrite and improve the provided text with better tone, clarity, and effectiveness.

Focus on:
- Improving clarity and readability
- Enhancing professional tone
- Correcting grammar and structure
- Maintaining original meaning
- Making text more engaging

Provide only the improved version without explanations.`,
    temperature: 0.4,
    maxTokens: 600
  },
  
  explain: {
    name: 'Explain',
    systemPrompt: `You are an expert analyst. Analyze customer input and explain what they want, need, or are trying to communicate.

Focus on:
- Identifying customer intent
- Explaining underlying needs
- Highlighting key concerns
- Suggesting appropriate responses
- Providing context from relevant cards

Be clear and analytical in your explanations.`,
    temperature: 0.2,
    maxTokens: 500
  },
  
  summarize: {
    name: 'Summarize',
    systemPrompt: `You are a professional summarization specialist. Create concise, accurate summaries of long conversations or content.

Focus on:
- Capturing key points and decisions
- Maintaining important details
- Creating clear, structured summaries
- Highlighting action items
- Preserving context

Keep summaries concise but comprehensive.`,
    temperature: 0.1,
    maxTokens: 400
  },
  
  translate: {
    name: 'Translate',
    systemPrompt: `You are a professional translator. Translate text between languages while maintaining professional tone and context.

Focus on:
- Accurate translation
- Maintaining professional tone
- Preserving business context
- Cultural appropriateness
- Clear communication

Always specify the source and target languages.`,
    temperature: 0.2,
    maxTokens: 600
  },
  
  improve: {
    name: 'Improve',
    systemPrompt: `You are a customer service quality specialist. Enhance existing responses to make them more effective, professional, and helpful.

Focus on:
- Increasing response effectiveness
- Improving customer satisfaction potential
- Enhancing professionalism
- Adding helpful details
- Optimizing tone and structure

Provide significantly improved versions that exceed expectations.`,
    temperature: 0.3,
    maxTokens: 700
  },
  
  process: {
    name: 'Process',
    systemPrompt: `You are a business facts extractor. Extract ONLY pure facts and rules from cards - no explanations, no writing advice, just hard facts.

CRITICAL: Users need ONLY factual information they can reference quickly. Extract specific business rules, procedures, and concrete facts.

Your approach:
1. EXTRACT only concrete facts, rules, and procedures from cards
2. IDENTIFY specific conditions when facts apply
3. LIST only actionable facts (like "Offer notifications via mail/telegram")
4. HIGHLIGHT decision triggers and escalation points

Output format (FACTS ONLY):
• **SITUATION**: When this process applies (brief)
• **KEY FACTS**: Pure facts and rules only (bullet points)
• **ACTIONS**: Concrete things to do/offer (factual)
• **DECISION POINTS**: Specific triggers for changes

Example facts format:
- "Bonuses available only via predefined criteria"
- "Offer notifications via mail and telegram"
- "Escalate after 3 repeated inquiries"
- "Support cannot influence bonus timing"

Requirements:
- Extract ONLY hard facts from card content
- No emotional language or writing advice
- Keep facts short and specific
- Focus on business rules, procedures, contact methods
- Each fact should be 1 short sentence maximum

NO explanations - just pure business facts for quick reference.`,
    temperature: 0.05,
    maxTokens: 400
  },
  
  search: {
    name: 'Search',
    systemPrompt: `You are an intelligent search assistant. Help users find relevant information from their cards and spaces.

Focus on:
- Understanding search intent
- Finding relevant cards
- Explaining search results
- Suggesting related content
- Providing search insights

Present search results clearly with relevance explanations.`,
    temperature: 0.1,
    maxTokens: 500
  }
};

class AIChatService {
  constructor() {
    this.conversationStateManager = new ConversationStateManager();
    this.workflowEngine = new CardWorkflowEngine();
  }

  /**
   * Search through user's cards for relevant content
   */
  async searchCards(userId, query, options = {}) {
    console.log('\n🔍 === BACKEND CARD SEARCH START ===');
    console.log('👤 User ID:', userId);
    console.log('📝 Query:', query);
    console.log('⚙️ Options:', options);
    
    try {
      const { mode = 'search', limit = 10, spaceId = null, searchAll = false, conversationHistory = [] } = options;
      
      // Get user's accessible spaces (private spaces where user is owner/member)
      console.log('\n🏢 Getting user\'s private spaces...');
      const userPrivateSpaces = await Space.find({
        $or: [
          { ownerId: userId },
          { 'members.userId': userId }
        ]
      });
      
      console.log(`📊 Found ${userPrivateSpaces.length} private spaces:`, 
        userPrivateSpaces.map(s => `"${s.name}" (${s._id})`));
      
      // Get all public spaces
      console.log('\n🌍 Getting public spaces...');
      const publicSpaces = await Space.find({ isPublic: true });
      console.log(`📊 Found ${publicSpaces.length} public spaces:`, 
        publicSpaces.map(s => `"${s.name}" (${s._id})`));
      
      // Combine all accessible space IDs
      const privateSpaceIds = userPrivateSpaces.map(space => space._id.toString());
      const publicSpaceIds = publicSpaces.map(space => space._id.toString());
      const allAccessibleSpaceIds = [
        'public', // Always include the default public space
        ...privateSpaceIds,
        ...publicSpaceIds
      ];
      
      console.log('🔓 All accessible space IDs:', allAccessibleSpaceIds);
      
      // Build card search query
      let cardQuery;
      
      if (searchAll || mode === 'process') {
        // Search ALL cards in system (admin/debug mode OR process mode)
        cardQuery = {};
        console.log(mode === 'process' 
          ? '🔄 PROCESS MODE: Searching ALL cards for workflow analysis' 
          : '🚨 SEARCHING ALL CARDS IN SYSTEM (Admin mode)');
      } else if (spaceId) {
        cardQuery = { spaceId: spaceId };
        console.log('🎯 Filtering by specific space:', spaceId);
      } else {
        cardQuery = { spaceId: { $in: allAccessibleSpaceIds } };
        console.log('🔍 Searching across all accessible spaces:', allAccessibleSpaceIds.length);
      }
      
      // Get all accessible cards
      console.log('\n📚 Fetching accessible cards...');
      const allCards = await Card.find(cardQuery).lean();

      console.log(`✅ Found ${allCards.length} accessible cards for user ${userId}`);
      console.log('📈 Card distribution by space:');
      
      // Show distribution of cards per space
      const cardsBySpace = allCards.reduce((acc, card) => {
        const spaceId = card.spaceId || 'unknown';
        acc[spaceId] = (acc[spaceId] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(cardsBySpace).forEach(([spaceId, count]) => {
        console.log(`  📁 ${spaceId}: ${count} cards`);
      });
      
      // Manually fetch space names since spaceId is string, not ObjectId reference
      const uniqueSpaceIds = [...new Set(allCards.map(card => card.spaceId).filter(Boolean))];
      console.log('🏢 Unique space IDs found in cards:', uniqueSpaceIds);
      
      const spaceMap = new Map();
      
      // For process mode, we need to fetch ALL spaces to have complete info
      if (mode === 'process') {
        console.log('🔄 PROCESS MODE: Fetching ALL spaces for complete workflow analysis');
        try {
          const allSpaces = await Space.find({}).lean();
          allSpaces.forEach(space => {
            spaceMap.set(space._id.toString(), space);
            console.log(`📍 Mapped space: "${space.name}" (${space._id})`);
          });
        } catch (error) {
          console.log('❌ Error fetching all spaces:', error.message);
        }
      }
      
      // Fetch space info for non-public spaces (if not already loaded)
      for (const spaceId of uniqueSpaceIds) {
        if (spaceMap.has(spaceId)) {
          continue; // Already loaded
        }
        
        if (spaceId === 'public') {
          spaceMap.set('public', { _id: 'public', name: 'Public Space' });
        } else {
          try {
            const space = await Space.findById(spaceId).lean();
            if (space) {
              console.log(`📍 Found space: "${space.name}" (${space._id})`);
              spaceMap.set(spaceId, space);
            } else {
              console.log(`⚠️ Space not found: ${spaceId}`);
              spaceMap.set(spaceId, { _id: spaceId, name: 'Unknown Space' });
            }
          } catch (error) {
            console.log(`❌ Error fetching space ${spaceId}:`, error.message);
            spaceMap.set(spaceId, { _id: spaceId, name: 'Unknown Space' });
          }
        }
      }
      
             // Add space info to cards
       const cardsWithSpaceInfo = allCards.map(card => ({
         ...card,
         spaceId: {
           _id: card.spaceId,
           name: spaceMap.get(card.spaceId)?.name || 'Unknown Space'
         }
       }));

       console.log('📋 Sample cards with space info:', cardsWithSpaceInfo.slice(0, 3).map(card => ({
         title: card.title,
         spaceId: card.spaceId._id,
         spaceName: card.spaceId.name,
         contentLength: card.content?.length || 0
       })));

       console.log(`🔍 SEARCH SCOPE SUMMARY:`);
       console.log(`  👤 Private spaces: ${privateSpaceIds.length}`);
       console.log(`  🌍 Public spaces: ${publicSpaceIds.length}`);
       console.log(`  📦 Total accessible spaces: ${allAccessibleSpaceIds.length}`);
       console.log(`  📚 Total cards to search: ${cardsWithSpaceInfo.length}`);

      // Analyze conversation context if history is provided
      let conversationState = null;
      if (conversationHistory && conversationHistory.length > 0) {
        conversationState = this.conversationStateManager.analyzeConversationState(
          conversationHistory, 
          query
        );
      }

      // Get all connections for workflow analysis
      console.log('\n🔗 Fetching connections for workflow analysis...');
      const allConnections = await Connection.find({}).lean();
      console.log(`📎 Found ${allConnections.length} total connections`);
      
      // Analyze connections to see which cards they reference
      console.log('🔗 Connection analysis:');
      const referencedCardIds = new Set();
      const availableCardIds = new Set(cardsWithSpaceInfo.map(c => c._id.toString()));
      
      allConnections.forEach(conn => {
        if (conn.sourceId) referencedCardIds.add(conn.sourceId.toString());
        if (conn.targetId) referencedCardIds.add(conn.targetId.toString());
      });
      
      const connectionsToMissingCards = allConnections.filter(conn =>
        (conn.sourceId && !availableCardIds.has(conn.sourceId.toString())) ||
        (conn.targetId && !availableCardIds.has(conn.targetId.toString()))
      );
      
      console.log(`📊 Connection stats:`);
      console.log(`  📎 Total connections: ${allConnections.length}`);
      console.log(`  🎯 Referenced card IDs: ${referencedCardIds.size}`);
      console.log(`  📚 Available card IDs: ${availableCardIds.size}`);
      console.log(`  ❓ Connections to missing cards: ${connectionsToMissingCards.length}`);
      
      // Debug: Show sample connections and available cards
      console.log('🔍 Debug - Sample available card IDs:');
      Array.from(availableCardIds).slice(0, 5).forEach(cardId => {
        const card = cardsWithSpaceInfo.find(c => c._id.toString() === cardId);
        console.log(`  📋 ${cardId} → "${card?.title}"`);
      });
      
      console.log('🔍 Debug - Sample connections:');
      allConnections.slice(0, 5).forEach(conn => {
        const fromExists = conn.sourceId && availableCardIds.has(conn.sourceId.toString());
        const toExists = conn.targetId && availableCardIds.has(conn.targetId.toString());
        console.log(`  🔗 ${conn.sourceId || 'null'}${fromExists ? ' ✅' : ' ❌'} → ${conn.targetId || 'null'}${toExists ? ' ✅' : ' ❌'}`);
      });
      
      if (connectionsToMissingCards.length > 0) {
        console.log('⚠️ Sample connections to missing cards:');
        connectionsToMissingCards.slice(0, 5).forEach(conn => {
          const fromMissing = !availableCardIds.has(conn.fromCardId?.toString());
          const toMissing = !availableCardIds.has(conn.toCardId?.toString());
          console.log(`  🔗 ${conn.fromCardId}${fromMissing ? ' (MISSING)' : ''} → ${conn.toCardId}${toMissing ? ' (MISSING)' : ''}`);
        });
      }

      // Build workflow chains
      console.log('\n🔄 Building workflow chains...');
      const workflows = await this.workflowEngine.buildWorkflowChains(cardsWithSpaceInfo, allConnections);
      console.log(`⚡ Built ${workflows.size} workflow chains`);

      // Find contextual answer using workflow engine
      let contextualAnswer = null;
      if (conversationState && workflows.size > 0) {
        contextualAnswer = this.workflowEngine.findContextualAnswerCard(workflows, query, conversationState);
      }

      // If we found a contextual answer, use it; otherwise fall back to semantic search
      let finalResults = [];
      
      if (contextualAnswer && contextualAnswer.card) {
        console.log('\n✅ Using contextual workflow answer:');
        console.log(`🎯 Workflow: ${contextualAnswer.workflow.categoryCard?.title || 'No Category'}`);
        console.log(`📍 Step: ${contextualAnswer.currentStep}/${contextualAnswer.workflow.totalSteps}`);
        console.log(`💬 Card: "${contextualAnswer.card.title}"`);
        
        // Create result from contextual answer
        const contextualResult = {
          cardId: contextualAnswer.card.id,
          cardTitle: contextualAnswer.card.title,
          cardContent: contextualAnswer.card.content,
          spaceId: cardsWithSpaceInfo.find(c => c._id.toString() === contextualAnswer.card.id)?.spaceId,
          spaceName: cardsWithSpaceInfo.find(c => c._id.toString() === contextualAnswer.card.id)?.spaceName || 'Unknown',
          relevanceScore: 95, // High score for contextual match
          contextScore: 100,
          workflowStep: contextualAnswer.currentStep,
          isContextual: true,
          excerpt: this.generateExcerpt(contextualAnswer.card.content, query)
        };
        
        finalResults = [contextualResult];
      } else {
        // Fallback to semantic search
        console.log('\n🔍 No contextual answer found, performing semantic search...');
        const semanticResults = this.performSemanticSearch(cardsWithSpaceInfo, query, limit);
        console.log(`🎯 Found ${semanticResults.length} semantic matches`);
        
        // Filter out category cards from semantic results
        finalResults = semanticResults.filter(result => {
          const card = cardsWithSpaceInfo.find(c => c._id.toString() === result.cardId);
          return !this.workflowEngine.isCategoryCard(card);
        });
        
        console.log(`💬 After filtering categories: ${finalResults.length} answer cards`);
        
        if (finalResults.length > 0) {
          console.log('🏆 Top semantic results:');
          finalResults.slice(0, 3).forEach((result, index) => {
            console.log(`  ${index + 1}. "${result.cardTitle}" - Score: ${result.relevanceScore} (Space: ${result.spaceName})`);
          });
        }
      }
      
      // For contextual results, we don't need additional connection enhancement
      // For semantic results, enhance with connections
      let enhancedResults = finalResults;
      
      if (!contextualAnswer && finalResults.length > 0) {
        console.log('\n🔗 Enhancing semantic results with connections...');
        const resultConnections = allConnections.filter(conn => 
          finalResults.some(r => 
            (conn.sourceId && r.cardId === conn.sourceId.toString()) || 
            (conn.targetId && r.cardId === conn.targetId.toString())
          )
        );
        console.log(`📎 Found ${resultConnections.length} relevant connections`);
        
        // For process mode, include ALL connected cards as full results
        if (mode === 'process') {
          enhancedResults = await this.enhanceWithAllConnectedCards(finalResults, allConnections, cardsWithSpaceInfo, query);
        } else {
          enhancedResults = this.enhanceWithConnections(finalResults, resultConnections, cardsWithSpaceInfo);
        }
      }
      
      const finalResult = {
        results: enhancedResults,
        totalFound: enhancedResults.length,
        workflowUsed: !!contextualAnswer,
        workflows: workflows.size,
        query,
        mode,
        conversationState,
        contextualAnswer: contextualAnswer ? {
          workflowCategory: contextualAnswer.workflow.categoryCard?.title,
          currentStep: contextualAnswer.currentStep,
          totalSteps: contextualAnswer.workflow.totalSteps
        } : null,
        processedAt: new Date()
      };
      
      console.log('✅ Backend search complete:', {
        finalResults: enhancedResults.length,
        workflowUsed: !!contextualAnswer,
        workflowsBuilt: workflows.size,
        conversationState: conversationState ? {
          topic: conversationState.topic,
          escalationLevel: conversationState.escalationLevel,
          usedCards: conversationState.usedCards.length
        } : 'none',
        contextualStep: contextualAnswer?.currentStep || 'N/A',
        mode
      });
      console.log('🔍 === BACKEND CARD SEARCH END ===\n');
      
      return finalResult;
      
    } catch (error) {
      console.error('AI Chat Service: Card search error:', error);
      throw error;
    }
  }
  
  /**
   * Perform semantic search on cards
   */
  performSemanticSearch(cards, query, limit) {
    console.log('\n🔍 === SEMANTIC SEARCH DETAILS ===');
    console.log('📝 Query:', query);
    console.log('📚 Cards to search:', cards.length);
    
    const queryLower = query.toLowerCase();
    const searchTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    console.log('🔤 Search terms:', searchTerms);
    
    const results = cards.map(card => {
      let score = 0;
      const content = `${card.title} ${card.content || ''}`.toLowerCase();
      
      console.log(`\n🔍 Analyzing card: "${card.title}"`);
      console.log('🏠 Card space info:', {
        spaceId: card.spaceId?._id || card.spaceId,
        spaceName: card.spaceId?.name || 'No space name',
        spaceObject: card.spaceId
      });
      
      // Exact phrase match (highest score)
      if (content.includes(queryLower)) {
        score += 100;
        console.log('✅ Exact phrase match (+100)');
      }
      
      // Individual term matches
      searchTerms.forEach(term => {
        if (content.includes(term)) {
          score += 10;
          console.log(`✅ Term "${term}" found in content (+10)`);
        }
        
        // Title matches get bonus
        if (card.title.toLowerCase().includes(term)) {
          score += 20;
          console.log(`🎯 Term "${term}" found in title (+20)`);
        }
      });
      
      // Category/type relevance
      if (card.category && card.category.toLowerCase().includes(queryLower)) {
        score += 15;
        console.log('📂 Category match (+15)');
      }
      
      const result = {
        cardId: card._id.toString(),
        cardTitle: card.title,
        cardContent: card.content || '',
        cardCategory: card.category || '',
        spaceId: card.spaceId?._id || card.spaceId || 'unknown',
        spaceName: card.spaceId?.name || 'Unknown Space',
        relevanceScore: score,
        excerpt: this.generateExcerpt(card.content || card.title, queryLower)
      };
      
      console.log('📊 Final score:', score);
      console.log('🎯 Result:', {
        cardTitle: result.cardTitle,
        spaceId: result.spaceId,
        spaceName: result.spaceName,
        relevanceScore: result.relevanceScore
      });
      
      return result;
    })
    .filter(result => {
      const hasScore = result.relevanceScore > 0;
      if (!hasScore) {
        console.log(`❌ Filtered out "${result.cardTitle}" (score: ${result.relevanceScore})`);
      }
      return hasScore;
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
    
    console.log('\n🏆 FINAL SEARCH RESULTS:');
    results.forEach((result, index) => {
      console.log(`${index + 1}. "${result.cardTitle}" (${result.spaceName}) - Score: ${result.relevanceScore}`);
    });
    console.log('🔍 === SEMANTIC SEARCH DETAILS END ===\n');
    
    return results;
  }
  
  /**
   * Generate excerpt from content
   */
  generateExcerpt(content, query, maxLength = 200) {
    if (!content) return '';
    
    const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }
    
    const start = Math.max(0, queryIndex - 50);
    const end = Math.min(content.length, queryIndex + query.length + 50);
    
    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    
    return excerpt;
  }
  
  /**
   * Enhance search results with connection information
   */
  enhanceWithConnections(searchResults, connections, allCards) {
    const cardMap = new Map(allCards.map(card => [card._id.toString(), card]));
    
    return searchResults.map(result => {
            const relatedConnections = connections.filter(conn => 
        (conn.sourceId && conn.sourceId.toString() === result.cardId) || 
        (conn.targetId && conn.targetId.toString() === result.cardId)
      );

      const connectedCards = relatedConnections.map(conn => {
        const connectedCardId = (conn.sourceId && conn.sourceId.toString() === result.cardId) 
          ? (conn.targetId ? conn.targetId.toString() : null)
          : (conn.sourceId ? conn.sourceId.toString() : null);
        
        const connectedCard = connectedCardId ? cardMap.get(connectedCardId) : null;
        return (connectedCard && connectedCardId) ? {
          cardId: connectedCardId,
          cardTitle: connectedCard.title,
          connectionType: conn.type || 'related'
        } : null;
      }).filter(Boolean);
      
      return {
        ...result,
        connectedCards,
        connectionCount: connectedCards.length
      };
    });
  }

  /**
   * Enhance search results with ALL connected cards as full results (for process mode)
   */
  async enhanceWithAllConnectedCards(searchResults, allConnections, allCards, query) {
    console.log('\n🔗 === PROCESS MODE: ENHANCING WITH ALL CONNECTED CARDS ===');
    
    const cardMap = new Map(allCards.map(card => [card._id.toString(), card]));
    const startingCardIds = searchResults.map(r => r.cardId);
    
    console.log('🎯 Starting with cards:', startingCardIds.map(id => {
      const card = cardMap.get(id);
      return card ? `"${card.title}" (${card.spaceId?.name || card.spaceId || 'no space'})` : id;
    }));
    
    console.log('📚 Available cards for mapping:', allCards.length);
    console.log('🏢 Card spaces breakdown:');
    const spaceBreakdown = allCards.reduce((acc, card) => {
      const spaceId = card.spaceId?._id || card.spaceId || 'unknown';
      const spaceName = card.spaceId?.name || 'Unknown Space';
      const key = `${spaceId} (${spaceName})`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    Object.entries(spaceBreakdown).forEach(([space, count]) => {
      console.log(`  📁 ${space}: ${count} cards`);
    });
    
    // Find all related cards recursively (up to 3 levels deep for process analysis)
    const allRelatedCardIds = await this.findAllRelatedCards(startingCardIds, allConnections, 3);
    console.log(`🔍 Found ${allRelatedCardIds.size} total related cards`);
    
    // Check which related cards exist in our cardMap
    console.log('\n🔍 Checking card availability:');
    const availableRelatedCards = [];
    const missingCards = [];
    
    allRelatedCardIds.forEach(cardId => {
      if (cardMap.has(cardId)) {
        const card = cardMap.get(cardId);
        availableRelatedCards.push(card);
        console.log(`  ✅ Available: "${card.title}" (${card.spaceId?.name || card.spaceId || 'no space'})`);
      } else {
        missingCards.push(cardId);
        console.log(`  ❌ Missing: ${cardId}`);
      }
    });
    
    console.log(`📊 Card availability: ${availableRelatedCards.length} available, ${missingCards.length} missing`);
    
    // Convert all related cards to full result objects
    const enhancedResults = [...searchResults]; // Start with original results
    const processedCardIds = new Set(startingCardIds);
    
    allRelatedCardIds.forEach(cardId => {
      if (!processedCardIds.has(cardId)) {
        const card = cardMap.get(cardId);
        if (card) {
          console.log(`➕ Adding connected card: "${card.title}"`);
          
          // Calculate relevance based on connection distance and content similarity
          let relevanceScore = 30; // Base score for connected cards
          
          // Add points for content similarity
          const cardContent = `${card.title} ${card.content || ''}`.toLowerCase();
          const queryLower = query.toLowerCase();
          const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
          
          queryTerms.forEach(term => {
            if (cardContent.includes(term)) {
              relevanceScore += 15;
            }
            if (card.title.toLowerCase().includes(term)) {
              relevanceScore += 25;
            }
          });
          
          // Add points for exact phrase match
          if (cardContent.includes(queryLower)) {
            relevanceScore += 40;
          }
          
          // Find connections to this card
          const relatedConnections = allConnections.filter(conn => 
            conn.fromCardId.toString() === cardId || 
            conn.toCardId.toString() === cardId
          );
          
          const connectedCards = relatedConnections.map(conn => {
            const connectedCardId = conn.fromCardId.toString() === cardId 
              ? conn.toCardId.toString() 
              : conn.fromCardId.toString();
            
            const connectedCard = cardMap.get(connectedCardId);
            return connectedCard ? {
              cardId: connectedCardId,
              cardTitle: connectedCard.title,
              connectionType: conn.type || 'related'
            } : null;
          }).filter(Boolean);
          
          const connectedResult = {
            cardId: cardId,
            cardTitle: card.title,
            cardContent: card.content || '',
            cardCategory: card.category || '',
            spaceId: card.spaceId?._id || card.spaceId || 'unknown',
            spaceName: card.spaceId?.name || 'Unknown Space',
            relevanceScore: Math.min(relevanceScore, 85), // Cap at 85 so original results stay higher
            excerpt: this.generateExcerpt(card.content || card.title, query),
            connectedCards,
            connectionCount: connectedCards.length,
            isConnectedCard: true // Mark as connected card
          };
          
          enhancedResults.push(connectedResult);
          processedCardIds.add(cardId);
        }
      }
    });
    
    // Sort by relevance score (original search results should still be at top)
    enhancedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`✅ Enhanced results: ${enhancedResults.length} total cards`);
    console.log('🏆 Top enhanced results:');
    enhancedResults.slice(0, 10).forEach((result, index) => {
      console.log(`  ${index + 1}. "${result.cardTitle}" - Score: ${result.relevanceScore}${result.isConnectedCard ? ' (connected)' : ' (original)'}`);
    });
    console.log('🔗 === PROCESS MODE ENHANCEMENT COMPLETE ===\n');
    
    return enhancedResults;
  }
  
  /**
   * Discover process flow from connected cards
   */
  async discoverProcessFlow(cardIds, userId) {
    try {
      console.log('\n🔍 === PROCESS DISCOVERY START ===');
      console.log('📋 Starting card IDs:', cardIds);
      
      // Get all cards that match these IDs to have their details
      const startingCards = await Card.find({ 
        _id: { $in: cardIds } 
      }).lean();
      
      console.log('📚 Starting cards:', startingCards.map(c => `"${c.title}"`));
      
      // Get ALL connections in the system to map complete network
      const allConnections = await Connection.find({}).lean();
      console.log(`🔗 Total connections in system: ${allConnections.length}`);
      
      // Find all cards connected to our starting cards (both directions, recursively)
      const allRelatedCardIds = await this.findAllRelatedCards(cardIds, allConnections);
      console.log(`🎯 Found ${allRelatedCardIds.size} related cards total`);
      
      // Get full details of all related cards (no space restrictions for process analysis)
      console.log('📚 Fetching full details for all related cards...');
      const allRelatedCards = await Card.find({ 
        _id: { $in: Array.from(allRelatedCardIds) } 
      }).lean();
      
      console.log(`✅ Retrieved ${allRelatedCards.length} related cards from database`);
      
      // If we're missing some cards, they might be in spaces we didn't initially load
      const foundCardIds = new Set(allRelatedCards.map(c => c._id.toString()));
      const missingCardIds = Array.from(allRelatedCardIds).filter(id => !foundCardIds.has(id));
      
      if (missingCardIds.length > 0) {
        console.log(`⚠️ Missing ${missingCardIds.length} cards from initial fetch:`, missingCardIds);
        console.log('🔍 This might indicate cards in inaccessible spaces or deleted cards');
      }
      
      // Identify category cards (potential branch roots)
      const categoryCards = allRelatedCards.filter(card => 
        this.workflowEngine.isCategoryCard(card)
      );
      console.log(`📁 Found ${categoryCards.length} category cards:`, 
        categoryCards.map(c => `"${c.title}"`));
      
      // Build complete process tree starting from categories or highest relevance cards
      const processTree = await this.buildCompleteProcessTree(
        allRelatedCards, 
        allConnections, 
        startingCards
      );
      
      console.log('🌳 Process tree built with branches:', processTree.branches.length);
      console.log('🔄 === PROCESS DISCOVERY END ===\n');
      
      return processTree;
      
    } catch (error) {
      console.error('AI Chat Service: Enhanced process discovery error:', error);
      return { branches: [], usedCards: [], totalSteps: 0 };
    }
  }
  
  /**
   * Find all cards related to starting cards (recursive traversal)
   */
  async findAllRelatedCards(startingCardIds, allConnections, maxDepth = 5) {
    console.log('\n🕸 === FINDING ALL RELATED CARDS ===');
    console.log('🎯 Starting card IDs:', startingCardIds);
    console.log('🔗 Total connections in system:', allConnections.length);
    console.log('🏔 Max depth for traversal:', maxDepth);
    
    const relatedCardIds = new Set(startingCardIds);
    const visited = new Set();
    const connectionPaths = new Map(); // Track how we found each card
    
    // Initialize paths for starting cards
    startingCardIds.forEach(cardId => {
      connectionPaths.set(cardId, { depth: 0, path: 'starting' });
    });
    
    const traverseConnections = (cardIds, currentDepth) => {
      console.log(`\n🔄 Depth ${currentDepth}: Processing ${cardIds.length} cards`);
      
      if (currentDepth >= maxDepth) {
        console.log(`⛔ Reached max depth ${maxDepth}, stopping traversal`);
        return;
      }
      
      const newlyFoundCards = [];
      
      cardIds.forEach(cardId => {
        if (visited.has(cardId)) {
          console.log(`  ⏭ Skipping already visited card: ${cardId}`);
          return;
        }
        visited.add(cardId);
        
        console.log(`  🔍 Processing card: ${cardId}`);
        
        // Find all connections FROM this card
        const outgoingConnections = allConnections.filter(conn => 
          conn.sourceId && conn.sourceId.toString() === cardId.toString()
        );
        
        console.log(`    ➡️ Found ${outgoingConnections.length} outgoing connections`);
        
        // Find all connections TO this card  
        const incomingConnections = allConnections.filter(conn => 
          conn.targetId && conn.targetId.toString() === cardId.toString()
        );
        
        console.log(`    ⬅️ Found ${incomingConnections.length} incoming connections`);
        
        // Add connected card IDs
        [...outgoingConnections, ...incomingConnections].forEach(conn => {
          const connectedCardId = conn.sourceId.toString() === cardId.toString() 
            ? conn.targetId.toString() 
            : conn.sourceId.toString();
          
          console.log(`    🔗 Connection: ${cardId} ${conn.sourceId.toString() === cardId.toString() ? '➡️' : '⬅️'} ${connectedCardId}`);
          
          if (!relatedCardIds.has(connectedCardId)) {
            console.log(`    ✅ Adding new related card: ${connectedCardId}`);
            relatedCardIds.add(connectedCardId);
            connectionPaths.set(connectedCardId, { 
              depth: currentDepth + 1, 
              path: `${connectionPaths.get(cardId)?.path || cardId} → ${connectedCardId}` 
            });
            newlyFoundCards.push(connectedCardId);
          } else {
            console.log(`    ⏭ Card ${connectedCardId} already in results`);
          }
        });
      });
      
      console.log(`  📊 Found ${newlyFoundCards.length} new cards at depth ${currentDepth + 1}`);
      
      if (newlyFoundCards.length > 0) {
        // Recursively traverse from newly found cards
        traverseConnections(newlyFoundCards, currentDepth + 1);
      }
    };
    
    traverseConnections(startingCardIds, 0);
    
    console.log('\n📊 === TRAVERSAL COMPLETE ===');
    console.log(`🎯 Total related cards found: ${relatedCardIds.size}`);
    console.log('📋 Related card IDs:', Array.from(relatedCardIds));
    
    console.log('\n🕳 Connection paths:');
    Array.from(relatedCardIds).forEach(cardId => {
      const pathInfo = connectionPaths.get(cardId);
      console.log(`  ${cardId}: depth ${pathInfo?.depth}, path: ${pathInfo?.path}`);
    });
    
    console.log('🕸 === FINDING ALL RELATED CARDS END ===\n');
    
    return relatedCardIds;
  }
  
  /**
   * Build complete process tree with all branches and steps
   */
  async buildCompleteProcessTree(allCards, allConnections, startingCards) {
    const cardMap = new Map(allCards.map(card => [card._id.toString(), card]));
    const branches = [];
    const usedCards = new Set();
    
    // Find root cards (categories or cards with no incoming connections in our set)
    const cardIds = allCards.map(c => c._id.toString());
    const hasIncoming = new Set();
    
    allConnections.forEach(conn => {
      if (conn.targetId && cardIds.includes(conn.targetId.toString())) {
        hasIncoming.add(conn.targetId.toString());
      }
    });
    
    const rootCards = allCards.filter(card => 
      !hasIncoming.has(card._id.toString()) || 
      this.workflowEngine.isCategoryCard(card)
    );
    
    console.log(`🌱 Found ${rootCards.length} root cards:`, rootCards.map(c => c.title));
    
    // Group cards into separate workflow chains
    const workflowChains = this.identifyWorkflowChains(allCards, allConnections);
    console.log(`🔍 Identified ${workflowChains.length} separate workflow chains`);
    
    // Select the most relevant workflow chain based on search results
    const selectedChain = this.selectMostRelevantWorkflow(workflowChains, startingCards);
    
    if (selectedChain) {
      // Sort the chain in proper workflow order (category → step1 → step2 → etc.)
      const sortedChain = this.sortWorkflowChain(selectedChain.cards, allConnections);
      console.log(`✅ Selected workflow chain: ${sortedChain.map(c => c.title).join(' → ')}`);
      
      // Build branch from properly sorted chain
      const rootCard = sortedChain[0];
      const branch = this.traceBranch(rootCard, allConnections, cardMap, usedCards);
      if (branch.steps.length > 0) {
        branches.push(branch);
      }
    } else {
      // Fallback: If no clear chains found, use original logic
      const finalRoots = rootCards.length > 0 ? rootCards : startingCards.slice(0, 1); // Only take first card
      
      finalRoots.forEach(rootCard => {
        const branch = this.traceBranch(rootCard, allConnections, cardMap, usedCards);
        if (branch.steps.length > 0) {
          branches.push(branch);
        }
      });
    }
    
    return {
      branches,
      usedCards: Array.from(usedCards),
      totalSteps: branches.reduce((sum, branch) => sum + branch.steps.length, 0),
      summary: this.generateProcessSummary(branches, cardMap)
    };
  }
  
  /**
   * Trace a complete branch of the process tree
   */
  traceBranch(startCard, allConnections, cardMap, globalUsedCards) {
    const branch = {
      rootCard: {
        id: startCard._id.toString(),
        title: startCard.title,
        type: this.workflowEngine.isCategoryCard(startCard) ? 'category' : 'answer'
      },
      steps: [],
      alternatives: []
    };
    
    const visited = new Set();
    const currentPath = [];
    
    const traceFromCard = (card, stepNumber = 1) => {
      const cardId = card._id.toString();
      
      if (visited.has(cardId)) return;
      visited.add(cardId);
      globalUsedCards.add(cardId);
      
      // Add current card as a step
      const step = {
        stepNumber,
        cardId,
        title: card.title,
        content: card.content || '',
        type: this.workflowEngine.isCategoryCard(card) ? 'category' : 'answer'
      };
      
      branch.steps.push(step);
      currentPath.push(step);
      
      // Find all outgoing connections from this card
      const outgoingConnections = allConnections.filter(conn => 
        conn.sourceId && conn.sourceId.toString() === cardId
      );
      
      if (outgoingConnections.length === 0) {
        // End of path
        return;
      } else if (outgoingConnections.length === 1) {
        // Single path - continue tracing
        const nextCardId = outgoingConnections[0].targetId ? outgoingConnections[0].targetId.toString() : null;
        const nextCard = nextCardId ? cardMap.get(nextCardId) : null;
        if (nextCard && !visited.has(nextCardId)) {
          traceFromCard(nextCard, stepNumber + 1);
        }
      } else {
        // Multiple paths - create alternatives
        outgoingConnections.forEach((conn, index) => {
          const nextCardId = conn.targetId ? conn.targetId.toString() : null;
          const nextCard = nextCardId ? cardMap.get(nextCardId) : null;
          if (nextCard && !visited.has(nextCardId)) {
            if (index === 0) {
              // First alternative continues main branch
              traceFromCard(nextCard, stepNumber + 1);
            } else {
              // Additional alternatives
              const alternativeBranch = this.traceBranch(nextCard, allConnections, cardMap, new Set());
              branch.alternatives.push({
                fromStep: stepNumber,
                condition: `Alternative path ${index}`,
                branch: alternativeBranch
              });
            }
          }
        });
      }
    };
    
    traceFromCard(startCard);
    return branch;
  }
  
  /**
   * Identify separate workflow chains from cards and connections
   */
  identifyWorkflowChains(allCards, allConnections) {
    const cardMap = new Map(allCards.map(card => [card._id.toString(), card]));
    const visited = new Set();
    const chains = [];
    
    // Find all connected components (workflow chains)
    allCards.forEach(card => {
      const cardId = card._id.toString();
      if (visited.has(cardId)) return;
      
      // Start a new chain from this card
      const chain = this.traceConnectedComponent(card, allConnections, cardMap, visited);
      if (chain.length > 1) { // Only chains with multiple cards
        chains.push({
          cards: chain,
          rootCard: chain[0],
          length: chain.length,
          titles: chain.map(c => c.title)
        });
      }
    });
    
    return chains;
  }
  
  /**
   * Trace a connected component starting from a card
   */
  traceConnectedComponent(startCard, allConnections, cardMap, globalVisited) {
    const component = [];
    const visited = new Set();
    const queue = [startCard];
    
    while (queue.length > 0) {
      const card = queue.shift();
      const cardId = card._id.toString();
      
      if (visited.has(cardId)) continue;
      visited.add(cardId);
      globalVisited.add(cardId);
      component.push(card);
      
      // Find all connected cards (both directions)
      const connections = allConnections.filter(conn =>
        (conn.sourceId && conn.sourceId.toString() === cardId) ||
        (conn.targetId && conn.targetId.toString() === cardId)
      );
      
      connections.forEach(conn => {
        const connectedCardId = conn.sourceId.toString() === cardId 
          ? conn.targetId.toString() 
          : conn.sourceId.toString();
        
        const connectedCard = cardMap.get(connectedCardId);
        if (connectedCard && !visited.has(connectedCardId)) {
          queue.push(connectedCard);
        }
      });
    }
    
    return component;
  }
  
  /**
   * Get accessible cards for a user (helper function)
   */
  async getAccessibleCards(userId) {
    try {
      // Get all cards in system for process mode
      const allCards = await Card.find({}).lean();
      
      // Get space info
      const uniqueSpaceIds = [...new Set(allCards.map(card => card.spaceId).filter(Boolean))];
      const spaceMap = new Map();
      
      // Add public space
      spaceMap.set('public', { _id: 'public', name: 'Public Space' });
      
      // Fetch space info for other spaces
      for (const spaceId of uniqueSpaceIds) {
        if (spaceId === 'public' || spaceMap.has(spaceId)) continue;
        
        try {
          const space = await Space.findById(spaceId).lean();
          if (space) {
            spaceMap.set(spaceId, space);
          } else {
            spaceMap.set(spaceId, { _id: spaceId, name: 'Unknown Space' });
          }
        } catch (error) {
          spaceMap.set(spaceId, { _id: spaceId, name: 'Unknown Space' });
        }
      }
      
      // Add space info to cards
      return allCards.map(card => ({
        ...card,
        spaceId: card.spaceId,
        spaceName: spaceMap.get(card.spaceId)?.name || 'Unknown Space'
      }));
      
    } catch (error) {
      console.error('Error getting accessible cards:', error);
      return [];
    }
  }

  /**
   * Get all cards in the workflow chain for a given card
   */
  async getWorkflowCards(cardId, userId) {
    try {
      // Get all connections and cards
      const allConnections = await Connection.find({}).lean();
      const cardsWithSpaceInfo = await this.getAccessibleCards(userId);
      
      // Find all related cards in the workflow
      const relatedCardIds = await this.findAllRelatedCards([cardId], allConnections, 5);
      const relatedCards = cardsWithSpaceInfo.filter(card => 
        relatedCardIds.has(card._id.toString())
      );
      
      // Sort them in proper workflow order
      const sortedCards = this.sortWorkflowChain(relatedCards, allConnections);
      
      // Add type information
      return sortedCards.map(card => ({
        ...card,
        type: this.workflowEngine.isCategoryCard(card) ? 'category' : 'action'
      }));
      
    } catch (error) {
      console.error('Error getting workflow cards:', error);
      // Fallback: return just the original card
      const cardsWithSpaceInfo = await this.getAccessibleCards(userId);
      const originalCard = cardsWithSpaceInfo.find(c => c._id.toString() === cardId);
      return originalCard ? [{ ...originalCard, type: 'action' }] : [];
    }
  }

  /**
   * Sort workflow chain cards in proper order (category first, then follow connections)
   */
  sortWorkflowChain(cards, allConnections) {
    // Find category card (should be first)
    const categoryCard = cards.find(card => this.workflowEngine.isCategoryCard(card));
    if (!categoryCard) {
      // If no category, return cards as-is
      return cards;
    }
    
    const sortedChain = [categoryCard];
    const remaining = cards.filter(card => card._id.toString() !== categoryCard._id.toString());
    const used = new Set([categoryCard._id.toString()]);
    
    // Follow connections from category card
    let currentCard = categoryCard;
    while (remaining.length > 0) {
      const currentCardId = currentCard._id.toString();
      
      // Find next card in chain
      const nextConnection = allConnections.find(conn =>
        conn.sourceId && conn.sourceId.toString() === currentCardId &&
        conn.targetId && !used.has(conn.targetId.toString())
      );
      
      if (nextConnection) {
        const nextCard = remaining.find(card => 
          card._id.toString() === nextConnection.targetId.toString()
        );
        
        if (nextCard) {
          sortedChain.push(nextCard);
          used.add(nextCard._id.toString());
          currentCard = nextCard;
          continue;
        }
      }
      
      // If no connection found, add remaining cards in original order
      remaining.filter(card => !used.has(card._id.toString())).forEach(card => {
        sortedChain.push(card);
        used.add(card._id.toString());
      });
      break;
    }
    
    return sortedChain;
  }

  /**
   * Select the most relevant workflow chain based on starting cards
   */
  selectMostRelevantWorkflow(workflowChains, startingCards) {
    if (workflowChains.length === 0) return null;
    if (workflowChains.length === 1) return workflowChains[0];
    
    const startingCardIds = new Set(startingCards.map(c => c._id.toString()));
    
    // Score each chain based on relevance
    const scoredChains = workflowChains.map(chain => {
      let score = 0;
      
      // Bonus for containing starting cards
      const containsStartingCards = chain.cards.filter(c => 
        startingCardIds.has(c._id.toString())
      ).length;
      score += containsStartingCards * 100;
      
      // Bonus for chain length (longer chains are more comprehensive)
      score += chain.length * 10;
      
      // Bonus for having meaningful titles (not just numbers)
      const meaningfulTitles = chain.cards.filter(c => 
        c.title.length > 5 && !c.title.match(/^.+#\d+$/)
      ).length;
      score += meaningfulTitles * 5;
      
      return { ...chain, score };
    });
    
    // Sort by score and return the best one
    scoredChains.sort((a, b) => b.score - a.score);
    
    console.log('🏆 Workflow chain scores:');
    scoredChains.forEach((chain, index) => {
      console.log(`  ${index + 1}. ${chain.titles.join(' → ')} - Score: ${chain.score}`);
    });
    
    return scoredChains[0];
  }

  /**
   * Generate a summary of the complete process
   */
  generateProcessSummary(branches, cardMap) {
    const totalSteps = branches.reduce((sum, branch) => sum + branch.steps.length, 0);
    const categories = branches.filter(b => b.rootCard.type === 'category').length;
    const alternatives = branches.reduce((sum, branch) => sum + branch.alternatives.length, 0);
    
    return {
      totalBranches: branches.length,
      totalSteps,
      categoriesFound: categories,
      alternativePaths: alternatives,
      complexity: totalSteps > 20 ? 'high' : totalSteps > 10 ? 'medium' : 'low'
    };
  }
  
  /**
   * Generate AI response using OpenAI
   */
  async generateResponse(userId, message, mode, searchResults, context = {}) {
    console.log('\n🤖 === AI RESPONSE GENERATION START (Backend) ===');
    console.log('👤 User ID:', userId);
    console.log('💬 Message:', message);
    console.log('⚙️ Mode:', mode);
    console.log('📊 Search results count:', searchResults?.results?.length || 0);
    
    const startTime = Date.now();
    
    try {
      if (!openai) {
        console.log('⚠️ OpenAI not available - using fallback response');
        return this.generateFallbackResponse(message, mode, searchResults);
      }
      
      const modeConfig = AI_MODES[mode] || AI_MODES.macro;
      console.log('📋 Mode config:', {
        name: modeConfig.name,
        temperature: modeConfig.temperature,
        maxTokens: modeConfig.maxTokens
      });
      
      // Build context from search results
      const results = searchResults.results || searchResults || [];
      console.log('🔍 Processing search results for AI context...');
      
      let cardContext = '';
      let responseMode = 'single'; // Default to single card response
      let workflowCards = []; // Store workflow cards for sources
      
      if (results.length > 0) {
        // Check if this is a contextual workflow answer
        const isContextual = results[0]?.isContextual;
        
        if (isContextual && mode === 'process') {
          // For process mode with contextual workflow, get ALL cards in the workflow
          responseMode = 'process_workflow';
          console.log('🔄 Building complete workflow context...');
          
          // Get all cards from the workflow
          const contextualCard = results[0];
          workflowCards = await this.getWorkflowCards(contextualCard.cardId, userId);
          
          cardContext = `COMPLETE WORKFLOW PROCESS (${workflowCards.length} cards):

`;
          
          workflowCards.forEach((card, index) => {
            cardContext += `STEP ${index + 1}: "${card.title}" ${card.type === 'category' ? '(Category)' : '(Action)'}
- Content: ${card.content}
- Role: ${card.type === 'category' ? 'Process Category' : `Step ${index} in workflow`}

`;
          });
          
          cardContext += `WORKFLOW FACTS EXTRACTION:
- Extract ONLY pure facts, rules, and procedures from ALL cards above
- Focus on specific business rules (like "bonuses via mail/telegram only")
- List concrete facts (like "support cannot influence timing")
- Identify specific triggers and conditions
- NO explanations - just hard facts for quick reference
- Each fact = 1 short sentence maximum`;
          
        } else if (isContextual) {
          // For non-process contextual answers, use only the specific card
          const contextualCard = results[0];
          cardContext = `PRIMARY CARD: "${contextualCard.cardTitle}" (Step ${contextualCard.workflowStep})
Content: ${contextualCard.cardContent}
Context: This is step ${contextualCard.workflowStep} in a workflow sequence.
Instructions: Use ONLY this card's content for the response. Do not combine with other cards.`;
          responseMode = 'contextual';
          console.log('🎯 Using contextual workflow card only');
        } else if (mode === 'process') {
          // For process mode, include ALL relevant cards and their connections
          responseMode = 'process';
          console.log('🔄 Building comprehensive process context...');
          
          cardContext = `DISCOVERED PROCESS CARDS (${results.length} total):

`;
          
          results.slice(0, 15).forEach((result, index) => {
            cardContext += `CARD ${index + 1}: "${result.cardTitle}" (${result.spaceName})
- Relevance: ${result.relevanceScore}%${result.isConnectedCard ? ' (Connected Card)' : ''}
- Content: ${result.cardContent || result.excerpt}
- Connected Cards: ${result.connectedCards?.length || 0}
${result.connectedCards?.length > 0 ? 
  '- Connections: ' + result.connectedCards.map(cc => `"${cc.cardTitle}"`).join(', ') : ''}

`;
          });
          
          cardContext += `PROCESS ANALYSIS INSTRUCTIONS:
- Analyze ALL cards above to understand the complete workflow
- Identify the main process category/branch
- Map out step-by-step procedures from the connected cards
- Include decision points and alternative paths
- Document which specific cards contribute to each part of the process`;
          
        } else {
          // For semantic search, still prefer single best match
          const primaryCard = results[0];
          cardContext = `PRIMARY CARD: "${primaryCard.cardTitle}" (${primaryCard.spaceName})
Content: ${primaryCard.cardContent || primaryCard.excerpt}
Relevance: ${primaryCard.relevanceScore}%
Instructions: Use primarily this card's content. Only reference other cards if absolutely necessary.`;
          responseMode = 'semantic';
          console.log('🔍 Using primary semantic match');
        }
      }
      
      console.log('📝 Card context length:', cardContext.length);
      console.log('⚙️ Response mode:', responseMode);
      
      // Build conversation context
      const conversationContext = context.recentMessages 
        ? context.recentMessages.slice(-5).map(msg => 
            `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content}`
          ).join('\n')
        : '';
      
      console.log('💭 Conversation context length:', conversationContext.length);
      
      // Add conversation state context to prompt
      let contextEnhancement = '';
      if (searchResults.conversationState) {
        contextEnhancement = this.conversationStateManager.getContextPromptEnhancement(
          searchResults.conversationState
        );
        console.log('🧠 Adding conversation context enhancement:', contextEnhancement.length, 'characters');
      }

      const userPrompt = this.buildUserPrompt(message, mode, cardContext, conversationContext, contextEnhancement);
      console.log('📨 User prompt length:', userPrompt.length);
      
      console.log(`\n🧠 Calling OpenAI API (${mode} mode)...`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: modeConfig.systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        temperature: modeConfig.temperature,
        max_tokens: modeConfig.maxTokens
      });
      
      const processingTime = Date.now() - startTime;
      const aiResponse = response.choices[0].message.content;
      
      console.log('✅ OpenAI response received:', {
        length: aiResponse.length,
        tokensUsed: response.usage?.total_tokens || 0,
        processingTime: processingTime + 'ms'
      });
      
      // Calculate confidence based on search results
      const confidence = this.calculateConfidence(searchResults, aiResponse);
      console.log('💯 Calculated confidence:', confidence);
      
      // Generate process flow if in process mode
      let processFlow = [];
      if (mode === 'process' && results.length > 0) {
        console.log('🔄 Discovering process flow...');
        const cardIds = results.map(r => r.cardId);
        processFlow = await this.discoverProcessFlow(cardIds, userId);
        console.log('📋 Process flow steps:', processFlow.branches.length);
      }

      // Determine which cards to use as sources
      let sourcesToUse = results;
      if (responseMode === 'process_workflow' && workflowCards.length > 0) {
        // For workflow responses, use all workflow cards as sources
        sourcesToUse = workflowCards.map(card => ({
          cardId: card._id.toString(),
          cardTitle: card.title,
          spaceId: card.spaceId,
          spaceName: card.spaceName,
          relevanceScore: 100, // All workflow cards are highly relevant
          excerpt: card.content?.substring(0, 200) + (card.content?.length > 200 ? '...' : ''),
          isConnectedCard: true,
          cardType: card.type
        }));
        console.log(`🎯 Using ${sourcesToUse.length} workflow cards as sources`);
      }

      const finalResponse = {
        content: aiResponse,
        sources: sourcesToUse.slice(0, mode === 'process' ? 15 : 5).map(result => ({
          cardId: result.cardId,
          cardTitle: result.cardTitle,
          spaceId: result.spaceId,
          spaceName: result.spaceName,
          relevanceScore: result.relevanceScore,
          excerpt: result.excerpt,
          isConnectedCard: result.isConnectedCard || false,
          cardType: result.cardType || 'action'
        })),
        confidence,
        processFlow,
        // For process mode, add enhanced metadata about the process analysis
        processMetadata: mode === 'process' && processFlow ? {
          totalBranches: processFlow.branches?.length || 0,
          totalSteps: processFlow.totalSteps || 0,
          usedCards: processFlow.usedCards || [],
          complexity: processFlow.summary?.complexity || 'unknown',
          alternativePaths: processFlow.summary?.alternativePaths || 0
        } : null,
        metadata: {
          processingTime,
          tokensUsed: response.usage?.total_tokens || 0,
          model: "gpt-4.1-nano-2025-04-14",
          temperature: modeConfig.temperature,
          mode
        }
      };
      
      console.log('🎉 Final response prepared:', {
        contentLength: finalResponse.content.length,
        sourcesCount: finalResponse.sources.length,
        confidence: finalResponse.confidence,
        processFlowBranches: finalResponse.processFlow?.branches?.length || 0,
        processMetadata: finalResponse.processMetadata
      });
      console.log('🤖 === AI RESPONSE GENERATION END (Backend) ===\n');
      
      return finalResponse;
      
    } catch (error) {
      console.error('AI Chat Service: OpenAI API error:', error);
      
      // Fallback to basic response
      return this.generateFallbackResponse(message, mode, searchResults);
    }
  }
  
  /**
   * Build user prompt based on mode and context
   */
  buildUserPrompt(message, mode, cardContext, conversationContext, contextEnhancement = '') {
    let prompt = '';
    
    switch (mode) {
      case 'macro':
        prompt = `CUSTOMER SERVICE REQUEST: "${message}"

${cardContext ? `CARD TEMPLATE:
${cardContext}

INSTRUCTIONS: Generate a customer service response based on the PRIMARY CARD template above. Use the card's content as the foundation for your response. Do NOT combine multiple cards or templates. Focus on the specific card provided and adapt it to address the customer's request. If the card content doesn't fully match the request, enhance it appropriately while staying true to the card's intent.` : 'Note: No relevant card template found. Generate a professional customer service response based on best practices.'}

${conversationContext ? `\nPREVIOUS CONVERSATION CONTEXT:\n${conversationContext}` : ''}
${contextEnhancement ? `\n${contextEnhancement}` : ''}

Generate a complete, ready-to-send customer service response based on the PRIMARY CARD:`;
        break;
        
      case 'rephrase':
        prompt = `Please rephrase and improve this text: "${message}"
        
${cardContext ? `\nReference examples from cards:\n${cardContext}` : ''}

Provide only the improved version with better tone, clarity, and professionalism.`;
        break;
        
      case 'explain':
        prompt = `Analyze and explain what this customer wants or needs: "${message}"
        
${cardContext ? `\nRelevant information from cards:\n${cardContext}` : ''}

Provide a clear analysis of their intent, concerns, and what type of response they need.`;
        break;
        
      case 'summarize':
        prompt = `Create a concise summary of this content: "${message}"
        
${conversationContext ? `\nConversation context:\n${conversationContext}` : ''}

Focus on key points, decisions, and action items.`;
        break;
        
      case 'translate':
        prompt = `Translate this text while maintaining professional business tone: "${message}"
        
If the target language is not specified, detect the source language and translate to English.`;
        break;
        
      case 'improve':
        prompt = `Significantly improve this customer service response: "${message}"
        
${cardContext ? `\nReference materials:\n${cardContext}` : ''}

Make it more effective, professional, and helpful. Exceed customer expectations.`;
        break;
        
      case 'process':
        prompt = `PROCESS FACTS REQUEST: "${message}"

${cardContext ? `PROCESS CARDS AND CONNECTIONS:
${cardContext}

INSTRUCTIONS: Create a CONCISE, FACTUAL summary of what to do in each situation. Users already know HOW to write responses (empathy, tone, etc.) - they need to know WHAT FACTS to use and WHEN.

Format your response as:
• **SITUATION**: Brief description of when this applies
• **KEY FACTS**: Bullet points of main facts/rules to remember
• **ACTIONS**: What specifically to do (not how to write it)
• **DECISION POINTS**: When to escalate/change approach

Keep it SHORT and FACTUAL. Focus on business rules, facts, and concrete actions - NOT on writing style or emotional approaches.` : 'Note: No relevant process cards found. Generate a general process framework based on best practices.'}

${conversationContext ? `\nPREVIOUS CONVERSATION CONTEXT:\n${conversationContext}` : ''}
${contextEnhancement ? `\n${contextEnhancement}` : ''}

Generate a concise, factual process summary:`;
        break;
        
      case 'search':
        prompt = `Help find relevant information for: "${message}"
        
${cardContext ? `\nFound these relevant cards:\n${cardContext}` : ''}

Explain the search results and suggest related content that might be helpful.`;
        break;
        
      default:
        prompt = `Respond to this request: "${message}"
        
${cardContext ? `\nAvailable information:\n${cardContext}` : ''}`;
    }
    
    return prompt;
  }
  
  /**
   * Calculate confidence score based on search results and response quality
   */
  calculateConfidence(searchResults, response) {
    let confidence = 50; // Base confidence
    
    const results = searchResults.results || searchResults || [];
    
    // Boost confidence based on search results
    if (results.length > 0) {
      const avgRelevance = results.reduce((sum, result) => sum + result.relevanceScore, 0) / results.length;
      confidence += Math.min(40, avgRelevance / 2);
    }
    
    // Boost confidence based on response length and quality
    if (response.length > 100) confidence += 5;
    if (response.length > 300) confidence += 5;
    
    // Reduce confidence if no relevant cards found
    if (results.length === 0) {
      confidence -= 20;
    }
    
    return Math.min(100, Math.max(10, Math.round(confidence)));
  }
  
  /**
   * Generate fallback response when OpenAI is not available
   */
  generateFallbackResponse(message, mode, searchResults) {
    const results = searchResults.results || searchResults || [];
    const sources = results.slice(0, 3);
    
    let content = '';
    
    switch (mode) {
      case 'macro':
        content = sources.length > 0 
          ? `Based on the available information, here's a response for your request:\n\n${sources.map(s => `• ${s.cardTitle}: ${s.excerpt}`).join('\n')}\n\n[AI service temporarily unavailable - response generated from available cards]`
          : `I understand your request: "${message}". However, I need more specific information from your cards to provide a detailed response. [AI service temporarily unavailable]`;
        break;
        
      case 'process':
        content = sources.length > 0
          ? `Process Analysis for: "${message}"\n\nFound ${sources.length} relevant process cards:\n\n${sources.map((s, i) => `${i + 1}. ${s.cardTitle} (${s.spaceName})\n   Relevance: ${s.relevanceScore}%\n   ${s.excerpt}\n`).join('\n')}\n\n[AI service temporarily unavailable - showing discovered cards for process analysis]`
          : `Process request: "${message}". No specific process cards found. Consider creating cards for this workflow or checking if you have access to relevant spaces.`;
        break;
        
      case 'search':
        content = sources.length > 0
          ? `Found ${sources.length} relevant cards:\n\n${sources.map(s => `• ${s.cardTitle} (${s.spaceName}) - Relevance: ${s.relevanceScore}%\n  ${s.excerpt}`).join('\n\n')}`
          : `No specific cards found for "${message}". Try different search terms or check if you have access to relevant spaces.`;
        break;
        
      default:
        content = `Request received: "${message}". AI processing is temporarily unavailable. Please try again later or contact support if this persists.`;
    }
    
    return {
      content,
      sources: sources.map(s => ({
        cardId: s.cardId,
        cardTitle: s.cardTitle,
        spaceId: s.spaceId,
        spaceName: s.spaceName,
        relevanceScore: s.relevanceScore,
        excerpt: s.excerpt
      })),
      confidence: sources.length > 0 ? 60 : 20,
      processFlow: [],
      metadata: {
        processingTime: 100,
        tokensUsed: 0,
        model: 'fallback',
        temperature: 0,
        mode
      }
    };
  }
}

module.exports = new AIChatService(); 