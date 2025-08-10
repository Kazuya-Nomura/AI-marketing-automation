const Bull = require('bull');
const Redis = require('ioredis');

class RateLimiter {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.limits = RATE_LIMITS;
    this.queues = new Map();
    this.initializeQueues();
  }

  async checkLimit(service, operation, identifier = 'global') {
    const limitConfig = this.getLimitConfig(service, operation);
    if (!limitConfig) return { allowed: true };

    const key = `rate_limit:${service}:${operation}:${identifier}`;
    const now = Date.now();

    if (limitConfig.type === 'sliding') {
      return await this.checkSlidingWindow(key, limitConfig, now);
    } else {
      return await this.checkFixedWindow(key, limitConfig, now);
    }
  }

  async checkSlidingWindow(key, config, now) {
    const windowStart = now - config.window;
    
    // Remove old entries
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current entries
    const count = await this.redis.zcard(key);
    
    if (count >= config.limit) {
      // Calculate when next slot will be available
      const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const nextAvailable = oldestEntry.length > 0 
        ? parseInt(oldestEntry[1]) + config.window - now
        : 0;
      
      return {
        allowed: false,
        retryAfter: Math.ceil(nextAvailable / 1000),
        limit: config.limit,
        remaining: 0,
        resetAt: new Date(now + nextAvailable)
      };
    }
    
    // Add current request
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, Math.ceil(config.window / 1000));
    
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - count - 1,
      resetAt: new Date(now + config.window)
    };
  }

  async checkFixedWindow(key, config, now) {
    const window = Math.floor(now / config.window);
    const windowKey = `${key}:${window}`;
    
    const count = await this.redis.incr(windowKey);
    
    if (count === 1) {
      await this.redis.expire(windowKey, Math.ceil(config.window / 1000));
    }
    
    if (count > config.limit) {
      const resetAt = (window + 1) * config.window;
      
      return {
        allowed: false,
        retryAfter: Math.ceil((resetAt - now) / 1000),
        limit: config.limit,
        remaining: 0,
        resetAt: new Date(resetAt)
      };
    }
    
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - count,
      resetAt: new Date((window + 1) * config.window)
    };
  }

  getLimitConfig(service, operation) {
    return this.limits[service]?.[operation];
  }
}

// Queue Manager for Bulk Operations
class QueueManager {
  constructor() {
    this.queues = new Map();
    this.rateLimiter = new RateLimiter();
    this.initializeQueues();
  }

  initializeQueues() {
    // WhatsApp Queue
    this.createQueue('whatsapp', {
      concurrency: 10,
      rateLimit: { max: 20, duration: 60000 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    // Email Queue
    this.createQueue('email', {
      concurrency: 50,
      rateLimit: { max: 1000, duration: 1000 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 5000 }
      }
    });

    // Social Media Queue
    this.createQueue('social', {
      concurrency: 5,
      rateLimit: { max: 10, duration: 60000 },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60000 }
      }
    });
  }

  createQueue(name, options) {
    const queue = new Bull(name, process.env.REDIS_URL);
    
    queue.process(options.concurrency, async (job) => {
      // Check rate limit before processing
      const canProceed = await this.rateLimiter.checkLimit(
        name,
        job.data.operation || 'default',
        job.data.identifier
      );
      
      if (!canProceed.allowed) {
        // Reschedule job
        throw new Error(`Rate limit exceeded. Retry after ${canProceed.retryAfter}s`);
      }
      
      // Process job
      return await this.processJob(name, job);
    });

    // Add rate limiter to queue
    if (options.rateLimit) {
      queue.concurrency(options.concurrency);
      queue.limiter = {
        max: options.rateLimit.max,
        duration: options.rateLimit.duration
      };
    }

    this.queues.set(name, { queue, options });
  }

  async addBulkJobs(queueName, jobs) {
    const { queue, options } = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);

    // Batch jobs for efficiency
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < jobs.length; i += batchSize) {
      batches.push(jobs.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const batchJobs = batch.map(data => ({
        data,
        opts: {
          ...options.defaultJobOptions,
          delay: this.calculateDelay(queueName, results.length)
        }
      }));
      
      const added = await queue.addBulk(batchJobs);
      results.push(...added);
    }

    return results;
  }

  calculateDelay(queueName, position) {
    // Spread out jobs to avoid rate limits
    const delays = {
      whatsapp: position * 3000, // 3 seconds between jobs
      email: position * 100, // 100ms between jobs
      social: position * 10000 // 10 seconds between jobs
    };
    
    return delays[queueName] || 0;
  }

  async processJob(queueName, job) {
    switch (queueName) {
      case 'whatsapp':
        return await this.processWhatsAppJob(job);
      case 'email':
        return await this.processEmailJob(job);
      case 'social':
        return await this.processSocialJob(job);
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
}

// Rate Limit Middleware for Express
const rateLimitMiddleware = (service, operation) => {
  const limiter = new RateLimiter();
  
  return async (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const result = await limiter.checkLimit(service, operation, identifier);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt?.toISOString());
    
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter
      });
    }
    
    next();
  };
};