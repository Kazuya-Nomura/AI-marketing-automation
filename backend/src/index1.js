require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { initializeDatabase } = require('./config/database');
const { initializeRedis } = require('./config/redis');
const { setupRoutes } = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');
const dataValidation = require('./middleware/validation');
const auditLogger = require('./services/auditLogger');
const circuitBreaker = require('./services/circuitBreaker');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply global validation middleware
app.use(dataValidation.validateRequest());

// Initialize services
async function startServer() {
  try {
    // Connect to databases
    await initializeDatabase();
    await initializeRedis();
    
    // Initialize audit logging
    await auditLogger.createAuditTable();
    
    // Setup routes
    setupRoutes(app);
    
    // Error handling
    app.use(errorHandler);
    
    // Circuit breaker status endpoint
    app.get('/health/circuit-breakers', (req, res) => {
      res.json(circuitBreaker.getStatus());
    });
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();