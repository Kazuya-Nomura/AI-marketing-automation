const EventEmitter = require('events');
const { logger } = require('../utils/logger');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.options = {
      timeout: options.timeout || 60000,
      errorThreshold: options.errorThreshold || 5,
      successThreshold: options.successThreshold || 2,
      resetTimeout: options.resetTimeout || 60000,
      monitorInterval: options.monitorInterval || 30000
    };
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await Promise.race([
        operation(),
        this.timeout(this.options.timeout)
      ]);
      return this.onSuccess(result);
    } catch (error) {
      return this.onFailure(error);
    }
  }

  onSuccess(result) {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = 'CLOSED';
        this.emit('state-change', 'CLOSED');
      }
    }
    return result;
  }

  onFailure(error) {
    this.failures++;
    if (this.failures >= this.options.errorThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      this.emit('state-change', 'OPEN');
    }
    throw error;
  }

  timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), ms);
    });
  }
}

class UniversalCircuitBreaker {
  constructor() {
    this.breakers = new Map();
    this.defaultConfig = {
      timeout: 60000,
      errorThreshold: 5,
      successThreshold: 2,
      resetTimeout: 60000,
      monitorInterval: 30000
    };
    this.startMonitoring();
  }

  getBreaker(serviceName, config = {}) {
    if (!this.breakers.has(serviceName)) {
      const breaker = new CircuitBreaker({
        ...this.defaultConfig,
        ...config
      });
      breaker.name = serviceName;
      
      // Log state changes
      breaker.on('state-change', (state) => {
        logger.warn(`Circuit breaker for ${serviceName} changed to ${state}`);
      });
      
      this.breakers.set(serviceName, breaker);
    }
    return this.breakers.get(serviceName);
  }

  async executeWithBreaker(serviceName, operation, config = {}) {
    const breaker = this.getBreaker(serviceName, config);
    return await breaker.execute(operation);
  }

  getStatus() {
    const status = {};
    this.breakers.forEach((breaker, name) => {
      status[name] = {
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes,
        lastFailure: breaker.lastFailure
      };
    });
    return status;
  }

  startMonitoring() {
    setInterval(() => {
      const status = this.getStatus();
      logger.info('Circuit Breaker Status:', status);
    }, this.defaultConfig.monitorInterval);
  }
}

module.exports = new UniversalCircuitBreaker();