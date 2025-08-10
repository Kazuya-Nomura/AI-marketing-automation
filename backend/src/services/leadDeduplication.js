class LeadDeduplicationService {
  async checkDuplicate(leadData) {
    const query = `
      SELECT id, score, created_at FROM leads 
      WHERE (phone = $1 OR email = $2) 
      AND user_id = $3
      ORDER BY score DESC, created_at DESC
    `;
    // Merge logic for duplicate leads
  }
}