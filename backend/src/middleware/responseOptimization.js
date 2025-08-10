const compression = require('compression');
const etag = require('etag');

class ResponseOptimizer {
  constructor() {
    this.etagCache = new Map();
  }

  // Compression middleware
  compressionMiddleware() {
    return compression({
      filter: (req, res) => {
        // Don't compress responses with this header
        if (req.headers['x-no-compression']) {
          return false;
        }
        
        // Compress JSON and text responses
        return compression.filter(req, res);
      },
      level: 6, // Balance between speed and compression
      threshold: 1024 // Only compress responses larger than 1KB
    });
  }

  // ETag support for caching
  etagMiddleware() {
    return (req, res, next) => {
      const originalJson = res.json;
      
      res.json = function(data) {
        const body = JSON.stringify(data);
        const tag = etag(body);
        
        res.set('ETag', tag);
        
        // Check if client has valid cached version
        if (req.headers['if-none-match'] === tag) {
          return res.status(304).end();
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    };
  }

  // Response pagination wrapper
  paginationWrapper() {
    return (req, res, next) => {
      res.paginate = function(data, total, page, limit) {
        const totalPages = Math.ceil(total / limit);
        
        const response = {
          data,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          links: {
            self: `${req.baseUrl}${req.path}?page=${page}&limit=${limit}`,
            first: `${req.baseUrl}${req.path}?page=1&limit=${limit}`,
            last: `${req.baseUrl}${req.path}?page=${totalPages}&limit=${limit}`
          }
        };

        if (response.pagination.hasNext) {
          response.links.next = `${req.baseUrl}${req.path}?page=${page + 1}&limit=${limit}`;
        }

        if (response.pagination.hasPrev) {
          response.links.prev = `${req.baseUrl}${req.path}?page=${page - 1}&limit=${limit}`;
        }

        return res.json(response);
      };
      
      next();
    };
  }

  // Field filtering middleware
  fieldFilteringMiddleware() {
    return (req, res, next) => {
      res.filterFields = function(data, allowedFields = null) {
        const fields = req.query.fields?.split(',') || allowedFields;
        
        if (!fields || fields.length === 0) {
          return data;
        }

        if (Array.isArray(data)) {
          return data.map(item => this.filterObjectFields(item, fields));
        }
        
        return this.filterObjectFields(data, fields);
      };
      
      next();
    };
  }

  filterObjectFields(obj, fields) {
    const filtered = {};
    
    fields.forEach(field => {
      if (field.includes('.')) {
        // Handle nested fields
        const [parent, child] = field.split('.');
        if (!filtered[parent]) filtered[parent] = {};
        if (obj[parent] && obj[parent][child] !== undefined) {
          filtered[parent][child] = obj[parent][child];
        }
      } else if (obj[field] !== undefined) {
        filtered[field] = obj[field];
      }
    });
    
    return filtered;
  }

  // Response time header
  responseTimeMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        res.set('X-Response-Time', `${duration}ms`);
        
        // Log slow responses
        if (duration > 1000) {
          logger.warn(`Slow response: ${req.method} ${req.path} took ${duration}ms`);
        }
      });
      
      next();
    };
  }

  // API versioning through headers
  versioningMiddleware() {
    return (req, res, next) => {
      const requestedVersion = req.headers['api-version'] || 'v1';
      const supportedVersions = ['v1', 'v2'];
      
      if (!supportedVersions.includes(requestedVersion)) {
        return res.status(400).json({
          error: 'Unsupported API version',
          supported: supportedVersions
        });
      }
      
      req.apiVersion = requestedVersion;
      res.set('API-Version', requestedVersion);
      
      next();
    };
  }
}

module.exports = new ResponseOptimizer();