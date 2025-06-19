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
    systemPrompt: `You are a process documentation expert. Explain workflows and processes based on connected cards and business logic.

Focus on:
- Creating clear step-by-step processes
- Explaining card relationships
- Identifying workflow patterns
- Documenting procedures
- Providing actionable guidance

Structure processes clearly with numbered steps and clear connections.`,
    temperature: 0.2,
    maxTokens: 800
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
      
      if (searchAll) {
        // Search ALL cards in system (use with caution - admin/debug mode)
        cardQuery = {};
        console.log('🚨 SEARCHING ALL CARDS IN SYSTEM (Admin mode)');
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
      
      // Fetch space info for non-public spaces
      for (const spaceId of uniqueSpaceIds) {
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
          spaceId: cardsWithSpaceInfo.find(c => c.id === contextualAnswer.card.id)?.spaceId,
          spaceName: cardsWithSpaceInfo.find(c => c.id === contextualAnswer.card.id)?.spaceName || 'Unknown',
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
          const card = cardsWithSpaceInfo.find(c => c.id === result.cardId);
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
          finalResults.some(r => r.cardId === conn.fromCardId || r.cardId === conn.toCardId)
        );
        console.log(`📎 Found ${resultConnections.length} relevant connections`);
        
        enhancedResults = this.enhanceWithConnections(finalResults, resultConnections, cardsWithSpaceInfo);
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
        conn.fromCardId.toString() === result.cardId || 
        conn.toCardId.toString() === result.cardId
      );
      
      const connectedCards = relatedConnections.map(conn => {
        const connectedCardId = conn.fromCardId.toString() === result.cardId 
          ? conn.toCardId.toString() 
          : conn.fromCardId.toString();
        
        const connectedCard = cardMap.get(connectedCardId);
        return connectedCard ? {
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
   * Discover process flow from connected cards
   */
  async discoverProcessFlow(cardIds, userId) {
    try {
      // Get all connections involving these cards
      const connections = await Connection.find({
        $or: [
          { fromCardId: { $in: cardIds } },
          { toCardId: { $in: cardIds } }
        ]
      }).lean();
      
      // Build process flow
      const processFlow = this.buildProcessFlow(connections, cardIds);
      
      return processFlow;
      
    } catch (error) {
      console.error('AI Chat Service: Process discovery error:', error);
      return [];
    }
  }
  
  /**
   * Build process flow from connections
   */
  buildProcessFlow(connections, startCardIds) {
    const flow = [];
    const visited = new Set();
    
    // Simple process flow discovery
    startCardIds.forEach(cardId => {
      if (!visited.has(cardId)) {
        const sequence = this.traceSequence(cardId, connections, visited);
        if (sequence.length > 1) {
          flow.push(...sequence);
        }
      }
    });
    
    return flow;
  }
  
  /**
   * Trace sequence of connected cards
   */
  traceSequence(startCardId, connections, visited) {
    const sequence = [startCardId];
    visited.add(startCardId);
    
    // Find next card in sequence
    const nextConnection = connections.find(conn => 
      conn.fromCardId.toString() === startCardId && 
      !visited.has(conn.toCardId.toString())
    );
    
    if (nextConnection) {
      const nextSequence = this.traceSequence(nextConnection.toCardId.toString(), connections, visited);
      sequence.push(...nextSequence);
    }
    
    return sequence;
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
      
      if (results.length > 0) {
        // Check if this is a contextual workflow answer
        const isContextual = results[0]?.isContextual;
        
        if (isContextual) {
          // For contextual answers, use only the specific card
          const contextualCard = results[0];
          cardContext = `PRIMARY CARD: "${contextualCard.cardTitle}" (Step ${contextualCard.workflowStep})
Content: ${contextualCard.cardContent}
Context: This is step ${contextualCard.workflowStep} in a workflow sequence.
Instructions: Use ONLY this card's content for the response. Do not combine with other cards.`;
          responseMode = 'contextual';
          console.log('🎯 Using contextual workflow card only');
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
        console.log('📋 Process flow steps:', processFlow.length);
      }

      const finalResponse = {
        content: aiResponse,
        sources: results.slice(0, 5).map(result => ({
          cardId: result.cardId,
          cardTitle: result.cardTitle,
          spaceId: result.spaceId,
          spaceName: result.spaceName,
          relevanceScore: result.relevanceScore,
          excerpt: result.excerpt
        })),
        confidence,
        processFlow,
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
        processFlowSteps: finalResponse.processFlow.length
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
        prompt = `Explain the workflow or process related to: "${message}"
        
${cardContext ? `\nRelevant process cards:\n${cardContext}` : ''}

Create a clear step-by-step process explanation with proper sequence and connections.`;
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