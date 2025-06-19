/**
 * Card Workflow Engine
 * Tracks card sequences and determines current step in workflow chains
 */

class CardWorkflowEngine {
  constructor() {
    this.workflowCache = new Map();
  }

  /**
   * Analyze card connections and build workflow chains
   */
  async buildWorkflowChains(cards, connections) {
    console.log('\n🔗 === BUILDING WORKFLOW CHAINS ===');
    console.log('📚 Total cards:', cards.length);
    console.log('🔗 Total connections:', connections.length);

    const workflows = new Map();
    
    // Separate cards by type
    const categoryCards = cards.filter(card => 
      card.type === 'category' || 
      card.title.toLowerCase().includes('category') ||
      this.isCategoryCard(card)
    );
    
    const answerCards = cards.filter(card => 
      card.type === 'answer' || 
      !this.isCategoryCard(card)
    );

    console.log('📂 Category cards:', categoryCards.length);
    console.log('💬 Answer cards:', answerCards.length);

    // Build workflow chains starting from category cards
    for (const categoryCard of categoryCards) {
      const workflow = this.traceWorkflowFromCategory(categoryCard, answerCards, connections);
      if (workflow.steps.length > 0) {
        workflows.set(categoryCard._id.toString(), workflow);
        console.log(`🔄 Built workflow for "${categoryCard.title}":`, workflow.steps.length, 'steps');
      }
    }

    // Build standalone answer card sequences (for cards without category)
    const orphanAnswers = this.findOrphanAnswerChains(answerCards, connections, workflows);
    orphanAnswers.forEach((workflow, startCardId) => {
      workflows.set(startCardId, workflow);
    });

    console.log('✅ Total workflows built:', workflows.size);
    console.log('🔗 === WORKFLOW CHAINS COMPLETE ===\n');

    return workflows;
  }

  /**
   * Determine if a card is a category card
   */
  isCategoryCard(card) {
    const categoryIndicators = [
      'category', 'kategorija', 'tip', 'vrsta', 'grupa', 'sekcija',
      // Check if card has only outgoing connections (typical for categories)
    ];
    
    const titleLower = card.title.toLowerCase();
    const contentLower = (card.content || '').toLowerCase();
    
    return categoryIndicators.some(indicator => 
      titleLower.includes(indicator) || contentLower.includes(indicator)
    ) || card.type === 'category';
  }

  /**
   * Trace workflow chain starting from a category card
   */
  traceWorkflowFromCategory(categoryCard, answerCards, connections) {
    console.log(`\n🎯 Tracing workflow from category: "${categoryCard.title}"`);
    
    const workflow = {
      categoryCard: {
        id: categoryCard._id.toString(),
        title: categoryCard.title,
        content: categoryCard.content
      },
      steps: [],
      totalSteps: 0
    };

    // Find direct connections from category to answer cards
    const directAnswers = connections.filter(conn => 
      conn.sourceId && conn.sourceId.toString() === categoryCard._id.toString()
    );

    console.log(`📎 Found ${directAnswers.length} direct connections from category`);

    // For each direct answer, trace the sequence
    for (const connection of directAnswers) {
      const startAnswerCard = answerCards.find(card => 
        connection.targetId && card._id.toString() === connection.targetId.toString()
      );
      if (startAnswerCard) {
        const sequence = this.traceAnswerSequence(startAnswerCard, answerCards, connections);
        
        if (sequence.length > 0) {
          workflow.steps.push(...sequence);
          console.log(`  ➡️ Added sequence of ${sequence.length} steps starting with "${startAnswerCard.title}"`);
        }
      }
    }

    workflow.totalSteps = workflow.steps.length;
    return workflow;
  }

  /**
   * Trace sequence of connected answer cards
   */
  traceAnswerSequence(startCard, allAnswerCards, connections, visited = new Set()) {
    const cardId = startCard._id.toString();
    if (visited.has(cardId)) {
      return []; // Avoid cycles
    }

    visited.add(cardId);
    const sequence = [{
      id: cardId,
      _id: startCard._id,
      title: startCard.title,
      content: startCard.content,
      step: visited.size,
      isInitial: visited.size === 1
    }];

    // Find next connected answer card
    const nextConnections = connections.filter(conn => 
      conn.sourceId && conn.sourceId.toString() === cardId
    );

    for (const connection of nextConnections) {
      const nextCard = allAnswerCards.find(card => 
        connection.targetId && card._id.toString() === connection.targetId.toString()
      );
      if (nextCard && !visited.has(nextCard._id.toString())) {
        const nextSequence = this.traceAnswerSequence(nextCard, allAnswerCards, connections, new Set(visited));
        sequence.push(...nextSequence);
        break; // Take first valid path (can be enhanced to handle multiple paths)
      }
    }

    return sequence;
  }

  /**
   * Find orphan answer card chains (not connected to categories)
   */
  findOrphanAnswerChains(answerCards, connections, existingWorkflows) {
    const orphanWorkflows = new Map();
    const cardsInWorkflows = new Set();

    // Collect all cards already in workflows
    existingWorkflows.forEach(workflow => {
      workflow.steps.forEach(step => cardsInWorkflows.add(step.id));
    });

    // Find answer cards not in any workflow
    const orphanCards = answerCards.filter(card => !cardsInWorkflows.has(card._id.toString()));
    
    console.log(`🔍 Found ${orphanCards.length} orphan cards`);

    // Build sequences for orphan cards
    const processed = new Set();
    for (const orphanCard of orphanCards) {
      const cardId = orphanCard._id.toString();
      if (!processed.has(cardId)) {
        const sequence = this.traceAnswerSequence(orphanCard, answerCards, connections);
        if (sequence.length > 1) { // Only if it's a sequence, not single card
          orphanWorkflows.set(cardId, {
            categoryCard: null,
            steps: sequence,
            totalSteps: sequence.length
          });
          
          // Mark all cards in this sequence as processed
          sequence.forEach(step => processed.add(step.id));
        }
      }
    }

    return orphanWorkflows;
  }

  /**
   * Find the appropriate answer card for a user query based on conversation state
   */
  findContextualAnswerCard(workflows, query, conversationState) {
    console.log('\n🎯 === FINDING CONTEXTUAL ANSWER ===');
    console.log('🔍 Query:', query);
    console.log('📊 Conversation state:', {
      topic: conversationState?.topic,
      escalationLevel: conversationState?.escalationLevel,
      usedCards: conversationState?.usedCards?.length || 0
    });

    // Find relevant workflow based on query
    const relevantWorkflow = this.findRelevantWorkflow(workflows, query);
    
    if (!relevantWorkflow) {
      console.log('❌ No relevant workflow found');
      return null;
    }

    console.log('✅ Found relevant workflow:', relevantWorkflow.steps.length, 'steps');

    // Determine current step based on conversation state
    const currentStep = this.determineCurrentStep(relevantWorkflow, conversationState);
    
    console.log('🎯 Current step determined:', currentStep);
    console.log('🎯 === CONTEXTUAL ANSWER FOUND ===\n');

    return {
      workflow: relevantWorkflow,
      currentStep: currentStep,
      card: relevantWorkflow.steps[currentStep - 1] // Convert to 0-based index
    };
  }

  /**
   * Find workflow relevant to the query
   */
  findRelevantWorkflow(workflows, query) {
    const queryLower = query.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const [workflowId, workflow] of workflows) {
      let score = 0;

      // Check category card relevance
      if (workflow.categoryCard) {
        const categoryTitle = workflow.categoryCard.title.toLowerCase();
        const categoryContent = (workflow.categoryCard.content || '').toLowerCase();
        
        if (this.containsKeywords(queryLower, categoryTitle)) score += 50;
        if (this.containsKeywords(queryLower, categoryContent)) score += 30;
      }

      // Check answer cards relevance
      for (const step of workflow.steps) {
        const stepTitle = step.title.toLowerCase();
        const stepContent = (step.content || '').toLowerCase();
        
        if (this.containsKeywords(queryLower, stepTitle)) score += 40;
        if (this.containsKeywords(queryLower, stepContent)) score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = workflow;
      }
    }

    console.log('🏆 Best workflow match score:', bestScore);
    return bestScore > 30 ? bestMatch : null; // Minimum threshold
  }

  /**
   * Check if query contains keywords from target text
   */
  containsKeywords(query, targetText) {
    const queryWords = query.split(/\s+/).filter(word => word.length > 2);
    const targetWords = targetText.split(/\s+/).filter(word => word.length > 2);
    
    return queryWords.some(queryWord => 
      targetWords.some(targetWord => 
        targetWord.includes(queryWord) || queryWord.includes(targetWord)
      )
    );
  }

  /**
   * Determine current step in workflow based on conversation state
   */
  determineCurrentStep(workflow, conversationState) {
    if (!conversationState || conversationState.escalationLevel === 0) {
      // First interaction - return step 1
      return 1;
    }

    // Check which cards from this workflow have been used
    const usedWorkflowCards = workflow.steps.filter(step => 
      conversationState.usedCards?.includes(step.id)
    );

    if (usedWorkflowCards.length === 0) {
      // No cards from this workflow used yet - start at step 1
      return 1;
    }

    // Find the highest step number that was used
    const highestUsedStep = Math.max(...usedWorkflowCards.map(card => card.step));
    
    // Move to next step, but don't exceed total steps
    const nextStep = Math.min(highestUsedStep + 1, workflow.totalSteps);
    
    console.log(`📈 Escalation: used step ${highestUsedStep}, moving to step ${nextStep}`);
    return nextStep;
  }

  /**
   * Get workflow summary for debugging
   */
  getWorkflowSummary(workflows) {
    const summary = {
      totalWorkflows: workflows.size,
      workflows: []
    };

    workflows.forEach((workflow, id) => {
      summary.workflows.push({
        id,
        category: workflow.categoryCard?.title || 'No Category',
        steps: workflow.steps.map(step => ({
          step: step.step,
          title: step.title,
          isInitial: step.isInitial
        })),
        totalSteps: workflow.totalSteps
      });
    });

    return summary;
  }
}

module.exports = CardWorkflowEngine; 