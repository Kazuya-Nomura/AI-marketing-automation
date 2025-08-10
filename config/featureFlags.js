export const featureFlags = {
  // Onboarding features
  'onboarding.google-sso': {
    enabled: true,
    rolloutPercentage: 100,
    overrides: []
  },
  'onboarding.social-media-bulk': {
    enabled: true,
    rolloutPercentage: 50,
    overrides: ['beta-users']
  },
  'onboarding.ai-integration': {
    enabled: true,
    rolloutPercentage: 25,
    overrides: ['enterprise-users']
  },
  
  // Campaign features
  'campaign.multi-channel-preview': {
    enabled: true,
    rolloutPercentage: 100
  },
  'campaign.ai-content-generation': {
    enabled: true,
    rolloutPercentage: 75,
    overrides: ['pro-users', 'enterprise-users']
  },
  
  // Performance features
  'performance.lazy-loading': {
    enabled: true,
    rolloutPercentage: 100
  },
  'performance.edge-caching': {
    enabled: true,
    rolloutPercentage: 100
  }
};

// Feature flag middleware
export const checkFeatureFlag = (flagName) => {
  return (req, res, next) => {
    const flag = featureFlags[flagName];
    if (!flag || !flag.enabled) {
      return res.status(404).json({ error: 'Feature not available' });
    }
    
    const userGroup = req.user?.group;
    const userId = req.user?.id;
    
    // Check overrides
    if (flag.overrides?.includes(userGroup)) {
      return next();
    }
    
    // Check rollout percentage
    const userHash = hashUserId(userId);
    const rolloutThreshold = flag.rolloutPercentage / 100;
    
    if (userHash <= rolloutThreshold) {
      return next();
    }
    
    return res.status(404).json({ error: 'Feature not available' });
  };
};