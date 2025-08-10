const winston = require('winston');
const { ElasticsearchTransport } = require('winston-elasticsearch');

const esTransportOpts = {
  level: 'info',
  clientOpts: { 
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' 
  },
  index: 'fineacers-logs'
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'fineacers-backend' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transports
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    
    // Elasticsearch transport for production
    ...(process.env.NODE_ENV === 'production' 
      ? [new ElasticsearchTransport(esTransportOpts)]
      : [])
  ]
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = { logger };