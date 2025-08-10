const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendEmail(to, subject, html, attachments = []) {
    try {
      const mailOptions = {
        from: `"FineAcers" <${process.env.SMTP_USER}>`,
        to: to,
        subject: subject,
        html: html,
        attachments: attachments
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error('Email send error:', error);
      throw error;
    }
  }

  async sendBulkEmails(recipients, subject, template, variables = {}) {
    const results = {
      sent: 0,
      failed: 0,
      errors: []
    };

    for (const recipient of recipients) {
      try {
        const personalizedHtml = this.personalizeTemplate(template, {
          ...variables,
          name: recipient.name,
          email: recipient.email
        });

        await this.sendEmail(recipient.email, subject, personalizedHtml);
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: recipient.email,
          error: error.message
        });
      }
    }

    return results;
  }

  personalizeTemplate(template, variables) {
    let html = template;
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, variables[key]);
    });
    
    return html;
  }

  getEmailTemplates() {
    return {
      welcome: `
        <h1>Welcome to FineAcers, {{name}}!</h1>
        <p>Thank you for your interest in our luxury properties.</p>
        <p>Your dedicated relationship manager will contact you within 24 hours.</p>
        <a href="{{ctaLink}}" style="background: #D4AF37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Properties</a>
      `,
      
      hotLead: `
        <h1>Exclusive Opportunity for You, {{name}}</h1>
        <p>Based on your interest in {{location}} properties, we have identified a perfect match for your requirements.</p>
        <ul>
          <li>Budget: {{budget}}</li>
          <li>ROI: {{roi}}% guaranteed</li>
          <li>Units remaining: {{unitsLeft}}</li>
        </ul>
        <p>This opportunity is time-sensitive. Let's discuss today.</p>
        <a href="{{meetingLink}}" style="background: #D4AF37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Schedule Call</a>
      `,
      
      nurture: `
        <h1>{{name}}, See What Other Investors Are Saying</h1>
        <p>Join 500+ successful investors who are earning passive income with FineAcers.</p>
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <p>"My investment in Goa property is giving me 18% returns!" - Rajesh M.</p>
        </div>
        <p>Limited units available. Don't miss out.</p>
        <a href="{{ctaLink}}" style="background: #D4AF37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Calculate Your Returns</a>
      `
    };
  }
}

module.exports = new EmailService();