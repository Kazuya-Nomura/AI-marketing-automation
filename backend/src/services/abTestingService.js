const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

class ABTestingService {
  constructor() {
    this.initializeTables();
  }

  async initializeTables() {
    const query = `
      CREATE TABLE IF NOT EXISTS ab_tests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        campaign_id UUID REFERENCES campaigns(id),
        status VARCHAR(50) DEFAULT 'draft',
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        traffic_split JSONB,
        winning_variant VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ab_test_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_id UUID REFERENCES ab_tests(id),
        variant_name VARCHAR(10) NOT NULL,
        content JSONB NOT NULL,
        traffic_percentage INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ab_test_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_id UUID REFERENCES ab_tests(id),
        variant_name VARCHAR(10) NOT NULL,
        lead_id UUID REFERENCES leads(id),
        action VARCHAR(50) NOT NULL,
        value NUMERIC,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_ab_results_test ON ab_test_results(test_id);
      CREATE INDEX idx_ab_results_variant ON ab_test_results(variant_name);
      CREATE INDEX idx_ab_results_lead ON ab_test_results(lead_id);
    `;

    try {
      await pool.query(query);
    } catch (error) {
      logger.error('Failed to create A/B testing tables:', error);
    }
  }

  async createABTest(campaignId, testConfig) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create test
      const testQuery = `
        INSERT INTO ab_tests (campaign_id, name, traffic_split, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id
      `;

      const trafficSplit = this.validateTrafficSplit(testConfig.variants);
      
      const testResult = await client.query(testQuery, [
        campaignId,
        testConfig.name,
        JSON.stringify(trafficSplit)
      ]);

      const testId = testResult.rows[0].id;

      // Create variants
      for (const [variantName, config] of Object.entries(testConfig.variants)) {
        await client.query(`
          INSERT INTO ab_test_variants (test_id, variant_name, content, traffic_percentage)
          VALUES ($1, $2, $3, $4)
        `, [
          testId,
          variantName,
          JSON.stringify(config.content),
          config.trafficPercentage
        ]);
      }

      await client.query('COMMIT');

      return {
        testId,
        status: 'active',
        variants: Object.keys(testConfig.variants)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('A/B test creation failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  validateTrafficSplit(variants) {
    const totalPercentage = Object.values(variants)
      .reduce((sum, v) => sum + v.trafficPercentage, 0);
    
    if (totalPercentage !== 100) {
      throw new Error('Traffic split must total 100%');
    }

    return Object.keys(variants).reduce((split, key) => {
      split[key] = variants[key].trafficPercentage;
      return split;
    }, {});
  }

  async assignVariant(testId, leadId) {
    // Get test configuration
    const testQuery = await pool.query(
      'SELECT traffic_split FROM ab_tests WHERE id = $1 AND status = \'active\'',
      [testId]
    );

    if (testQuery.rows.length === 0) {
      return null;
    }

    const trafficSplit = testQuery.rows[0].traffic_split;

    // Check if lead already assigned
    const existingAssignment = await pool.query(
      'SELECT variant_name FROM ab_test_results WHERE test_id = $1 AND lead_id = $2 LIMIT 1',
      [testId, leadId]
    );

    if (existingAssignment.rows.length > 0) {
      return existingAssignment.rows[0].variant_name;
    }

    // Assign variant based on traffic split
    const variant = this.selectVariantByTraffic(trafficSplit);

    // Record assignment
    await pool.query(`
      INSERT INTO ab_test_results (test_id, variant_name, lead_id, action)
      VALUES ($1, $2, $3, 'assigned')
    `, [testId, variant, leadId]);

    return variant;
  }

  selectVariantByTraffic(trafficSplit) {
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const [variant, percentage] of Object.entries(trafficSplit)) {
      cumulative += percentage;
      if (random <= cumulative) {
        return variant;
      }
    }

    // Fallback to first variant
    return Object.keys(trafficSplit)[0];
  }

  async recordConversion(testId, leadId, conversionType, value = 1) {
    // Get lead's variant
    const variantQuery = await pool.query(
      'SELECT variant_name FROM ab_test_results WHERE test_id = $1 AND lead_id = $2 AND action = \'assigned\' LIMIT 1',
      [testId, leadId]
    );

    if (variantQuery.rows.length === 0) {
      throw new Error('Lead not assigned to any variant');
    }

    const variant = variantQuery.rows[0].variant_name;

    // Record conversion
    await pool.query(`
      INSERT INTO ab_test_results (test_id, variant_name, lead_id, action, value)
      VALUES ($1, $2, $3, $4, $5)
    `, [testId, variant, leadId, conversionType, value]);

    // Check if test should end
    await this.checkTestCompletion(testId);
  }

