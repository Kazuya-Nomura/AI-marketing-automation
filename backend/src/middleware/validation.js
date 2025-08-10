const { PhoneNumberUtil } = require('google-libphonenumber');
const createDOMPurify = require('isomorphic-dompurify');
const { JSDOM } = require('jsdom');
const validator = require('validator');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const phoneUtil = PhoneNumberUtil.getInstance();

const dataValidationMiddleware = {
  validatePhoneNumber: (phone, countryCode = 'IN') => {
    try {
      const number = phoneUtil.parseAndKeepRawInput(phone, countryCode);
      return {
        isValid: phoneUtil.isValidNumber(number),
        formatted: phoneUtil.format(number, PhoneNumberUtil.INTERNATIONAL),
        national: phoneUtil.format(number, PhoneNumberUtil.NATIONAL),
        countryCode: number.getCountryCode()
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  },

  validateEmail: (email) => {
    return validator.isEmail(email, {
      allow_utf8_local_part: true,
      require_tld: true
    });
  },

  sanitizeInput: (data) => {
    if (typeof data === 'string') {
      // Remove HTML and scripts
      const cleaned = DOMPurify.sanitize(data, { 
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
      // Additional sanitization
      return cleaned
        .trim()
        .replace(/[<>\"']/g, '') // Remove potential XSS characters
        .substring(0, 1000); // Limit length
    }
    return data;
  },

  sanitizeObject: (obj) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = dataValidationMiddleware.sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = dataValidationMiddleware.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },

  validateRequest: (schema) => {
    return (req, res, next) => {
      // Sanitize all input data
      if (req.body) {
        req.body = dataValidationMiddleware.sanitizeObject(req.body);
      }
      if (req.query) {
        req.query = dataValidationMiddleware.sanitizeObject(req.query);
      }
      if (req.params) {
        req.params = dataValidationMiddleware.sanitizeObject(req.params);
      }

      // Validate against schema if provided
      if (schema) {
        const { error, value } = schema.validate(req.body);
        if (error) {
          return res.status(400).json({
            error: 'Validation failed',
            details: error.details.map(d => d.message)
          });
        }
        req.body = value; // Use sanitized and validated values
      }

      next();
    };
  }
};

module.exports = dataValidationMiddleware;