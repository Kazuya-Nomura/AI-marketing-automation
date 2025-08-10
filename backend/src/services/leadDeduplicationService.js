const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const auditLogger = require('./auditLogger');

class LeadDeduplicationService {
  constructor() {
    this.initializeTables();
  }

  async initializeTables() {
    const query = `
      CREATE TABLE IF NOT EXISTS lead_merge_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        primary_lead_id UUID REFERENCES leads(id),
        merged_lead_ids UUID[],
        merge_reason VARCHAR(100),
        merged_by UUID REFERENCES users(id),
        merged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        merge_data JSONB
      );

      CREATE INDEX idx_merge_history_primary ON lead_merge_history(primary_lead_id);
    `;

    try {
      await pool.query(query);
    } catch (error) {
      logger.error('Failed to create deduplication tables:', error);
    }
  }

  async checkDuplicate(leadData, userId) {
    const duplicates = await this.findPotentialDuplicates(leadData, userId);
    
    if (duplicates.length === 0) {
      return { isDuplicate: false };
    }

    const bestMatch = this.calculateBestMatch(leadData, duplicates);
    const similarity = this.calculateSimilarity(leadData, bestMatch);

    if (similarity > 0.8) {
      return {
        isDuplicate: true,
        existingLead: bestMatch,
        similarity,
        action: 'merge'
      };
    } else if (similarity > 0.6) {
      return {
        isDuplicate: 'possible',
        existingLead: bestMatch,
        similarity,
        action: 'review'
      };
    }

    return { isDuplicate: false };
  }

  async findPotentialDuplicates(leadData, userId) {
    const query = `
      SELECT * FROM leads 
      WHERE user_id = $1 
      AND (
        phone = $2 
        OR email = $3
        OR (
          name = $4 
          AND (phone = $2 OR email = $3)
        )
        OR (
          LOWER(name) = LOWER($4)
          AND interested_location = $5
        )
      )
      ORDER BY score DESC, created_at DESC
    `;

    const result = await pool.query(query, [
      userId,
      leadData.phone,
      leadData.email,
      leadData.name,
      leadData.interested_location
    ]);

    return result.rows;
  }

  calculateSimilarity(lead1, lead2) {
    let score = 0;
    let factors = 0;

    // Phone match (highest weight)
    if (lead1.phone && lead2.phone) {
      factors += 3;
      if (this.normalizePhone(lead1.phone) === this.normalizePhone(lead2.phone)) {
        score += 3;
      }
    }

    // Email match (high weight)
    if (lead1.email && lead2.email) {
      factors += 2.5;
      if (lead1.email.toLowerCase() === lead2.email.toLowerCase()) {
        score += 2.5;
      }
    }

    // Name similarity
    if (lead1.name && lead2.name) {
      factors += 2;
      const nameSimilarity = this.calculateStringSimilarity(
        lead1.name.toLowerCase(),
        lead2.name.toLowerCase()
      );
      score += nameSimilarity * 2;
    }

    // Location match
    if (lead1.interested_location && lead2.interested_location) {
      factors += 1;
      if (lead1.interested_location === lead2.interested_location) {
        score += 1;
      }
    }

    // Budget range match
    if (lead1.budget_range && lead2.budget_range) {
      factors += 0.5;
      if (lead1.budget_range === lead2.budget_range) {
        score += 0.5;
      }
    }

    return factors > 0 ? score / factors : 0;
  }

  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  normalizePhone(phone) {
    return phone.replace(/\D/g, '').slice(-10);
  }

  calculateBestMatch(leadData, duplicates) {
    let bestMatch = duplicates[0];
    let highestScore = this.calculateSimilarity(leadData, duplicates[0]);

    for (let i = 1; i < duplicates.length; i++) {
      const score = this.calculateSimilarity(leadData, duplicates[i]);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = duplicates[i];
      }
    }