  async getTestResults(testId) {
    const query = `
      WITH variant_stats AS (
        SELECT 
          variant_name,
          COUNT(DISTINCT lead_id) FILTER (WHERE action = 'assigned') as total_assigned,
          COUNT(DISTINCT lead_id) FILTER (WHERE action = 'clicked') as clicks,
          COUNT(DISTINCT lead_id) FILTER (WHERE action = 'converted') as conversions,
          SUM(value) FILTER (WHERE action = 'revenue') as revenue
        FROM ab_test_results
        WHERE test_id = $1
        GROUP BY variant_name
      )
      SELECT 
        variant_name,
        total_assigned,
        clicks,
        conversions,
        revenue,
        CASE WHEN total_assigned > 0 
          THEN ROUND((clicks::numeric / total_assigned) * 100, 2) 
          ELSE 0 
        END as click_rate,
        CASE WHEN total_assigned > 0 
          THEN ROUND((conversions::numeric / total_assigned) * 100, 2) 
          ELSE 0 
        END as conversion_rate,
        CASE WHEN conversions > 0 
          THEN ROUND(revenue / conversions, 2) 
          ELSE 0 
        END as avg_order_value
      FROM variant_stats
    `;

    const results = await pool.query(query, [testId]);
    
    // Calculate statistical significance
    const stats = await this.calculateStatisticalSignificance(results.rows);

    return {
      variants: results.rows,
      statistics: stats,
      testId
    };
  }

  async calculateStatisticalSignificance(variants) {
    if (variants.length !== 2) {
      return { significant: false, message: 'Requires exactly 2 variants' };
    }

    const [control, variant] = variants;

    // Z-test for conversion rate
    const p1 = control.conversion_rate / 100;
    const p2 = variant.conversion_rate / 100;
    const n1 = control.total_assigned;
    const n2 = variant.total_assigned;

    if (n1 < 30 || n2 < 30) {
      return { significant: false, message: 'Insufficient sample size' };
    }

    const pooledProp = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledProp * (1 - pooledProp) * (1/n1 + 1/n2));
    
    if (se === 0) {
      return { significant: false, message: 'No variance in data' };
    }

    const z = (p2 - p1) / se;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      significant: pValue < 0.05,
      pValue: pValue.toFixed(4),
      confidenceLevel: ((1 - pValue) * 100).toFixed(1) + '%',
      winner: pValue < 0.05 ? (p2 > p1 ? variant.variant_name : control.variant_name) : null,
      uplift: ((p2 - p1) / p1 * 100).toFixed(1) + '%'
    };
  }

  normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  async checkTestCompletion(testId) {
    const results = await this.getTestResults(testId);
    
    // Check if we have statistical significance
    if (results.statistics.significant) {
      await pool.query(`
        UPDATE ab_tests 
        SET status = 'completed', 
            winning_variant = $1,
            end_date = NOW()
        WHERE id = $2
      `, [results.statistics.winner, testId]);

      logger.info(`A/B test ${testId} completed. Winner: ${results.statistics.winner}`);
    }

    // Check if minimum sample size reached
    const minSampleSize = 1000;
    const totalSamples = results.variants.reduce((sum, v) => sum + v.total_assigned, 0);
    
    if (totalSamples >= minSampleSize * 2) {
      // Force completion if no significance after large sample
      await pool.query(`
        UPDATE ab_tests 
        SET status = 'completed', 
            winning_variant = 'no_winner',
            end_date = NOW()
        WHERE id = $1 AND status = 'active'
      `, [testId]);
    }
  }

  async getVariantContent(testId, variantName) {
    const query = `
      SELECT content FROM ab_test_variants 
      WHERE test_id = $1 AND variant_name = $2
    `;

    const result = await pool.query(query, [testId, variantName]);
    return result.rows[0]?.content || null;
  }

  async getAllActiveTests() {
    const query = `
      SELECT 
        t.id,
        t.name,
        t.campaign_id,
        t.start_date,
        c.name as campaign_name,
        COUNT(DISTINCT r.lead_id) as total_participants
      FROM ab_tests t
      LEFT JOIN campaigns c ON t.campaign_id = c.id
      LEFT JOIN ab_test_results r ON t.id = r.test_id
      WHERE t.status = 'active'
      GROUP BY t.id, t.name, t.campaign_id, t.start_date, c.name
    `;

    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = new ABTestingService();