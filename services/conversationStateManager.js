/**
 * Conversation State Manager
 * Manages conversation context, escalation levels, and used cards
 */

class ConversationStateManager {
  constructor() {
    this.intentPatterns = {
      first_time: [
        'pitao', 'zanima', 'da li', 'mogu li', 'ima li', 'postoji li', 
        'kako da', 'treba mi', 'potrebno', 'šta sa', 'kako sa'
      ],
      repeat: [
        'opet', 'ponovno', 'još jednom', 'ponovo', 'drugi put',
        'već sam pitao', 'rekao sam', 'spomenuo sam'
      ],
      insist: [
        'ali', 'sigurno', 'možda', 'ipak', 'verovatno', 'mora da',
        'ne može biti', 'siguran sam', 'znam da'
      ],
      escalate: [
        'smara', 'ne prihvata', 'nastavlja', 'insistira', 'ne razume',
        'treći put', 'koliko puta', 'već sam rekao'
      ],
      angry: [
        'ljut', 'nezadovoljan', 'frustriran', 'besan', 'nervozan',
        'dosadilo mi', 'gubim strpljenje'
      ]
    };

    this.topicKeywords = {
      bonus: ['bonus', 'nagrade', 'benefiti', 'popust', 'akcija'],
      refund: ['povraćaj', 'refund', 'vraćanje', 'refundiranje'],
      shipping: ['dostava', 'slanje', 'transport', 'kurirska'],
      support: ['podrška', 'pomoć', 'problem', 'issue'],
      account: ['nalog', 'account', 'profil', 'registracija']
    };
  }

  /**
   * Analyze conversation context and extract state
   */
  analyzeConversationState(conversationMessages, currentMessage) {
    console.log('\n🧠 === CONVERSATION STATE ANALYSIS ===');
    console.log('📊 Analyzing conversation with', conversationMessages.length, 'previous messages');
    console.log('💬 Current message:', currentMessage);

    const state = {
      topic: this.detectTopic(currentMessage, conversationMessages),
      phase: this.detectPhase(conversationMessages),
      escalationLevel: this.calculateEscalationLevel(conversationMessages, currentMessage),
      userIntent: this.detectIntent(currentMessage),
      usedCards: this.extractUsedCards(conversationMessages),
      lastResponses: this.getLastResponses(conversationMessages, 3),
      conversationFlow: this.analyzeConversationFlow(conversationMessages)
    };

    console.log('🎯 Detected conversation state:', state);
    console.log('🧠 === STATE ANALYSIS END ===\n');

    return state;
  }

  /**
   * Detect main topic from message and conversation history
   */
  detectTopic(message, conversationMessages = []) {
    const messageLower = message.toLowerCase();
    
    // Check current message for topic keywords
    for (const [topic, keywords] of Object.entries(this.topicKeywords)) {
      if (keywords.some(keyword => messageLower.includes(keyword))) {
        console.log(`🎯 Topic detected: ${topic} (from current message)`);
        return topic;
      }
    }

    // Check recent conversation history
    const recentMessages = conversationMessages.slice(-5);
    for (const msg of recentMessages) {
      if (msg.type === 'user') {
        const msgLower = msg.content.toLowerCase();
        for (const [topic, keywords] of Object.entries(this.topicKeywords)) {
          if (keywords.some(keyword => msgLower.includes(keyword))) {
            console.log(`🎯 Topic detected: ${topic} (from conversation history)`);
            return topic;
          }
        }
      }
    }

    console.log('🎯 Topic: general (no specific topic detected)');
    return 'general';
  }

  /**
   * Detect conversation phase
   */
  detectPhase(conversationMessages) {
    const messageCount = conversationMessages.length;
    
    if (messageCount === 0) return 'initial';
    if (messageCount <= 2) return 'initial';
    if (messageCount <= 6) return 'development';
    if (messageCount <= 10) return 'escalation';
    return 'resolution';
  }

  /**
   * Calculate escalation level based on conversation patterns
   */
  calculateEscalationLevel(conversationMessages, currentMessage) {
    let escalationLevel = 0;
    
    // Count user messages (each user message increases potential escalation)
    const userMessages = conversationMessages.filter(msg => msg.type === 'user');
    escalationLevel = Math.min(userMessages.length, 3); // Max level 3

    // Check for escalation keywords in current message
    const currentIntent = this.detectIntent(currentMessage);
    if (currentIntent === 'repeat') escalationLevel += 1;
    if (currentIntent === 'insist') escalationLevel += 2;
    if (currentIntent === 'escalate') escalationLevel += 3;
    if (currentIntent === 'angry') escalationLevel += 4;

    // Check for repeated topics
    const currentTopic = this.detectTopic(currentMessage);
    const topicMentions = conversationMessages.filter(msg => 
      msg.type === 'user' && this.detectTopic(msg.content) === currentTopic
    ).length;
    
    escalationLevel += Math.min(topicMentions, 2);

    const finalLevel = Math.min(escalationLevel, 5); // Max escalation level 5
    console.log(`📈 Escalation level: ${finalLevel} (base: ${userMessages.length}, intent bonus: ${currentIntent}, topic repeats: ${topicMentions})`);
    
    return finalLevel;
  }

