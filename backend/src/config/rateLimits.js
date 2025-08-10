const RATE_LIMITS = {
  // WhatsApp Business API Limits
  whatsapp: {
    messaging: {
      tier1: { // 1K business-initiated conversations/day
        limit: 1000,
        window: 86400000, // 24 hours in ms
        type: 'sliding'
      },
      tier2: { // 10K business-initiated conversations/day
        limit: 10000,
        window: 86400000,
        type: 'sliding'
      },
      tier3: { // 100K business-initiated conversations/day
        limit: 100000,
        window: 86400000,
        type: 'sliding'
      },
      perPhone: { // Per phone number rate limit
        limit: 20,
        window: 60000, // 1 minute
        type: 'sliding'
      }
    },
    media: {
      upload: {
        limit: 100,
        window: 3600000, // 1 hour
        type: 'sliding'
      }
    }
  },

  // Social Media API Limits
  facebook: {
    posts: {
      page: {
        limit: 50,
        window: 86400000, // 24 hours
        type: 'fixed'
      },
      api: {
        limit: 200,
        window: 3600000, // 1 hour
        type: 'sliding'
      }
    }
  },

  instagram: {
    posts: {
      business: {
        limit: 25,
        window: 86400000, // 24 hours
        type: 'fixed'
      },
      api: {
        limit: 200,
        window: 3600000, // 1 hour
        type: 'sliding'
      }
    },
    stories: {
      limit: 100,
      window: 86400000, // 24 hours
      type: 'fixed'
    }
  },

  linkedin: {
    posts: {
      user: {
        limit: 100,
        window: 86400000, // 24 hours
        type: 'fixed'
      },
      company: {
        limit: 50,
        window: 86400000, // 24 hours
        type: 'fixed'
      }
    }
  },

  // Email Service Limits
  email: {
    sendgrid: {
      daily: {
        limit: 100000,
        window: 86400000,
        type: 'fixed'
      },
      concurrent: {
        limit: 1000,
        window: 1000, // 1 second
        type: 'sliding'
      }
    }
  },

  // SMS Limits
  sms: {
    twilio: {
      perSecond: {
        limit: 30,
        window: 1000,
        type: 'sliding'
      },
      perNumber: {
        limit: 200,
        window: 86400000, // 24 hours
        type: 'fixed'
      }
    }
  }
};