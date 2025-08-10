class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.initializeMonitoring();
  }

  async initializeMonitoring() {
    // Set up Prometheus metrics
    this.setupMetrics();
    
    // Connect to ClickHouse for time-series data
    this.clickhouse = new ClickHouse({
      url: process.env.CLICKHOUSE_URL
    });
  }

  setupMetrics() {
    // Campaign metrics
    this.metrics.set('campaign_launches', new Counter({
      name: 'fineacers_campaign_launches_total',
      help: 'Total number of campaigns launched',
      labelNames: ['type', 'channel']
    }));

    this.metrics.set('content_generated', new Counter({
      name: 'fineacers_content_generated_total',
      help: 'Total content pieces generated',
      labelNames: ['type', 'ai_model']
    }));

    this.metrics.set('lead_score', new Histogram({
      name: 'fineacers_lead_score_distribution',
      help: 'Distribution of lead scores',
      buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    }));

    this.metrics.set('api_response_time', new Histogram({
      name: 'fineacers_api_response_time_seconds',
      help: 'API response time in seconds',
      labelNames: ['method', 'endpoint', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    }));

    this.metrics.set('ai_inference_time', new Histogram({
      name: 'fineacers_ai_inference_time_seconds',
      help: 'AI model inference time',
      labelNames: ['model', 'operation'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    }));
  }

  async trackCampaignMetrics(campaignId, metrics) {
    // Store in ClickHouse for time-series analysis
    const query = `
      INSERT INTO campaign_metrics (
        campaign_id,
        timestamp,
        impressions,
        clicks,
        conversions,
        revenue,
        cost,
        ctr,
        conversion_rate,
        roi
      ) VALUES (
        '${campaignId}',
        now(),
        ${metrics.impressions},
        ${metrics.clicks},
        ${metrics.conversions},
        ${metrics.revenue},
        ${metrics.cost},
        ${metrics.ctr},
        ${metrics.conversionRate},
        ${metrics.roi}
      )
    `;

    await this.clickhouse.query(query);

    // Update Prometheus metrics
    this.metrics.get('campaign_performance').set(
      { campaign_id: campaignId, metric: 'roi' },
      metrics.roi
    );
  }

  async generatePerformanceReport(campaignId, period = '7d') {
    const query = `
      SELECT
        toStartOfHour(timestamp) as hour,
        sum(impressions) as total_impressions,
        sum(clicks) as total_clicks,
        sum(conversions) as total_conversions,
        sum(revenue) as total_revenue,
        sum(cost) as total_cost,
        avg(ctr) as avg_ctr,
        avg(conversion_rate) as avg_conversion_rate,
        (sum(revenue) - sum(cost)) / sum(cost) * 100 as roi
      FROM campaign_metrics
      WHERE campaign_id = '${campaignId}'
        AND timestamp >= now() - INTERVAL ${period}
      GROUP BY hour
      ORDER BY hour DESC
    `;

    const results = await this.clickhouse.query(query);

    // Generate insights
    const insights = await this.generateInsights(results);

    return {
      metrics: results,
      insights,
      recommendations: await this.generateRecommendations(results, campaignId)
    };
  }

  async generateInsights(metrics) {
    const insights = [];

    // Trend analysis
    const trend = this.analyzeTrend(metrics.map(m => m.roi));
    insights.push({
      type: 'trend',
      message: `ROI is ${trend.direction} with ${trend.change}% change`,
      severity: trend.direction === 'declining' ? 'warning' : 'info'
    });

    // Anomaly detection
    const anomalies = await this.detectAnomalies(metrics);
    anomalies.forEach(anomaly => {
      insights.push({
        type: 'anomaly',
        message: `Unusual ${anomaly.metric} detected at ${anomaly.timestamp}`,
        severity: 'warning',
        value: anomaly.value
      });
    });

    // Performance benchmarking
    const benchmark = await this.compareToBenchmark(metrics);
    insights.push({
      type: 'benchmark',
      message: `Performance is ${benchmark.percentile}th percentile compared to similar campaigns`,
      severity: benchmark.percentile < 50 ? 'warning' : 'success'
    });

    return insights;
  }

  analyzeTrend(values) {
    // Simple linear regression for trend
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const change = (slope / (sumY / n)) * 100;
    
    return {
      direction: slope > 0 ? 'improving' : 'declining',
      change: Math.abs(change).toFixed(1),
      slope
    };
  }
}

module.exports = new PerformanceMonitor();