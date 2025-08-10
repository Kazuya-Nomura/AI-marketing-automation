const { pool } = require('../config/database');
const { validateLead } = require('../validators/leadValidator');
const { scoreLeadWithAI } = require('../services/aiService');
const { addToQueue } = require('../services/queueService');

class LeadController {
  async createLead(req, res) {
    try {
      const { error, value } = validateLead(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { name, email, phone, source, budget_range, interested_location, notes } = value;
      const userId = req.user.id;

      // AI lead scoring
      const score = await scoreLeadWithAI({ ...value });
      const temperature = score > 70 ? 'hot' : score > 40 ? 'warm' : 'cold';

      const query = `
        INSERT INTO leads (user_id, name, email, phone, source, score, temperature, 
                          budget_range, interested_location, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await pool.query(query, [
        userId, name, email, phone, source, score, temperature,
        budget_range, interested_location, notes
      ]);

      // Add to automation queue
      await addToQueue('lead-nurture', {
        leadId: result.rows[0].id,
        temperature,
        userId
      });

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Create lead error:', error);
      res.status(500).json({ error: 'Failed to create lead' });
    }
  }

  async bulkUploadLeads(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'CSV file required' });
      }

      const leads = [];
      const fs = require('fs');
      const csv = require('csv-parser');

      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          leads.push({
            name: row.name || row.Name,
            email: row.email || row.Email,
            phone: row.phone || row.Phone,
            source: 'csv_upload',
            budget_range: row.budget || row.Budget,
            interested_location: row.location || row.Location,
            notes: row.notes || row.Notes
          });
        })
        .on('end', async () => {
          // Process leads
          const results = await this.processBulkLeads(leads, req.user.id);
          
          // Clean up
          fs.unlinkSync(req.file.path);
          
          res.json({
            success: true,
            data: {
              total: leads.length,
              processed: results.processed,
              failed: results.failed
            }
          });
        });
    } catch (error) {
      console.error('Bulk upload error:', error);
      res.status(500).json({ error: 'Failed to process CSV' });
    }
  }

  async processBulkLeads(leads, userId) {
    let processed = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        // Score each lead
        const score = await scoreLeadWithAI(lead);
        const temperature = score > 70 ? 'hot' : score > 40 ? 'warm' : 'cold';

        // Insert lead
        const query = `
          INSERT INTO leads (user_id, name, email, phone, source, score, temperature, 
                            budget_range, interested_location, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (phone) DO UPDATE SET
            score = EXCLUDED.score,
            temperature = EXCLUDED.temperature,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        const result = await pool.query(query, [
          userId, lead.name, lead.email, lead.phone, lead.source, 
          score, temperature, lead.budget_range, lead.interested_location, lead.notes
        ]);

        // Add to nurture queue
        await addToQueue('lead-nurture', {
          leadId: result.rows[0].id,
          temperature,
          userId
        });

        processed++;
      } catch (error) {
        console.error('Lead processing error:', error);
        failed++;
      }
    }

    return { processed, failed };
  }

  async getLeads(req, res) {
    try {
      const userId = req.user.id;
      const { status, temperature, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT * FROM leads 
        WHERE user_id = $1
      `;
      const params = [userId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        params.push(status);
      }

      if (temperature) {
        paramCount++;
        query += ` AND temperature = $${paramCount}`;
        params.push(temperature);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rowCount
        }
      });
    } catch (error) {
      console.error('Get leads error:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
    }
  }
}

module.exports = new LeadController();