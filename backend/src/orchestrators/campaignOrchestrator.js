const EventBus = require('../events/eventBus');
const AIContentCreation = require('../services/aiContentCreationService');
const PersonalizationEngine = require('../services/personalizationEngine');
const CampaignOptimizer = require('../services/campaignOptimizationEngine');
const BehavioralIntelligence = require('../services/behavioralIntelligence');

class CampaignOrchestrator {
  constructor() {
    this.eventBus = EventBus;
    this.services = {
      content: AIContentCreation,
      personalization: PersonalizationEngine,
      optimization: CampaignOptimizer,
      intelligence: BehavioralIntelligence
    };
  }

  // Complete campaign creation and execution flow
  async createAndLaunchCampaign(campaignRequest) {
    try {
      // Step 1: Analyze target audience
      const audienceAnalysis = await this.analyzeAudience(campaignRequest.audience);
      
      // Step 2: Generate AI content
      const content = await this.services.content.generateCampaignContent({
        property: campaignRequest.property,
        targetAudience: audienceAnalysis,
        channels: campaignRequest.channels,
        tone: campaignRequest.tone || audienceAnalysis.preferredTone
      });

      // Step 3: Create campaign
      const campaign = await this.createCampaign({
        ...campaignRequest,
        content,
        audienceAnalysis
      });

      // Step 4: Personalize for each segment
      const personalizedSegments = await this.personalizeForSegments(
        campaign,
        audienceAnalysis.segments
      );

      // Step 5: Optimize delivery
      const optimizedCampaign = await this.services.optimization.optimizeCampaign(
        campaign.id
      );

      // Step 6: Launch campaign
      await this.launchCampaign(optimizedCampaign);

      // Step 7: Start real-time monitoring
      await this.startMonitoring(campaign.id);

      return {
        campaignId: campaign.id,
        status: 'launched',
        segments: personalizedSegments.length,
        estimatedReach: audienceAnalysis.totalReach,
        content: content,
        optimizations: optimizedCampaign.optimizations
      };

    } catch (error) {
      console.error('Campaign creation failed:', error);
      throw error;
    }
  }

  async analyzeAudience(audienceCriteria) {
    const analysis = {
      segments: [],
      totalReach: 0,
      preferredTone: 'professional',
      channels: {}
    };

    // Get leads matching criteria
    const leads = await this.getMatchingLeads(audienceCriteria);
    
    // Segment using ML clustering
    const segments = await this.services.intelligence.clusterLeads(leads);
    
    for (const segment of segments) {
      const segmentAnalysis = {
        id: segment.id,
        size: segment.leads.length,
        characteristics: await this.analyzeSegmentCharacteristics(segment),
        preferredChannels: await this.identifyPreferredChannels(segment),
        optimalTiming: await this.calculateOptimalTiming(segment),
        contentPreferences: await this.analyzeContentPreferences(segment)
      };
      
      analysis.segments.push(segmentAnalysis);
      analysis.totalReach += segment.leads.length;
    }

    // Aggregate preferences
    analysis.preferredTone = this.aggregatePreferredTone(analysis.segments);
    analysis.channels = this.aggregateChannelPreferences(analysis.segments);

    return analysis;
  }

  async personalizeForSegments(campaign, segments) {
    const personalizedSegments = [];

    for (const segment of segments) {
      const personalizedContent = await this.services.personalization.personalizeContent(
        segment.id,
        campaign.content,
        {
          segment: segment.characteristics,
          campaign: campaign.id,
          timestamp: new Date()
        }
      );

      personalizedSegments.push({
        segmentId: segment.id,
        content: personalizedContent,
        deliverySchedule: segment.optimalTiming,
        channels: segment.preferredChannels
      });
    }

    return personalizedSegments;
  }

  async launchCampaign(campaign) {
    // Create execution plan
    const executionPlan = await this.createExecutionPlan(campaign);
    
    // Schedule all deliveries
    for (const delivery of executionPlan.deliveries) {
      await this.scheduleDelivery(delivery);
    }

    // Emit launch event
    this.eventBus.emit('campaign.launched', {
      campaignId: campaign.id,
      executionPlan,
      startTime: new Date()
    });

    // Start optimization loop
    this.startOptimizationLoop(campaign.id);
  }

  async startOptimizationLoop(campaignId) {
    // Run optimization every hour
    const optimizationInterval = setInterval(async () => {
      try {
        const performance = await this.getCampaignPerformance(campaignId);
        
        if (performance.status === 'completed') {
          clearInterval(optimizationInterval);
          return;
        }

        // Check if optimization is needed
        if (this.shouldOptimize(performance)) {
          const optimizations = await this.services.optimization.optimizeCampaign(
            campaignId
          );
          
          // Apply optimizations
          await this.applyOptimizations(campaignId, optimizations);
          
          // Emit optimization event
          this.eventBus.emit('campaign.optimized', {
            campaignId,
            optimizations,
            performance
          });
        }
      } catch (error) {
        console.error('Optimization loop error:', error);
      }
    }, 3600000); // 1 hour
  }

  shouldOptimize(performance) {
    // Optimization triggers
    return (
      performance.ctr < performance.targetCTR * 0.8 ||
      performance.conversionRate < performance.targetConversion * 0.8 ||
      performance.deliveryRate < 0.95 ||
      performance.unsubscribeRate > 0.02
    );
  }

  async startMonitoring(campaignId) {
    // Real-time monitoring using Kafka streams
    await this.eventBus.subscribe('campaign-metrics', async (data) => {
      if (data.campaignId === campaignId) {
        await this.processMetrics(data);
      }
    });

    // Set up alerts
    await this.setupAlerts(campaignId);
  }

  async setupAlerts(campaignId) {
    const alertRules = [
      {
        metric: 'delivery_failure_rate',
        threshold: 0.05,
        action: 'pause_and_investigate'
      },
      {
        metric: 'unsubscribe_rate',
        threshold: 0.03,
        action: 'review_content'
      },
      {
        metric: 'conversion_rate',
        threshold: 0.001,
        comparison: 'less_than',
        action: 'trigger_optimization'
      }
    ];

    for (const rule of alertRules) {
      await this.monitoringService.createAlert({
        campaignId,
        rule,
        handler: async (alert) => {
          await this.handleAlert(campaignId, alert);
        }
      });
    }
  }
}

module.exports = new CampaignOrchestrator();