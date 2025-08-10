const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'API rate limit exceeded.'
});

// Auth rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.'
});

module.exports = {
  setupSecurity: (app) => {
    // Helmet for security headers
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // Data sanitization against NoSQL query injection
    app.use(mongoSanitize());

    // Data sanitization against XSS
    app.use(xss());

    // Apply rate limiting
    app.use('/api/', apiLimiter);
    app.use('/api/auth/', authLimiter);
    
    // Prevent parameter pollution
    app.use((req, res, next) => {
      // Remove duplicate parameters
      Object.keys(req.query).forEach(key => {
        if (Array.isArray(req.query[key])) {
          req.query[key] = req.query[key][req.query[key].length - 1];
        }
      });
      next();
    });
  },
  
  limiter,
  apiLimiter,
  authLimiter
};