const AI_MODEL_CONFIG = {
  // Primary models for different use cases
  models: {
    leadScoring: {
      primary: {
        provider: 'openai',
        model: 'gpt-3.5-turbo-0125',
        temperature: 0.3,
        maxTokens: 100,
        costPerToken: 0.0005,
        timeout: 5000
      },
      fallback: {
        provider: 'anthropic',
        model: 'claude-instant-1.2',
        temperature: 0.3,
        maxTokens: 100,
        costPerToken: 0.0004,
        timeout: 5000
      },
      local: {
        provider: 'ollama',
        model: 'llama2:7b',
        temperature: 0.3,
        maxTokens: 100,
        costPerToken: 0,
        timeout: 10000
      }
    },
    
    contentGeneration: {
      primary: {
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        costPerToken: 0.03,
        timeout: 30000
      },
      fallback: {
        provider: 'openai',
        model: 'gpt-3.5-turbo-16k',
        temperature: 0.7,
        maxTokens: 2000,
        costPerToken: 0.002,
        timeout: 20000
      },
      local: {
        provider: 'ollama',
        model: 'mixtral:8x7b',
        temperature: 0.7,
        maxTokens: 2000,
        costPerToken: 0,
        timeout: 30000
      }
    },
    
    messagePersonalization: {
      primary: {
        provider: 'openai',
        model: 'gpt-3.5-turbo-0125',
        temperature: 0.5,
        maxTokens: 500,
        costPerToken: 0.0005,
        timeout: 5000
      },
      fallback: {
        provider: 'cohere',
        model: 'command-light',
        temperature: 0.5,
        maxTokens: 500,
        costPerToken: 0.0003,
        timeout: 5000
      }
    }
  },
  
  // Cost optimization rules
  costOptimization: {
    dailyBudget: 100, // USD
    monthlyBudget: 2000, // USD
    priorityAllocation: {
      leadScoring: 0.3,
      contentGeneration: 0.5,
      messagePersonalization: 0.2
    }
  },
  
  // Performance thresholds
  performance: {
    maxLatency: 5000, // ms
    maxRetries: 3,
    circuitBreakerThreshold: 5, // failures
    circuitBreakerTimeout: 60000 // ms
  }
};