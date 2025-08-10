const tf = require('@tensorflow/tfjs-node');
const natural = require('natural');

class BehavioralIntelligenceEngine {
  constructor() {
    this.model = null;
    this.sentimentAnalyzer = new natural.SentimentAnalyzer('English', 
      natural.PorterStemmer, 'afinn');
    this.loadModels();
  }

  async loadModels() {
    // Load pre-trained behavioral prediction model
    this.model = await tf.loadLayersModel('file://./models/lead_behavior/model.json');
    
    // Load intent classification model
    this.intentClassifier = await tf.loadLayersModel('file://./models/intent/model.json');
  }

  // Comprehensive lead analysis
  async analyzeLeadBehavior(leadId) {
    const leadData = await this.gatherLeadData(leadId);
    
    const analysis = {
      engagement: await this.analyzeEngagementPattern(leadData),
      intent: await this.predictPurchaseIntent(leadData),
      preferences: await this.identifyPreferences(leadData),
      sentiment: await this.analyzeSentiment(leadData),
      nextBestAction: await this.recommendNextAction(leadData),
      conversionProbability: await this.predictConversion(leadData),
      lifetimeValue: await this.predictLTV(leadData)
    };

    // Store analysis for continuous learning
    await this.storeAnalysis(leadId, analysis);

    return analysis;
  }

  async gatherLeadData(leadId) {
    const query = `
      SELECT 
        l.*,
        array_agg(DISTINCT i.type) as interaction_types,
        array_agg(DISTINCT i.channel) as channels_used,
        COUNT(DISTINCT i.id) as total_interactions,
        MAX(i.created_at) as last_interaction,
        array_agg(i.data ORDER BY i.created_at) as interaction_history,
        array_agg(m.content) as messages_received,
        array_agg(mr.response) as message_responses
      FROM leads l
      LEFT JOIN interactions i ON l.id = i.lead_id
      LEFT JOIN messages m ON l.id = m.lead_id
      LEFT JOIN message_responses mr ON m.id = mr.message_id
      WHERE l.id = $1
      GROUP BY l.id
    `;

    const result = await pool.query(query, [leadId]);
    return result.rows[0];
  }

  // Analyze engagement patterns using ML
  async analyzeEngagementPattern(leadData) {
    const features = this.extractEngagementFeatures(leadData);
    
    // Create tensor from features
    const input = tf.tensor2d([features]);
    
    // Predict engagement pattern
    const prediction = this.model.predict(input);
    const pattern = await prediction.array();

    return {
      pattern: this.interpretEngagementPattern(pattern[0]),
      score: pattern[0].reduce((a, b) => Math.max(a, b)),
      trend: this.calculateEngagementTrend(leadData.interaction_history),
      recommendations: this.getEngagementRecommendations(pattern[0])
    };
  }

  extractEngagementFeatures(leadData) {
    const features = [];
    
    // Time-based features
    const now = new Date();
    const createdAt = new Date(leadData.created_at);
    const lastInteraction = new Date(leadData.last_interaction);
    
    features.push(
      (now - createdAt) / (1000 * 60 * 60 * 24), // Days since creation
      (now - lastInteraction) / (1000 * 60 * 60 * 24), // Days since last interaction
      leadData.total_interactions || 0,
      leadData.interaction_types?.length || 0,
      leadData.channels_used?.length || 0
    );

    // Interaction frequency
    const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
    features.push(
      leadData.total_interactions / Math.max(daysSinceCreation, 1)
    );

    // Response rate
    const messagesSent = leadData.messages_received?.length || 0;
    const responses = leadData.message_responses?.filter(r => r).length || 0;
    features.push(responses / Math.max(messagesSent, 1));

    // Channel diversity score
    const channelDiversity = (leadData.channels_used?.length || 0) / 5; // Assuming 5 channels
    features.push(channelDiversity);

    // Score-based features
    features.push(
      leadData.score / 100,
      leadData.temperature === 'hot' ? 1 : leadData.temperature === 'warm' ? 0.5 : 0
    );

    return features;
  }

  // Sentiment analysis on all communications
  async analyzeSentiment(leadData) {
    const communications = [
      ...(leadData.messages_received || []),
      ...(leadData.message_responses || []),
      leadData.notes
    ].filter(text => text);

    const sentiments = communications.map(text => {
      const score = this.sentimentAnalyzer.getSentiment(text.split(' '));
      return {
        text: text.substring(0, 100),
        score,
        sentiment: score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral'
      };
    });

    const avgSentiment = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;

    return {
      overall: avgSentiment > 0.5 ? 'positive' : avgSentiment < -0.5 ? 'negative' : 'neutral',
      score: avgSentiment,
      trend: this.calculateSentimentTrend(sentiments),
      details: sentiments
    };
  }

