const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

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
      const prompt = `
        Analyze this lead and score from 0-100 based on purchase probability:
        Name: ${leadData.name}
        Email: ${leadData.email}
        Budget: ${leadData.budget_range}
        Location Interest: ${leadData.interested_location}
        Notes: ${leadData.notes}
        
        Consider: budget alignment, urgency indicators, engagement level.
        Return only the numeric score.
      `;

      const completion = await this.openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 10
      });

      const score = parseInt(completion.data.choices[0].message.content);
      return isNaN(score) ? 50 : Math.min(100, Math.max(0, score));
    } catch (error) {
      console.error('AI scoring error:', error);
      // Fallback scoring logic
      return this.fallbackScoring(leadData);
    }
  }

  fallbackScoring(leadData) {
    let score = 50; // Base score

    // Budget scoring
    if (leadData.budget_range) {
      if (leadData.budget_range.includes('2Cr') || leadData.budget_range.includes('Above')) {
        score += 20;
      } else if (leadData.budget_range.includes('1Cr')) {
        score += 15;
      } else if (leadData.budget_range.includes('75L')) {
        score += 10;
      }
    }

    // Location interest
    if (leadData.interested_location) {
      score += 10;
    }

    // Has email
    if (leadData.email) {
      score += 5;
    }

    // Notes indicate urgency
    if (leadData.notes && leadData.notes.toLowerCase().includes('urgent')) {
      score += 15;
    }

    return Math.min(100, score);
  }

  async generateContent(platform, propertyData, tone = 'professional') {
    try {
      const prompts = {
        whatsapp: `Create a personalized WhatsApp message for luxury property investment. 
                   Property: ${propertyData.name} in ${propertyData.location}. 
                   ROI: ${propertyData.roi_percentage}%. 
                   Keep it under 100 words, conversational, include urgency.`,
        
        email: `Write a compelling email for luxury property investment.
                Property: ${propertyData.name} in ${propertyData.location}.
                ROI: ${propertyData.roi_percentage}%.
                Include subject line, personalization, benefits, and clear CTA.`,
        
        instagram: `Create an Instagram caption for luxury property.
                    Property: ${propertyData.name} in ${propertyData.location}.
                    Include: lifestyle angle, investment benefits, relevant hashtags.
                    Keep it engaging and visual.`,
        
        linkedin: `Write a LinkedIn post about investment opportunity.
                   Property: ${propertyData.name} in ${propertyData.location}.
                   ROI: ${propertyData.roi_percentage}%.
                   Professional tone, include market insights, credibility markers.`
      };

      const completion = await this.openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompts[platform] }],
        temperature: 0.7,
        max_tokens: 300
      });

      return completion.data.choices[0].message.content;
    } catch (error) {
      console.error('Content generation error:', error);
      throw error;
    }
  }

  async personalizeMessage(template, leadData) {
    try {
      const prompt = `
        Personalize this message template for the lead:
        Template: ${template}
        Lead Name: ${leadData.name}
        Lead Location: ${leadData.location}
        Lead Interest: ${leadData.interested_location}
        
        Make it personal and engaging. Return only the personalized message.
      `;

      const completion = await this.openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 200
      });

      return completion.data.choices[0].message.content;
    } catch (error) {
      console.error('Personalization error:', error);
      // Fallback to simple replacement
      return template
        .replace('{name}', leadData.name)
        .replace('{location}', leadData.interested_location || 'your preferred location');
    }
  }
}

module.exports = new AIService();