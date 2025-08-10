const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class AuditLogger {
  async createAuditTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255),
        changes JSONB,
        ip_address INET,
        user_agent TEXT,
        request_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    `;

    try {
      await pool.query(query);
      logger.info('Audit table created/verified');
    } catch (error) {
      logger.error('Failed to create audit table:', error);
    }
  }

  async logAction(userId, action, entityType, details, req = null) {
    try {
      const auditEntry = {
        userId,
        action,
        entityType,
        entityId: details.entityId || details.id || null,
        changes: details,
        ipAddress: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent'] || null,
        requestId: req?.id || null,
        metadata: {
          timestamp: new Date().toISOString(),
          serverVersion: process.env.APP_VERSION || '1.0.0'
        }
      };

      const query = `
        INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, changes, ip_address, user_agent, request_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const result = await pool.query(query, [
        auditEntry.userId,
        auditEntry.action,
        auditEntry.entityType,
        auditEntry.entityId,
        JSON.stringify(auditEntry.changes),
        auditEntry.ipAddress,
        auditEntry.userAgent,
        auditEntry.requestId,
        JSON.stringify(auditEntry.metadata)
      ]);

      // Also send to external SIEM if configured
      if (process.env.SIEM_ENDPOINT) {
        await this.sendToSIEM(auditEntry);
      }

      return result.rows[0].id;
    } catch (error) {
      logger.error('Audit logging failed:', error);
      // Don't throw - audit failures shouldn't break the app
    }
  }

  async sendToSIEM(auditEntry) {
    // Send to Security Information Event Management system
    try {
      await axios.post(process.env.SIEM_ENDPOINT, {
        ...auditEntry,
        source: 'fineacers-automation',
        severity: this.calculateSeverity(auditEntry.action)
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.SIEM_API_KEY}`
        }
      });
    } catch (error) {
      logger.error('Failed to send to SIEM:', error);
    }
  }

  calculateSeverity(action) {
    const highSeverityActions = ['DELETE_USER', 'MODIFY_PERMISSIONS', 'EXPORT_DATA'];
    const mediumSeverityActions = ['CREATE_CAMPAIGN', 'MODIFY_LEAD', 'SEND_BULK_MESSAGE'];
    
    if (highSeverityActions.includes(action)) return 'HIGH';
    if (mediumSeverityActions.includes(action)) return 'MEDIUM';
    return 'LOW';
  }

  // Query methods for audit trail
  async getUserActivity(userId, days = 30) {
    const query = `
      SELECT * FROM audit_logs 
      WHERE user_id = $1 
      AND created_at > NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `;
    return await pool.query(query, [userId]);
  }

  async getEntityHistory(entityType, entityId) {
    const query = `
      SELECT * FROM audit_logs 
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
    `;
    return await pool.query(query, [entityType, entityId]);
  }
}

module.exports = new AuditLogger();