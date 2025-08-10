const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const leadCreationCounter = new promClient.Counter({
  name: 'leads_created_total',
  help: 'Total number of leads created',
  labelNames: ['source', 'temperature']
});

const activeUsersGauge = new promClient.Gauge({
  name: 'active_users_count',
  help: 'Number of active users',
  labelNames: ['role']
});

const campaignSuccessRate = new promClient.Gauge({
  name: 'campaign_success_rate',
  help: 'Campaign success rate percentage',
  labelNames: ['channel']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(leadCreationCounter);
register.registerMetric(activeUsersGauge);
register.registerMetric(campaignSuccessRate);

// Middleware to track HTTP metrics
const trackHttpMetrics = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.url, res.statusCode)
      .observe(duration);
  });
  
  next();
};

module.exports = {
  register,
  httpRequestDuration,
  leadCreationCounter,
  activeUsersGauge,
  campaignSuccessRate,
  trackHttpMetrics
};