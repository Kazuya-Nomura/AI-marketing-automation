
const circuitBreaker = require('./circuitBreaker');

class AIService {
  constructor() {
    this.openai = new OpenAIApi(
      new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      })
    );
  }

  async scoreLeadWithAI(leadData) {
    try {
      // Use circuit breaker for OpenAI calls
      const result = await circuitBreaker.executeWithBreaker(
        'openai-lead-scoring',
        async () => {
          const prompt = this.buildLeadScoringPrompt(leadData);
          const completion = await this.openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 100
          });
          return completion.data.choices[0].message.content;
        },
        {
          timeout: 5000,
          errorThreshold: 3
        }
      );

      const score = parseInt(result);
      return isNaN(score) ? 50 : Math.min(100, Math.max(0, score));
    } catch (error) {
      logger.error('AI scoring failed, using fallback', error);
      return this.fallbackScoring(leadData);
    }
  }

  // Apply to other external service calls
  async generateContent(platform, propertyData, tone = 'professional') {
    return await circuitBreaker.executeWithBreaker(
      'openai-content-generation',
      async () => {
        // existing content generation logic
      },
      {
        timeout: 30000,
        errorThreshold: 5
      }
    );
  }
}