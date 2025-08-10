const { pool } = require('../config/database');
const { validateLead } = require('../validators/leadValidator');
const { scoreLeadWithAI } = require('../services/aiService');
const { addToQueue } = require('../services/queueService');
const dataValidation = require('../middleware/validation');
const auditLogger = require('../services/auditLogger');

class LeadController {
  async createLead(req, res) {
    try {
      const { error, value } = validateLead(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      // Additional phone validation
      const phoneValidation = dataValidation.validatePhoneNumber(value.phone);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ 
          error: 'Invalid phone number format' 
        });
      }

      // Email validation if provided
      if (value.email && !dataValidation.validateEmail(value.email)) {
        return res.status(400).json({ 
          error: 'Invalid email format' 
        });
      }

      const { name, email, phone, source, budget_range, interested_location, notes } = value;
      const userId = req.user.id;

      // Use formatted phone number
      const formattedPhone = phoneValidation.formatted;

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
        userId, name, email, formattedPhone, source, score, temperature,
        budget_range, interested_location, notes
      ]);

      // Audit log
      await auditLogger.logAction(
        userId,
        'CREATE_LEAD',
        'leads',
        { leadId: result.rows[0].id, temperature }
      );

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
}