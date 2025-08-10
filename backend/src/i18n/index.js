const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class I18nService {
  constructor() {
    this.translations = {};
    this.supportedLanguages = ['en', 'hi', 'ar', 'fr', 'es'];
    this.defaultLanguage = 'en';
    this.loadTranslations();
  }

  async loadTranslations() {
    for (const lang of this.supportedLanguages) {
      try {
        const filePath = path.join(__dirname, 'locales', `${lang}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        this.translations[lang] = JSON.parse(content);
        logger.info(`Loaded translations for ${lang}`);
      } catch (error) {
        logger.error(`Failed to load translations for ${lang}:`, error);
        this.translations[lang] = {};
      }
    }
  }

  translate(key, language = this.defaultLanguage, variables = {}) {
    const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;
    const translation = this.getNestedProperty(this.translations[lang], key) || 
                       this.getNestedProperty(this.translations[this.defaultLanguage], key) ||
                       key;

    return this.interpolate(translation, variables);
  }

  getNestedProperty(obj, key) {
    return key.split('.').reduce((o, k) => o?.[k], obj);
  }

  interpolate(template, variables) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  // Message templates for different channels
  getMessageTemplate(channel, type, language, variables) {
    const templates = {
      whatsapp: {
        welcome: {
          en: "Hello {{name}}! 👋 Welcome to FineAcers. Your journey to luxury property investment starts here. How can I help you today?",
          hi: "नमस्ते {{name}}! 👋 FineAcers में आपका स्वागत है। लक्जरी प्रॉपर्टी निवेश की आपकी यात्रा यहां से शुरू होती है। मैं आज आपकी कैसे मदद कर सकता हूं?",
          ar: "مرحباً {{name}}! 👋 مرحباً بك في FineAcers. رحلتك في الاستثمار العقاري الفاخر تبدأ من هنا. كيف يمكنني مساعدتك اليوم؟"
        },
        propertyAlert: {
          en: "🏠 New property matching your interest in {{location}}! ROI: {{roi}}% | Price: {{price}}. Interested?",
          hi: "🏠 {{location}} में आपकी रुचि से मेल खाती नई संपत्ति! ROI: {{roi}}% | कीमत: {{price}}। क्या आप रुचि रखते हैं?",
          ar: "🏠 عقار جديد يطابق اهتمامك في {{location}}! العائد: {{roi}}% | السعر: {{price}}. هل أنت مهتم؟"
        }
      },
      email: {
        subject: {
          welcome: {
            en: "Welcome to FineAcers - Your Luxury Property Investment Partner",
            hi: "FineAcers में आपका स्वागत है - आपका लक्जरी प्रॉपर्टी निवेश साथी",
            ar: "مرحباً بك في FineAcers - شريكك في الاستثمار العقاري الفاخر"
          }
        }
      }
    };

    const template = templates[channel]?.[type]?.[language] || templates[channel]?.[type]?.['en'];
    return this.interpolate(template, variables);
  }

  // Database content translation
  async translateContent(content, fromLang, toLang) {
    // For production, integrate with translation API (Google Translate, DeepL, etc.)
    // This is a placeholder implementation
    try {
      if (fromLang === toLang) return content;
      
      // In production, call translation API
      // const translated = await translationAPI.translate(content, fromLang, toLang);
      
      // For now, return with language marker
      return `[${toLang}] ${content}`;
    } catch (error) {
      logger.error('Translation failed:', error);
      return content;
    }
  }

  // Get user's preferred language
  async getUserLanguage(userId) {
    const { pool } = require('../config/database');
    const query = 'SELECT preferred_language FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0]?.preferred_language || this.defaultLanguage;
  }

  // Update user's language preference
  async setUserLanguage(userId, language) {
    if (!this.supportedLanguages.includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const { pool } = require('../config/database');
    await pool.query(
      'UPDATE users SET preferred_language = $1 WHERE id = $2',
      [language, userId]
    );
  }

  // Middleware for API responses
  i18nMiddleware() {
    return async (req, res, next) => {
      // Get language from header, query, or user preference
      const headerLang = req.headers['accept-language']?.split(',')[0]?.split('-')[0];
      const queryLang = req.query.lang;
      const userLang = req.user ? await this.getUserLanguage(req.user.id) : null;
      
      req.language = queryLang || userLang || headerLang || this.defaultLanguage;
      req.t = (key, variables) => this.translate(key, req.language, variables);
      
      // Add translation helper to response
      res.t = req.t;
      
      next();
    };
  }
}

module.exports = new I18nService();