const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const crypto = require('crypto');
const auditLogger = require('./auditLogger');

class GDPRService {
  constructor() {
    this.initializeConsentTable();
  }

  async initializeConsentTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS user_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        consent_type VARCHAR(50) NOT NULL,
        status BOOLEAN NOT NULL,
        ip_address INET,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version VARCHAR(20),
        details JSONB
      );

      CREATE TABLE IF NOT EXISTS data_processing_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        request_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        data_url TEXT,
        expires_at TIMESTAMP
      );

      CREATE INDEX idx_consents_user ON user_consents(user_id);
      CREATE INDEX idx_requests_user ON data_processing_requests(user_id);
    `;

    try {
      await pool.query(query);
    } catch (error) {
      logger.error('Failed to create GDPR tables:', error);
    }
  }

  // Consent Management
  async recordConsent(userId, consentType, status, ipAddress, details = {}) {
    const query = `
      INSERT INTO user_consents (user_id, consent_type, status, ip_address, version, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      consentType,
      status,
      ipAddress,
      process.env.PRIVACY_POLICY_VERSION || '1.0',
      JSON.stringify(details)
    ]);

    await auditLogger.logAction(userId, 'CONSENT_UPDATED', 'user_consents', {
      consentType,
      status,
      version: process.env.PRIVACY_POLICY_VERSION
    });

    return result.rows[0];
  }

  async getConsentStatus(userId) {
    const query = `
      SELECT DISTINCT ON (consent_type) 
        consent_type, status, timestamp, version
      FROM user_consents
      WHERE user_id = $1
      ORDER BY consent_type, timestamp DESC
    `;

    const result = await pool.query(query, [userId]);
    
    const consents = {
      marketing: false,
      analytics: false,
      profiling: false,
      thirdParty: false
    };

    result.rows.forEach(row => {
      consents[row.consent_type] = row.status;
    });

    return consents;
  }

  // Data Export (Right to Access)
  async handleDataExportRequest(userId, requestedBy) {
    try {
      // Create request record
      const requestQuery = `
        INSERT INTO data_processing_requests (user_id, request_type, status)
        VALUES ($1, 'export', 'processing')
        RETURNING id
      `;
      const requestResult = await pool.query(requestQuery, [userId]);
      const requestId = requestResult.rows[0].id;

      // Collect all user data
      const userData = await this.collectUserData(userId);

      // Generate secure download link
      const downloadUrl = await this.generateSecureDownloadLink(userId, userData);

      // Update request
      await pool.query(`
        UPDATE data_processing_requests 
        SET status = 'completed', 
            completed_at = NOW(), 
            data_url = $1,
            expires_at = NOW() + INTERVAL '7 days'
        WHERE id = $2
      `, [downloadUrl, requestId]);

      await auditLogger.logAction(requestedBy, 'DATA_EXPORT_REQUESTED', 'users', {
        userId,
        requestId
      });

      return {
        requestId,
        downloadUrl,
        expiresIn: '7 days'
      };
    } catch (error) {
      logger.error('Data export failed:', error);
      throw error;
    }
  }

  async collectUserData(userId) {
    const userData = {};

    // Basic user info
    const userQuery = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    userData.profile = this.sanitizeUserData(userQuery.rows[0]);

    // Leads created by user
    const leadsQuery = await pool.query(
      'SELECT * FROM leads WHERE user_id = $1',
      [userId]
    );
    userData.leads = leadsQuery.rows;

    // Campaigns
    const campaignsQuery = await pool.query(
      'SELECT * FROM campaigns WHERE user_id = $1',
      [userId]
    );
    userData.campaigns = campaignsQuery.rows;

    // Messages
    const messagesQuery = await pool.query(`
      SELECT m.* FROM messages m
      JOIN campaigns c ON m.campaign_id = c.id
      WHERE c.user_id = $1
    `, [userId]);
    userData.messages = messagesQuery.rows;

    // Analytics
    const analyticsQuery = await pool.query(
      'SELECT * FROM analytics WHERE user_id = $1',
      [userId]
    );
    userData.analytics = analyticsQuery.rows;

    // Audit logs
    const auditQuery = await pool.query(
      'SELECT * FROM audit_logs WHERE user_id = $1',
      [userId]
    );
    userData.auditLogs = auditQuery.rows;

    return userData;
  }

  sanitizeUserData(userData) {
    const { password_hash, ...sanitized } = userData;
    return sanitized;
  }

  async generateSecureDownloadLink(userId, data) {
    const filename = `user_data_${userId}_${Date.now()}.json`;
    const encryptedData = this.encryptData(JSON.stringify(data, null, 2));
    
    // Store in secure temporary storage
    const token = crypto.randomBytes(32).toString('hex');
    const key = `gdpr_export:${token}`;
    
    await require('../config/redis').client.setex(
      key,
      604800, // 7 days
      encryptedData
    );

    return `${process.env.APP_URL}/api/gdpr/download/${token}`;
  }

  encryptData(data) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      authTag: authTag.toString('hex'),
      iv: iv.toString('hex')
    });
  }

  // Data Deletion (Right to be Forgotten)
  async handleDataDeletionRequest(userId, requestedBy, options = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create deletion request
      const requestQuery = `
        INSERT INTO data_processing_requests (user_id, request_type, status, details)
        VALUES ($1, 'deletion', 'processing', $2)
        RETURNING id
      `;
      const requestResult = await client.query(requestQuery, [
        userId,
        JSON.stringify(options)
      ]);
      const requestId = requestResult.rows[0].id;

      if (options.immediate) {
        // Hard delete
        await this.performHardDelete(client, userId);
      } else {
        // Soft delete with anonymization
        await this.performSoftDelete(client, userId);
      }

      await client.query(`
        UPDATE data_processing_requests 
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
      `, [requestId]);

      await client.query('COMMIT');

      await auditLogger.logAction(requestedBy, 'DATA_DELETION_REQUESTED', 'users', {
        userId,
        requestId,
        type: options.immediate ? 'hard' : 'soft'
      });

      return { requestId, status: 'completed' };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Data deletion failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async performSoftDelete(client, userId) {
    // Anonymize user data
    await client.query(`
      UPDATE users 
      SET email = CONCAT('deleted_', id, '@anonymous.com'),
          full_name = 'Deleted User',
          phone = NULL,
          is_active = false,
          updated_at = NOW()
      WHERE id = $1
    `, [userId]);

    // Anonymize leads
    await client.query(`
      UPDATE leads 
      SET name = 'Anonymous',
          email = NULL,
          phone = CONCAT('DELETED_', id),
          notes = NULL
      WHERE user_id = $1
    `, [userId]);

    // Delete sensitive campaign content
    await client.query(`
      UPDATE campaigns 
      SET content = '{"deleted": true}',
          status = 'deleted'
      WHERE user_id = $1
    `, [userId]);
  }

  async performHardDelete(client, userId) {
    // Delete in correct order due to foreign keys
    await client.query('DELETE FROM analytics WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM messages WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)', [userId]);
    await client.query('DELETE FROM campaigns WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM leads WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_consents WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  // Data Portability
  async exportDataInMachineReadableFormat(userId, format = 'json') {
    const data = await this.collectUserData(userId);
    
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        return this.convertToCSV(data);
      
      case 'xml':
        return this.convertToXML(data);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Automated data anonymization
  async anonymizeOldData() {
    const retentionPeriods = require('../config/dataRetention').RETENTION_PERIODS;
    
    for (const [table, config] of Object.entries(retentionPeriods)) {
      if (config.anonymizeAfter) {
        const query = `
          UPDATE ${table}
          SET ${config.anonymizeFields.join(', ')}
          WHERE created_at < NOW() - INTERVAL '${config.anonymizeAfter}'
          AND anonymized = false
        `;
        
        try {
          const result = await pool.query(query);
          logger.info(`Anonymized ${result.rowCount} records in ${table}`);
        } catch (error) {
          logger.error(`Anonymization failed for ${table}:`, error);
        }
      }
    }
  }
}

module.exports = new GDPRService();