```
// Set in L1 cache
    this.l1Cache.set(cacheKey, value);
    
    // Set L1 cache size limit
    if (this.l1Cache.size > 1000) {
      const firstKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(firstKey);
    }

    // Set in L2 cache
    try {
      await this.l2Cache.setex(
        cacheKey, 
        config.ttl, 
        JSON.stringify(value)
      );
      
      // Add to invalidation sets
      if (config.invalidateOn && options.tags) {
        for (const tag of options.tags) {
          await this.l2Cache.sadd(`tag:${tag}`, cacheKey);
          await this.l2Cache.expire(`tag:${tag}`, config.ttl);
        }
      }
    } catch (error) {
      logger.error('L2 cache set error:', error);
    }
  }

  // Cache invalidation
  async invalidate(pattern) {
    // Clear from L1
    for (const key of this.l1Cache.keys()) {
      if (key.includes(pattern)) {
        this.l1Cache.delete(key);
      }
    }

    // Clear from L2
    const stream = this.l2Cache.scanStream({
      match: `*${pattern}*`,
      count: 100
    });

    stream.on('data', async (keys) => {
      if (keys.length) {
        await this.l2Cache.del(...keys);
      }
    });

    return new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  // Tag-based invalidation
  async invalidateByTag(tag) {
    const keys = await this.l2Cache.smembers(`tag:${tag}`);
    
    if (keys.length > 0) {
      // Remove from L1
      keys.forEach(key => this.l1Cache.delete(key));
      
      // Remove from L2
      await this.l2Cache.del(...keys);
      await this.l2Cache.del(`tag:${tag}`);
    }
  }

  // Generate cache key
  generateKey(key, options) {
    const parts = [key];
    
    if (options.userId) parts.push(`u:${options.userId}`);
    if (options.region) parts.push(`r:${options.region}`);
    if (options.params) {
      const paramHash = createHash('md5')
        .update(JSON.stringify(options.params))
        .digest('hex')
        .substring(0, 8);
      parts.push(`p:${paramHash}`);
    }
    
    return parts.join(':');
  }

  // Setup cache invalidation listeners
  setupInvalidation() {
    const eventBus = require('../events/eventBus');
    
    for (const [type, config] of Object.entries(this.cacheConfig)) {
      config.invalidateOn.forEach(event => {
        eventBus.on(event, async (data) => {
          await this.invalidateByType(type, data);
        });
      });
    }
  }

  // Cache warmup for critical data
  async setupWarmup() {
    const warmupConfigs = Object.entries(this.cacheConfig)
      .filter(([_, config]) => config.warmup);

    for (const [type, config] of warmupConfigs) {
      await this.warmupCache(type);
      
      // Schedule periodic warmup
      setInterval(
        () => this.warmupCache(type),
        config.ttl * 1000 * 0.8 // Warmup at 80% of TTL
      );
    }
  }

  async warmupCache(type) {
    logger.info(`Starting cache warmup for ${type}`);
    
    const warmupStrategies = {
      leads: async () => {
        const query = `
          SELECT * FROM leads 
          WHERE status = 'active' 
          AND updated_at > NOW() - INTERVAL '24 hours'
          ORDER BY score DESC 
          LIMIT 100
        `;
        const result = await pool.query(query);
        
        for (const lead of result.rows) {
          await this.set(`lead:${lead.id}`, lead, { type: 'leads' });
        }
      },
      
      campaigns: async () => {
        const query = `
          SELECT * FROM campaigns 
          WHERE status IN ('active', 'scheduled')
          ORDER BY created_at DESC 
          LIMIT 50
        `;
        const result = await pool.query(query);
        
        for (const campaign of result.rows) {
          await this.set(`campaign:${campaign.id}`, campaign, { type: 'campaigns' });
        }
      },
      
      userPermissions: async () => {
        const query = `
          SELECT u.id, u.role, u.region, u.permissions 
          FROM users u 
          WHERE u.last_login > NOW() - INTERVAL '7 days'
        `;
        const result = await pool.query(query);
        
        for (const user of result.rows) {
          const permissions = await rbacService.getUserPermissions(
            user.role, 
            user.region
          );
          await this.set(
            `permissions:${user.id}`, 
            permissions, 
            { type: 'userPermissions' }
          );
        }
      }
    };

    const strategy = warmupStrategies[type];
    if (strategy) {
      await strategy();
      logger.info(`Cache warmup completed for ${type}`);
    }
  }

  // Cache statistics
  getStats() {
    return {
      l1Size: this.l1Cache.size,
      l1HitRate: this.calculateHitRate('l1'),
      l2HitRate: this.calculateHitRate('l2'),
      missRate: this.calculateMissRate()
    };
  }
}

module.exports = new AdvancedCacheService();
```