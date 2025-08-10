const { EventEmitter } = require('events');
const { Kafka } = require('kafkajs');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.kafka = new Kafka({
      clientId: 'fineacers-app',
      brokers: process.env.KAFKA_BROKERS.split(',')
    });
    this.producer = this.kafka.producer();
    this.consumers = new Map();
    this.initialize();
  }

  async initialize() {
    await this.producer.connect();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Lead Events
    this.on('lead.created', async (data) => {
      await this.publish('lead-events', { type: 'created', data });
    });

    this.on('lead.scored', async (data) => {
      await this.publish('lead-events', { type: 'scored', data });
      await this.triggerAutomation('lead.scored', data);
    });

    // Content Events
    this.on('content.generated', async (data) => {
      await this.publish('content-events', { type: 'generated', data });
    });

    this.on('content.distributed', async (data) => {
      await this.publish('content-events', { type: 'distributed', data });
      await this.trackAnalytics('content.distributed', data);
    });

    // Campaign Events
    this.on('campaign.launched', async (data) => {
      await this.publish('campaign-events', { type: 'launched', data });
      await this.startRealtimeTracking(data.campaignId);
    });

    this.on('campaign.optimized', async (data) => {
      await this.publish('campaign-events', { type: 'optimized', data });
    });

    // AI Events
    this.on('ai.prediction', async (data) => {
      await this.publish('ai-events', { type: 'prediction', data });
    });

    this.on('ai.training.complete', async (data) => {
      await this.publish('ai-events', { type: 'training_complete', data });
      await this.deployNewModel(data.modelId);
    });
  }

  async publish(topic, message) {
    await this.producer.send({
      topic,
      messages: [
        {
          key: message.type,
          value: JSON.stringify({
            ...message,
            timestamp: new Date().toISOString(),
            version: '2.0'
          })
        }
      ]
    });
  }

  async subscribe(topic, handler) {
    if (!this.consumers.has(topic)) {
      const consumer = this.kafka.consumer({ 
        groupId: `fineacers-${topic}-group` 
      });
      
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });
      
      this.consumers.set(topic, consumer);
      
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const data = JSON.parse(message.value.toString());
          await handler(data);
        }
      });
    }
  }

  async triggerAutomation(event, data) {
    // Trigger N8N workflows based on events
    const workflows = await this.getEventWorkflows(event);
    
    for (const workflow of workflows) {
      await this.n8nService.trigger(workflow.id, {
        event,
        data,
        timestamp: new Date().toISOString()
      });
    }
  }

  async trackAnalytics(event, data) {
    // Send to real-time analytics
    await this.analyticsService.track({
      event,
      properties: data,
      timestamp: new Date(),
      context: {
        version: '2.0',
        source: 'event-bus'
      }
    });
  }
}

module.exports = new EventBus();