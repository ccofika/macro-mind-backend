const { OpenAI } = require('openai');
const Card = require('../models/Card');
const Space = require('../models/Space');
const Connection = require('../models/Connection');
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
    systemPrompt: `You are a professional customer service AI assistant. Generate customer service responses using the provided card templates and guidelines. 

${agentGuidelines}

Focus on:
- Using relevant card templates to create responses
- Maintaining professional tone
- Following company guidelines
- Providing accurate information from the cards
- Creating complete, helpful responses

Always structure responses with proper paragraphs and clear formatting.`,
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
  /**
   * Search through user's cards for relevant content
   */
  async searchCards(userId, query, options = {}) {
    try {
      const { mode = 'search', limit = 10, spaceId = null } = options;
      
      // Get user's accessible spaces
      const userSpaces = await Space.find({
        $or: [
          { ownerId: userId },
          { 'members.userId': userId }
        ]
      });
      
      const spaceIds = userSpaces.map(space => space._id);
      
      // Build card search query
      let cardQuery = { spaceId: { $in: spaceIds } };
      if (spaceId) {
        cardQuery.spaceId = spaceId;
      }
      
            // Get all accessible cards
      const allCards = await Card.find(cardQuery)
        .populate('spaceId', 'name')
        .lean();

      console.log(`AI Chat Service: Found ${allCards.length} accessible cards for user ${userId}`);
      console.log('AI Chat Service: Sample card spaceId:', allCards[0]?.spaceId);

      // Perform semantic search
      const searchResults = this.performSemanticSearch(allCards, query, limit);
      
      // Get connections for process discovery
      const connections = await Connection.find({
        $or: [
          { fromCardId: { $in: searchResults.map(r => r.cardId) } },
          { toCardId: { $in: searchResults.map(r => r.cardId) } }
        ]
      }).lean();
      
      // Enhance results with connection information
      const enhancedResults = this.enhanceWithConnections(searchResults, connections, allCards);
      
      return {
        results: enhancedResults,
        totalFound: searchResults.length,
        query,
        mode,
        processedAt: new Date()
      };
      
    } catch (error) {
      console.error('AI Chat Service: Card search error:', error);
      throw error;
    }
  }
  
  /**
   * Perform semantic search on cards
   */
  performSemanticSearch(cards, query, limit) {
    const queryLower = query.toLowerCase();
    const searchTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    const results = cards.map(card => {
      let score = 0;
      const content = `${card.title} ${card.content || ''}`.toLowerCase();
      
      // Exact phrase match (highest score)
      if (content.includes(queryLower)) {
        score += 100;
      }
      
      // Individual term matches
      searchTerms.forEach(term => {
        if (content.includes(term)) {
          score += 10;
        }
        
        // Title matches get bonus
        if (card.title.toLowerCase().includes(term)) {
          score += 20;
        }
      });
      
      // Category/type relevance
      if (card.category && card.category.toLowerCase().includes(queryLower)) {
        score += 15;
      }
      
      return {
        cardId: card._id.toString(),
        cardTitle: card.title,
        cardContent: card.content || '',
        cardCategory: card.category || '',
        spaceId: card.spaceId?._id?.toString() || card.spaceId?.toString() || 'unknown',
        spaceName: card.spaceId?.name || 'Unknown Space',
        relevanceScore: score,
        excerpt: this.generateExcerpt(card.content || card.title, queryLower)
      };
    })
    .filter(result => result.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
    
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
    const startTime = Date.now();
    
    try {
      if (!openai) {
        return this.generateFallbackResponse(message, mode, searchResults);
      }
      
      const modeConfig = AI_MODES[mode] || AI_MODES.macro;
      
      // Build context from search results
      console.log('AI Chat Service: searchResults structure:', JSON.stringify(searchResults, null, 2));
      
      const results = searchResults.results || searchResults || [];
      const cardContext = results.map(result => 
        `Card: "${result.cardTitle}" (Space: ${result.spaceName})\nContent: ${result.excerpt}\nRelevance: ${result.relevanceScore}%`
      ).join('\n\n');
      
      // Build conversation context
      const conversationContext = context.recentMessages 
        ? context.recentMessages.slice(-5).map(msg => 
            `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content}`
          ).join('\n')
        : '';
      
      const userPrompt = this.buildUserPrompt(message, mode, cardContext, conversationContext);
      
      console.log(`AI Chat Service: Generating ${mode} response for user ${userId}`);
      
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
      
      // Calculate confidence based on search results
      const confidence = this.calculateConfidence(searchResults, aiResponse);
      
            // Generate process flow if in process mode
      let processFlow = [];
      if (mode === 'process' && results.length > 0) {
        const cardIds = results.map(r => r.cardId);
        processFlow = await this.discoverProcessFlow(cardIds, userId);
      }

      return {
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
      
    } catch (error) {
      console.error('AI Chat Service: OpenAI API error:', error);
      
      // Fallback to basic response
      return this.generateFallbackResponse(message, mode, searchResults);
    }
  }
  
  /**
   * Build user prompt based on mode and context
   */
  buildUserPrompt(message, mode, cardContext, conversationContext) {
    let prompt = '';
    
    switch (mode) {
      case 'macro':
        prompt = `Generate a professional customer service response for this request: "${message}"
        
${cardContext ? `\nRelevant cards and templates:\n${cardContext}` : ''}
${conversationContext ? `\nRecent conversation:\n${conversationContext}` : ''}

Create a complete, professional response using the available information.`;
        break;
        
      case 'rephrase':
        prompt = `Improve and rephrase this text: "${message}"
        
Make it more professional, clear, and effective while maintaining the original meaning.`;
        break;
        
      case 'explain':
        prompt = `Analyze and explain what this customer input means: "${message}"
        
${cardContext ? `\nRelevant context from cards:\n${cardContext}` : ''}

Explain their intent, needs, and what type of response would be appropriate.`;
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