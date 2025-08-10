const redis = require('redis');
const { logger } = require('../utils/logger');

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

client.on('error', (err) => {
  logger.error('Redis error:', err);
});

async function initializeRedis() {
  try {
    await client.connect();
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
}

module.exports = {
  client,
  initializeRedis,
};