    return bestMatch;
  }

  async mergeLeads(primaryLeadId, leadIdsToMerge, userId, reason = 'duplicate') {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get all lead data
      const leadsQuery = await client.query(
        'SELECT * FROM leads WHERE id = ANY($1) OR id = $2',
        [leadIdsToMerge, primaryLeadId]
      );
      const leads = leadsQuery.rows;

      // Merge data into primary lead
      const mergedData = this.mergeLeadData(leads, primaryLeadId);
      
      // Update primary lead with merged data
      await client.query(`
        UPDATE leads 
        SET 
          name = $1,
          email = COALESCE($2, email),
          phone = $3,
          score = $4,
          temperature = $5,
          notes = $6,
          updated_at = NOW()
        WHERE id = $7
      `, [
        mergedData.name,
        mergedData.email,
        mergedData.phone,
        mergedData.score,
        mergedData.temperature,
        mergedData.notes,
        primaryLeadId
      ]);

      // Update all related records to point to primary lead
      await client.query(
        'UPDATE messages SET lead_id = $1 WHERE lead_id = ANY($2)',
        [primaryLeadId, leadIdsToMerge]
      );

      // Archive merged leads
      await client.query(
        'UPDATE leads SET status = \'merged\', notes = CONCAT(notes, \' [Merged into \', $1, \']\') WHERE id = ANY($2)',
        [primaryLeadId, leadIdsToMerge]
      );

      // Record merge history
      await client.query(`
        INSERT INTO lead_merge_history 
        (primary_lead_id, merged_lead_ids, merge_reason, merged_by, merge_data)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        primaryLeadId,
        leadIdsToMerge,
        reason,
        userId,
        JSON.stringify(mergedData)
      ]);

      await client.query('COMMIT');

      await auditLogger.logAction(userId, 'LEADS_MERGED', 'leads', {
        primaryLeadId,
        mergedLeadIds: leadIdsToMerge,
        reason
      });

      return {
        success: true,
        primaryLeadId,
        mergedCount: leadIdsToMerge.length
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Lead merge failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  mergeLeadData(leads, primaryLeadId) {
    const primaryLead = leads.find(l => l.id === primaryLeadId);
    const otherLeads = leads.filter(l => l.id !== primaryLeadId);

    // Start with primary lead data
    const merged = { ...primaryLead };

    // Merge scores (take highest)
    merged.score = Math.max(...leads.map(l => l.score));

    // Merge temperature (take hottest)
    const tempOrder = { hot: 3, warm: 2, cold: 1 };
    merged.temperature = leads.reduce((hottest, lead) => {
      return tempOrder[lead.temperature] > tempOrder[hottest.temperature] ? lead : hottest;
    }).temperature;

    // Merge notes
    const allNotes = leads
      .map(l => l.notes)
      .filter(n => n)
      .join('\n---\n');
    merged.notes = allNotes;

    // Take most recent non-null values for other fields
    for (const field of ['email', 'interested_location', 'budget_range']) {
      if (!merged[field]) {
        const recent = leads
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
          .find(l => l[field]);
        if (recent) {
          merged[field] = recent[field];
        }
      }
    }

    return merged;
  }

  async findAllDuplicates(userId) {
    const query = `
      SELECT 
        l1.id as lead1_id,
        l1.name as lead1_name,
        l2.id as lead2_id,
        l2.name as lead2_name,
        CASE 
          WHEN l1.phone = l2.phone THEN 'phone'
          WHEN l1.email = l2.email THEN 'email'
          WHEN LOWER(l1.name) = LOWER(l2.name) THEN 'name'
        END as match_type
      FROM leads l1
      JOIN leads l2 ON l1.id < l2.id
      WHERE l1.user_id = $1 AND l2.user_id = $1
      AND l1.status != 'merged' AND l2.status != 'merged'
      AND (
        l1.phone = l2.phone 
        OR l1.email = l2.email
        OR (LOWER(l1.name) = LOWER(l2.name) AND l1.interested_location = l2.interested_location)
      )
      ORDER BY l1.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    
    // Group duplicates
    const groups = {};
    result.rows.forEach(row => {
      const key = `${row.lead1_id}`;
      if (!groups[key]) {
        groups[key] = {
          primaryLead: { id: row.lead1_id, name: row.lead1_name },
          duplicates: []
        };
      }
      groups[key].duplicates.push({
        id: row.lead2_id,
        name: row.lead2_name,
        matchType: row.match_type
      });
    });

    return Object.values(groups);
  }

  async autoMergeDuplicates(userId) {
    const duplicateGroups = await this.findAllDuplicates(userId);
    const results = [];

    for (const group of duplicateGroups) {
      try {
        const result = await this.mergeLeads(
          group.primaryLead.id,
          group.duplicates.map(d => d.id),
          userId,
          'auto-merge'
        );
        results.push(result);
      } catch (error) {
        logger.error('Auto-merge failed for group:', error);
      }
    }

    return {
      totalGroups: duplicateGroups.length,
      mergedGroups: results.length,
      failedGroups: duplicateGroups.length - results.length
    };
  }
}

module.exports = new LeadDeduplicationService();