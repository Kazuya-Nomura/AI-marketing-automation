class IntegrationService {
  async syncWithCRM(lead) {
    /*
    Business Logic:
    1. Map marketing lead to CRM format
    2. Check for existing contact
    3. Update or create
    4. Trigger CRM workflows
    5. Get sales assignment
    */
    
    const crmLead = {
      source: 'marketing_automation',
      source_campaign: lead.campaign_id,
      contact: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email
      },
      properties_interested: lead.interested_properties,
      marketing_score: lead.engagement_score,
      marketing_temperature: lead.temperature,
      interactions: await this.getLeadInteractions(lead.id)
    };

    // Call CRM API
    const crmResponse = await crmAPI.createOrUpdateLead(crmLead);
    
    // Store CRM ID for future reference
    await this.updateLeadCRMId(lead.id, crmResponse.id);
    
    // Get assigned salesperson from CRM
    const assignment = await crmAPI.getLeadAssignment(crmResponse.id);
    
    // Notify salesperson via the system
    if (assignment.salesperson_id) {
      await this.notifySalesperson(assignment.salesperson_id, lead);
    }

    return crmResponse;
  }

  async getLeadDataFromCRM(filters) {
    /*
    Pull lead data from CRM for marketing campaigns
    */
    const crmLeads = await crmAPI.getLeads({
      ...filters,
      include_marketing_consent: true
    });

    return crmLeads.map(lead => ({
      crm_id: lead.id,
      name: lead.contact.name,
      phone: lead.contact.phone,
      email: lead.contact.email,
      temperature: lead.stage,
      properties_viewed: lead.properties_viewed,
      last_interaction: lead.last_activity,
      assigned_to: lead.salesperson,
      marketing_consent: lead.marketing_consent
    }));
  }
}