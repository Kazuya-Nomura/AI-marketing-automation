const RETENTION_PERIODS = {
  leads: {
    active: { 
      duration: '2 years',
      condition: 'status IN (\'qualified\', \'contacted\', \'converted\')'
    },
    inactive: { 
      duration: '6 months',
      condition: 'status IN (\'new\', \'cold\') AND last_contact < NOW() - INTERVAL \'90 days\''
    },
    anonymizeAfter: '3 years',
    anonymizeFields: [
      'name = \'Anonymous\'',
      'email = NULL',
      'phone = CONCAT(\'ANON_\', id)',
      'notes = NULL',
      'anonymized = true'
    ]
  },
  
  messages: {
    marketing: { 
      duration: '1 year',
      condition: 'channel IN (\'email\', \'sms\', \'whatsapp\') AND campaign_id IS NOT NULL'
    },
    transactional: { 
      duration: '7 years',
      condition: 'channel = \'email\' AND campaign_id IS NULL'
    },
    deleteAfter: '7 years'
  },
  
  campaigns: {
    active: { duration: '2 years' },
    archived: { duration: '5 years' },
    deleteAfter: '5 years'
  },
  
  analytics: {
    raw: { 
      duration: '90 days',
      aggregate: true
    },
    aggregated: { 
      duration: '5 years'
    }
  },
  
  audit_logs: {
    standard: { duration: '1 year' },
    security: { duration: '3 years' },
    compliance: { duration: '7 years' }
  }
};

// Automated retention service
class DataRetentionService {
  constructor() {
    this.scheduleRetentionJobs();
  }

  scheduleRetentionJobs() {
    const cron = require('node-cron');
    
    // Daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.enforceRetentionPolicies();
    });
    
    // Weekly aggregation
    cron.schedule('0 3 * * 0', async () => {
      await this.aggregateOldAnalytics();
    });
  }

  async enforceRetentionPolicies() {
    const { pool } = require('../config/database');
    const { logger } = require('../utils/logger');
    
    for (const [table, policies] of Object.entries(RETENTION_PERIODS)) {
      try {
        // Delete old data
        if (policies.deleteAfter) {
          const deleteQuery = `
            DELETE FROM ${table}
            WHERE created_at < NOW() - INTERVAL '${policies.deleteAfter}'
            RETURNING id
          `;
          
          const result = await pool.query(deleteQuery);
          logger.info(`Deleted ${result.rowCount} old records from ${table}`);
        }
        
        // Archive data
        if (policies.archiveAfter) {
          await this.archiveOldData(table, policies.archiveAfter);
        }
        
        // Anonymize data
        if (policies.anonymizeAfter) {
          await require('../services/gdprService').anonymizeOldData();
        }
      } catch (error) {
        logger.error(`Retention policy enforcement failed for ${table}:`, error);
      }
    }
  }

  async aggregateOldAnalytics() {
    const { pool } = require('../config/database');
    
    const query = `
      INSERT INTO analytics_aggregated (
        user_id, event_type, date, count, metadata
      )
      SELECT 
        user_id,
        event_type,
        DATE(created_at) as date,
        COUNT(*) as count,
        jsonb_build_object(
          'unique_values', jsonb_agg(DISTINCT event_data)
        ) as metadata
      FROM analytics
      WHERE created_at < NOW() - INTERVAL '90 days'
      GROUP BY user_id, event_type, DATE(created_at)
      ON CONFLICT (user_id, event_type, date) 
      DO UPDATE SET count = EXCLUDED.count;
      
      DELETE FROM analytics 
      WHERE created_at < NOW() - INTERVAL '90 days';
    `;
    
    await pool.query(query);
  }

  async getRetentionReport() {
    const { pool } = require('../config/database');
    const report = {};
    
    for (const [table, policies] of Object.entries(RETENTION_PERIODS)) {
      const countQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${policies.deleteAfter || '10 years'}') as to_delete,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${policies.anonymizeAfter || '10 years'}') as to_anonymize
        FROM ${table}
      `;
      
      const result = await pool.query(countQuery);
      report[table] = result.rows[0];
    }
    
    return report;
  }
}

module.exports = {
  RETENTION_PERIODS,
  DataRetentionService: new DataRetentionService()
};