  /**
   * Detect user intent from message
   */
  detectIntent(message) {
    const messageLower = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(this.intentPatterns)) {
      if (keywords.some(keyword => messageLower.includes(keyword))) {
        console.log(`🎭 Intent detected: ${intent}`);
        return intent;
      }
    }

    console.log('🎭 Intent: first_time (default)');
    return 'first_time';
  }

  /**
   * Extract cards that have been used in conversation
   */
  extractUsedCards(conversationMessages) {
    const usedCards = [];
    
    conversationMessages.forEach(msg => {
      if (msg.type === 'ai' && msg.sources) {
        msg.sources.forEach(source => {
          if (source.cardId && !usedCards.includes(source.cardId)) {
            usedCards.push(source.cardId);
          }
        });
      }
    });

    console.log(`📚 Used cards: ${usedCards.length} cards`, usedCards.slice(0, 3));
    return usedCards;
  }

  /**
   * Get last N AI responses
   */
  getLastResponses(conversationMessages, count = 3) {
    const aiMessages = conversationMessages
      .filter(msg => msg.type === 'ai')
      .slice(-count);
    
    return aiMessages.map(msg => ({
      content: msg.content?.substring(0, 100) + '...',
      sources: msg.sources?.map(s => s.cardId) || []
    }));
  }

  /**
   * Analyze conversation flow patterns
   */
  analyzeConversationFlow(conversationMessages) {
    const flow = {
      userQuestions: 0,
      aiResponses: 0,
      topicSwitches: 0,
      repeatedQuestions: 0
    };

    let lastTopic = null;
    
    conversationMessages.forEach(msg => {
      if (msg.type === 'user') {
        flow.userQuestions++;
        const topic = this.detectTopic(msg.content);
        
        if (lastTopic && lastTopic !== topic) {
          flow.topicSwitches++;
        }
        lastTopic = topic;
      } else {
        flow.aiResponses++;
      }
    });

    return flow;
  }

  /**
   * Apply conversation context to card search results
   */
  applyConversationContext(searchResults, conversationState) {
    console.log('\n🔍 === APPLYING CONVERSATION CONTEXT ===');
    console.log('📊 Original results:', searchResults.length);
    
    if (!searchResults || searchResults.length === 0) {
      return searchResults;
    }

    // Filter out already used cards if escalation level is low
    let filteredResults = searchResults;
    
    if (conversationState.escalationLevel <= 2 && conversationState.usedCards.length > 0) {
      const beforeFilter = filteredResults.length;
      filteredResults = filteredResults.filter(result => 
        !conversationState.usedCards.includes(result.cardId)
      );
      console.log(`🚫 Filtered out ${beforeFilter - filteredResults.length} already used cards`);
    }

    // Apply escalation-based scoring
    filteredResults = filteredResults.map(result => {
      let contextScore = result.relevanceScore || 0;
      
      // Boost cards that haven't been used
      if (!conversationState.usedCards.includes(result.cardId)) {
        contextScore += 20;
        console.log(`⭐ Boosting unused card: ${result.cardTitle} (+20)`);
      }

      // Apply escalation-based adjustments
      if (conversationState.escalationLevel >= 3) {
        // Look for escalation/follow-up keywords in card title/content
        const cardText = `${result.cardTitle} ${result.cardContent || ''}`.toLowerCase();
        if (cardText.includes('2') || cardText.includes('follow') || cardText.includes('nastavak')) {
          contextScore += 30;
          console.log(`📈 Escalation boost for: ${result.cardTitle} (+30)`);
        }
      }

      return {
        ...result,
        contextScore,
        originalScore: result.relevanceScore
      };
    });

    // Sort by context score
    filteredResults.sort((a, b) => b.contextScore - a.contextScore);

    console.log('🎯 Context-filtered results:', filteredResults.length);
    console.log('🔝 Top context results:', filteredResults.slice(0, 3).map(r => ({
      title: r.cardTitle,
      originalScore: r.originalScore,
      contextScore: r.contextScore
    })));
    console.log('🔍 === CONTEXT APPLICATION END ===\n');

    return filteredResults;
  }

  /**
   * Get context-aware prompt enhancement
   */
  getContextPromptEnhancement(conversationState) {
    let enhancement = '';

    // Add escalation context
    if (conversationState.escalationLevel >= 2) {
      enhancement += `\nCONTEXT: This is a follow-up request (escalation level: ${conversationState.escalationLevel}). `;
      
      if (conversationState.escalationLevel >= 3) {
        enhancement += 'The customer is asking again about the same topic. Use appropriate follow-up response. ';
      }
      
      if (conversationState.escalationLevel >= 4) {
        enhancement += 'The customer may be frustrated. Use de-escalation techniques. ';
      }
    }

    // Add used cards context
    if (conversationState.usedCards.length > 0) {
      enhancement += `\nPREVIOUS RESPONSES: You have already used ${conversationState.usedCards.length} cards in this conversation. Avoid repeating the same information. `;
    }

    // Add phase context
    enhancement += `\nCONVERSATION PHASE: ${conversationState.phase}. `;

    return enhancement;
  }
}

module.exports = ConversationStateManager; 