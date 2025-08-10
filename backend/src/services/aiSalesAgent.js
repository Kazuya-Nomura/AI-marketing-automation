const { OpenAI } = require('openai');
const { Pinecone } = require('pinecone');

class AISalesAgent {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    this.initializeAgent();
  }

  async initializeAgent() {
    // Initialize vector database for conversation memory
    this.vectorDB = await this.pinecone.createIndex({
      name: 'sales-conversations',
      dimension: 1536,
      metric: 'cosine'
    });

    // Load sales playbooks
    this.playbooks = await this.loadSalesPlaybooks();
    
    // Initialize conversation flows
    this.conversationFlows = await this.loadConversationFlows();
  }

  // Main conversation handler
  async handleConversation(leadId, message, channel) {
    const context = await this.getConversationContext(leadId);
    const leadProfile = await this.getLeadProfile(leadId);
    
    // Detect intent and sentiment
    const analysis = await this.analyzeMessage(message, context);
    
    // Generate appropriate response
    const response = await this.generateResponse(
      message,
      analysis,
      context,
      leadProfile,
      channel
    );

    // Update conversation memory
    await this.updateConversationMemory(leadId, message, response, analysis);

    // Trigger follow-up actions if needed
    if (analysis.triggers.length > 0) {
      await this.handleTriggers(analysis.triggers, leadId);
    }

    return response;
  }

  // Analyze incoming message
  async analyzeMessage(message, context) {
    const analysis = {
      intent: await this.detectIntent(message, context),
      sentiment: await this.analyzeSentiment(message),
      entities: await this.extractEntities(message),
      urgency: await this.detectUrgency(message),
      objections: await this.detectObjections(message),
      triggers: await this.identifyTriggers(message, context)
    };

    return analysis;
  }

  // Generate contextual response
  async generateResponse(message, analysis, context, profile, channel) {
    const systemPrompt = this.buildSystemPrompt(profile, context, channel);
    const conversationHistory = await this.getConversationHistory(profile.leadId);

    const prompt = `
      ${systemPrompt}
      
      Conversation History:
      ${conversationHistory}
      
      Lead Profile:
      ${JSON.stringify(profile)}
      
      Current Message: ${message}
      Analysis: ${JSON.stringify(analysis)}
      
      Generate an appropriate response that:
      1. Addresses the lead's ${analysis.intent} intent
      2. Maintains ${analysis.sentiment} sentiment
      3. ${analysis.objections.length > 0 ? 'Handles objections: ' + analysis.objections.join(', ') : ''}
      4. Moves the conversation towards booking a property viewing
      5. Is personalized to the lead's preferences
      6. Follows the ${this.getPlaybook(analysis.intent)} playbook
      
      Response:
    `;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const response = completion.choices[0].message.content;

    // Add channel-specific formatting
    return this.formatForChannel(response, channel);
  }

  buildSystemPrompt(profile, context, channel) {
    return `
      You are an expert luxury real estate sales agent for FineAcers.
      Your goal is to help ${profile.name} find their perfect investment property.
      
      Key Information:
      - Lead Temperature: ${profile.temperature}
      - Budget: ${profile.budget_range}
      - Interested Location: ${profile.interested_location}
      - Previous Interactions: ${context.interactionCount}
      - Channel: ${channel}
      
      Personality:
      - Professional yet friendly
      - Knowledgeable about real estate investments
      - Focused on ROI and value
      - Not pushy but persuasive
      - Empathetic to concerns
      
      Capabilities:
      - Schedule property viewings
      - Provide ROI calculations
      - Share property details and visuals
      - Answer questions about financing
      - Handle objections professionally
    `;
  }

  // Handle specific triggers
  async handleTriggers(triggers, leadId) {
    for (const trigger of triggers) {
      switch (trigger.type) {
        case 'high_interest':
          await this.notifySalesTeam(leadId, 'Hot lead showing high interest');
          await this.scheduleCallback(leadId, 'immediate');
          break;
          
        case 'objection':
          await this.sendObjectionHandlingContent(leadId, trigger.objection);
          break;
          
        case 'ready_to_buy':
          await this.initiateClosingSequence(leadId);
          break;
          
        case 'price_inquiry':
          await this.sendPersonalizedPricing(leadId);
          break;
          
        case 'competition_mention':
          await this.sendCompetitiveAdvantage(leadId);
          break;
      }
    }
  }

  // Advanced objection handling
  async detectObjections(message) {
    const objectionPatterns = {
      price: /too expensive|costly|budget|afford|cheaper/i,
      location: /far|location|commute|distance/i,
      timing: /not ready|later|think about|maybe/i,
      trust: /legitimate|real|scam|verify/i,
      comparison: /other properties|options|alternatives|comparing/i
    };

    const detected = [];
    for (const [type, pattern] of Object.entries(objectionPatterns)) {
      if (pattern.test(message)) {
        detected.push({
          type,
          confidence: this.calculateObjectionConfidence(message, pattern)
        });
      }
    }

    return detected;
  }

  // Conversation flow management
  async getNextBestAction(context, profile) {
    const stage = context.conversationStage || 'introduction';
    const flows = this.conversationFlows[stage];

    // Use ML to predict best next action
    const features = [
      context.messageCount,
      context.totalDuration,
      profile.score / 100,
      profile.temperature === 'hot' ? 1 : profile.temperature === 'warm' ? 0.5 : 0,
      context.positiveSentiments / Math.max(context.totalSentiments, 1),
      context.objectionsRaised
    ];

    const prediction = await this.predictNextAction(features);
    
    return flows[prediction.action] || flows.default;
  }

  // Multi-channel conversation continuity
  async maintainContinuity(leadId, fromChannel, toChannel) {
    const context = await this.getConversationContext(leadId);
    
    // Generate transition message
    const transitionMessage = await this.generateTransitionMessage(
      context,
      fromChannel,
      toChannel
    );

    // Update context for new channel
    await this.updateChannelContext(leadId, toChannel, context);

    return transitionMessage;
  }

  // Voice conversation support
  async handleVoiceCall(leadId, transcript) {
    // Process voice transcript
    const processedTranscript = await this.processVoiceTranscript(transcript);
    
    // Extract key points
    const keyPoints = await this.extractKeyPoints(processedTranscript);
    
    // Generate follow-up actions
    const followUpActions = await this.generateVoiceFollowUp(keyPoints, leadId);

    // Update CRM with call summary
    await this.updateCRMWithCallSummary(leadId, {
      transcript: processedTranscript,
      keyPoints,
      followUpActions,
      duration: transcript.duration
    });

    return followUpActions;
  }

  // Proactive engagement
  async initiateProactiveEngagement(leadId, trigger) {
    const profile = await this.getLeadProfile(leadId);
    const context = await this.getConversationContext(leadId);

    const message = await this.generateProactiveMessage(
      profile,
      context,
      trigger
    );

    const channel = await this.selectOptimalChannel(profile);

    return {
      message,
      channel,
      scheduledTime: await this.calculateOptimalSendTime(profile, channel)
    };
  }

  async generateProactiveMessage(profile, context, trigger) {
    const templates = {
      price_drop: `Hi ${profile.name}! Great news - the property you viewed in ${profile.interested_location} just had a price adjustment. The new ROI projection is even more attractive. Would you like to see the updated numbers?`,
      
      new_property: `Hello ${profile.name}! A stunning new property just became available in ${profile.interested_location} that perfectly matches your requirements. Only 3 units left. Shall I send you the exclusive details?`,
      
      market_opportunity: `Hi ${profile.name}! Based on latest market data, property values in ${profile.interested_location} are projected to appreciate by ${trigger.appreciation}% this year. Perfect time to invest. Can we discuss this opportunity?`,
      
      follow_up: `Hi ${profile.name}! It's been a few days since we discussed the ${trigger.property} property. I have some additional insights about the investment potential that you might find interesting. Do you have 5 minutes for a quick call?`,
      
      urgency: `Hello ${profile.name}! The ${trigger.property} property you were interested in has received multiple offers. If you're still interested, we should move quickly. Can we schedule a viewing today?`
    };

    const template = templates[trigger.type] || templates.follow_up;
    
    // Personalize further based on context
    return this.personalizeMessage(template, profile, context);
  }
}

module.exports = new AISalesAgent();