  // Predict purchase intent using BERT-based model
  async predictPurchaseIntent(leadData) {
    const recentInteractions = leadData.interaction_history?.slice(-10) || [];
    
    const intents = await Promise.all(
      recentInteractions.map(interaction => 
        this.classifyIntent(interaction.message || interaction.action)
      )
    );

    const intentScores = {
      research: 0,
      comparison: 0,
      purchase: 0,
      support: 0,
      general: 0
    };

    intents.forEach(intent => {
      intentScores[intent.type] += intent.confidence;
    });

    const dominantIntent = Object.entries(intentScores)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      primary: dominantIntent[0],
      confidence: dominantIntent[1] / intents.length,
      distribution: intentScores,
      stage: this.mapIntentToStage(dominantIntent[0]),
      readyToBuy: dominantIntent[0] === 'purchase' && dominantIntent[1] > 0.7
    };
  }

  // Advanced conversion prediction
  async predictConversion(leadData) {
    const features = [
      ...this.extractEngagementFeatures(leadData),
      ...this.extractBehavioralFeatures(leadData),
      ...this.extractContextualFeatures(leadData)
    ];

    const input = tf.tensor2d([features]);
    const prediction = await this.model.predict(input).array();

    const probability = prediction[0][0];
    const timeframe = this.predictConversionTimeframe(leadData, probability);

    return {
      probability: probability,
      confidence: this.calculateConfidence(features),
      timeframe,
      factors: this.identifyConversionFactors(leadData, features),
      recommendations: this.getConversionRecommendations(probability, leadData)
    };
  }

  extractBehavioralFeatures(leadData) {
    const features = [];

    // Page view patterns
    const pageViews = leadData.interaction_history?.filter(i => i.type === 'page_view') || [];
    features.push(
      pageViews.length,
      new Set(pageViews.map(p => p.page)).size, // Unique pages
      pageViews.filter(p => p.page?.includes('roi')).length, // ROI page views
      pageViews.filter(p => p.page?.includes('contact')).length // Contact page views
    );

    // Content engagement
    const downloads = leadData.interaction_history?.filter(i => i.type === 'download') || [];
    features.push(
      downloads.length,
      downloads.filter(d => d.content?.includes('brochure')).length
    );

    // Communication patterns
    const calls = leadData.interaction_history?.filter(i => i.type === 'call') || [];
    const meetings = leadData.interaction_history?.filter(i => i.type === 'meeting') || [];
    features.push(calls.length, meetings.length);

    return features;
  }

  extractContextualFeatures(leadData) {
    const features = [];

    // Market conditions
    const marketData = this.getMarketData(leadData.interested_location);
    features.push(
      marketData.trend === 'rising' ? 1 : 0,
      marketData.inventory_level,
      marketData.avg_days_on_market
    );

    // Seasonal factors
    const month = new Date().getMonth();
    features.push(
      month >= 2 && month <= 4 ? 1 : 0, // Spring buying season
      month >= 9 && month <= 11 ? 1 : 0  // Fall buying season
    );

    // Competition
    features.push(
      leadData.properties_viewed?.length || 0,
      leadData.competitors_viewed?.length || 0
    );

    return features;
  }

  // Lifetime value prediction
  async predictLTV(leadData) {
    const features = [
      leadData.budget_range_max || 0,
      leadData.properties_owned || 0,
      leadData.investment_experience || 0,
      leadData.referral_potential || 0
    ];

    const baseLTV = features[0] * 0.05; // 5% commission assumption
    const multiPropertyMultiplier = 1 + (features[1] * 0.3);
    const experienceMultiplier = 1 + (features[2] * 0.1);
    const referralMultiplier = 1 + (features[3] * 0.5);

    const predictedLTV = baseLTV * multiPropertyMultiplier * 
                        experienceMultiplier * referralMultiplier;

    return {
      value: predictedLTV,
      confidence: 0.75,
      factors: {
        primaryInvestment: baseLTV,
        repeatBusiness: multiPropertyMultiplier,
        referrals: referralMultiplier
      },
      segment: this.getLTVSegment(predictedLTV)
    };
  }

  // Recommend next best action
  async recommendNextAction(leadData) {
    const engagement = await this.analyzeEngagementPattern(leadData);
    const intent = await this.predictPurchaseIntent(leadData);
    const sentiment = await this.analyzeSentiment(leadData);

    const actions = [];

    // High intent, positive sentiment
    if (intent.readyToBuy && sentiment.overall === 'positive') {
      actions.push({
        action: 'schedule_site_visit',
        priority: 'high',
        channel: 'phone',
        message: 'Call to schedule exclusive property tour',
        timing: 'immediate'
      });
    }

    // Medium intent, need nurturing
    if (intent.stage === 'consideration' && engagement.score > 0.5) {
      actions.push({
        action: 'send_roi_calculator',
        priority: 'medium',
        channel: 'email',
        message: 'Personalized ROI analysis for your investment',
        timing: 'within_24_hours'
      });
    }

    // Low engagement, re-engage
    if (engagement.trend === 'declining') {
      actions.push({
        action: 're_engagement_campaign',
        priority: 'medium',
        channel: 'whatsapp',
        message: 'Exclusive offer for valued clients',
        timing: 'within_48_hours'
      });
    }

    // Add AI-driven personalized content
    actions.push({
      action: 'send_personalized_content',
      priority: 'low',
      channel: 'multi',
      content: await this.generatePersonalizedContent(leadData),
      timing: 'scheduled'
    });

    return actions.sort((a, b) => 
      this.actionPriorityScore(b) - this.actionPriorityScore(a)
    );
  }

  actionPriorityScore(action) {
    const scores = { high: 3, medium: 2, low: 1 };
    return scores[action.priority] || 0;
  }
}

module.exports = new BehavioralIntelligenceEngine();