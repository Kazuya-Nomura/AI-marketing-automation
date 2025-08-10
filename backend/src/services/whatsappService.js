const axios = require('axios');
const { logger } = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL;
    this.token = process.env.WHATSAPP_TOKEN;
  }

  async sendMessage(to, message, mediaUrl = null) {
    try {
      const payload = {
        messaging_product: "whatsapp",
        to: this.formatPhoneNumber(to),
        type: mediaUrl ? "image" : "text"
      };

      if (mediaUrl) {
        payload.image = {
          link: mediaUrl,
          caption: message
        };
      } else {
        payload.text = {
          body: message
        };
      }

      const response = await axios.post(
        `${this.apiUrl}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`WhatsApp message sent to ${to}`);
      return response.data;
    } catch (error) {
      logger.error('WhatsApp send error:', error);
      throw error;
    }
  }

  async sendTemplate(to, templateName, parameters) {
    try {
      const payload = {
        messaging_product: "whatsapp",
        to: this.formatPhoneNumber(to),
        type: "template",
        template: {
          name: templateName,
          language: {
            code: "en"
          },
          components: [
            {
              type: "body",
              parameters: parameters.map(param => ({
                type: "text",
                text: param
              }))
            }
          ]
        }
      };

      const response = await axios.post(
        `${this.apiUrl}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('WhatsApp template error:', error);
      throw error;
    }
  }

  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (!cleaned.startsWith('91')) {
      cleaned = '91' + cleaned;
    }
    
    return cleaned;
  }

  async createTemplate(name, content, category = 'MARKETING') {
    try {
      const payload = {
        name: name,
        category: category,
        language: "en",
        components: [
          {
            type: "BODY",
            text: content
          }
        ]
      };

      const response = await axios.post(
        `${this.apiUrl}/message_templates`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Template creation error:', error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService();