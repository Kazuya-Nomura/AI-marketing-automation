class AIService {
  constructor() {
    this.providers = this.initializeProviders();
    this.circuitBreakers = new Map();
    this.usageTracker = new UsageTracker();
  }

  async scoreLeadWithAI(leadData, options = {}) {
    const useCase = 'leadScoring';
    const modelConfig = this.getOptimalModel(useCase, options);
    
    try {
      // Try primary model
      const result = await this.executeWithFallback(
        useCase,
        modelConfig,
        async (model) => {
          return await this.callAIProvider(model, this.buildLeadScoringPrompt(leadData));
        }
      );
      
      // Track usage for cost monitoring
      await this.usageTracker.track(useCase, modelConfig.primary.model, result.tokensUsed);
      
      return this.parseLeadScore(result.response);
      
    } catch (error) {
      logger.error('AI lead scoring failed completely', error);
      // Use rule-based fallback
      return this.fallbackLeadScoring(leadData);
    }
  }

  async executeWithFallback(useCase, modelConfig, executeFn) {
    const models = ['primary', 'fallback', 'local'];
    let lastError;
    
    for (const modelType of models) {
      const model = modelConfig[modelType];
      if (!model) continue;
      
      // Check circuit breaker
      const circuitBreaker = this.getCircuitBreaker(model.provider);
      if (circuitBreaker.isOpen()) {
        logger.warn(`Circuit breaker open for ${model.provider}`);
        continue;
      }
      
      try {
        const result = await Promise.race([
          executeFn(model),
          this.timeout(model.timeout)
        ]);
        
        circuitBreaker.recordSuccess();
        return result;
        
      } catch (error) {
        logger.error(`${modelType} model failed for ${useCase}`, error);
        lastError = error;
        circuitBreaker.recordFailure();
        
        // If primary fails due to rate limit, wait before trying fallback
        if (error.code === 'rate_limit_exceeded' && modelType === 'primary') {
          await this.delay(2000);
        }
      }
    }
    
    throw lastError || new Error('All AI models failed');
  }

  getOptimalModel(useCase, options) {
    const baseConfig = AI_MODEL_CONFIG.models[useCase];
    
    // Check budget constraints
    const remainingBudget = this.usageTracker.getRemainingDailyBudget();
    
    // If low on budget, prefer cheaper models
    if (remainingBudget < 10) {
      return {
        primary: baseConfig.fallback || baseConfig.local,
        fallback: baseConfig.local,
        local: baseConfig.local
      };
    }
    
    // For high-priority requests, use best model
    if (options.priority === 'high') {
      return baseConfig;
    }
    
    // Normal operation
    return baseConfig;
  }

  // Rule-based fallback for complete AI failure
  fallbackLeadScoring(leadData) {
    let score = 50; // Base score
    
    // Source scoring
    const sourceScores = {
      website: 20,
      referral: 30,
      partner: 25,
      social: 15,
      cold: 5,
      event: 20
    };
    score += sourceScores[leadData.source?.channel] || 10;
    
    // Budget scoring
    if (leadData.requirements?.loanAmount) {
      if (leadData.requirements.loanAmount > 5000000) score += 20;
      else if (leadData.requirements.loanAmount > 2000000) score += 15;
      else score += 5;
    }
    
    // Urgency scoring
    const timeframeScores = {
      immediate: 20,
      '1month': 15,
      '3months': 10,
      '6months': 5
    };
    score += timeframeScores[leadData.requirements?.timeframe] || 5;
    
    return Math.min(100, score);
  }

  buildLeadScoringPrompt(leadData) {
    return `
      Analyze this lead and provide a score from 0-100:
      
      Lead Information:
      - Source: ${leadData.source.channel}
      - Name: ${leadData.name}
      - Location: ${leadData.location}
      - Budget: ${leadData.requirements?.loanAmount || 'Not specified'}
      - Timeframe: ${leadData.requirements?.timeframe || 'Not specified'}
      - Previous Interactions: ${leadData.interactions?.length || 0}
      
      Consider: budget size, urgency, source quality, engagement level.
      
      Return ONLY a JSON object: {"score": <number>, "reasoning": "<brief reason>"}
    `;
  }
}

// Circuit Breaker Implementation
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  isOpen() {
    if (this.state === 'OPEN') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage Tracking for Cost Management
class UsageTracker {
  constructor() {
    this.redis = require('../config/redis').client;
  }

  async track(useCase, model, tokens) {
    const date = new Date().toISOString().split('T')[0];
    const key = `ai_usage:${date}`;
    
    const usage = {
      useCase,
      model,
      tokens,
      cost: this.calculateCost(model, tokens),
      timestamp: new Date().toISOString()
    };
    
    await this.redis.lpush(key, JSON.stringify(usage));
    await this.redis.expire(key, 86400 * 7); // Keep for 7 days
  }

  async getRemainingDailyBudget() {
    const date = new Date().toISOString().split('T')[0];
    const key = `ai_usage:${date}`;
    
    const usage = await this.redis.lrange(key, 0, -1);
    const totalCost = usage.reduce((sum, item) => {
      const parsed = JSON.parse(item);
      return sum + parsed.cost;
    }, 0);
    
    return AI_MODEL_CONFIG.costOptimization.dailyBudget - totalCost;
  }

  calculateCost(model, tokens) {
    // Simple cost calculation - would be more complex in production
    const modelConfig = Object.values(AI_MODEL_CONFIG.models)
      .flatMap(m => [m.primary, m.fallback])
      .find(m => m && m.model === model);
    
    return modelConfig ? tokens * modelConfig.costPerToken : 0;
  }
}