const DATA_RETENTION_POLICIES = {
  leads: {
    active: '2 years',
    inactive: '6 months',
    anonymizeAfter: '3 years'
  },
  messages: {
    marketing: '1 year',
    transactional: '7 years'
  },
  analytics: {
    raw: '90 days',
    aggregated: '5 years'
  }
};