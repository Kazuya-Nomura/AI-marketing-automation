const axios = require('axios');
const { logger } = require('../utils/logger');

class SocialMediaService {
  constructor() {
    this.facebook = {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      pageAccessToken: process.env.FACEBOOK_PAGE_TOKEN
    };
    
    this.instagram = {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      businessAccountId: process.env.INSTAGRAM_BUSINESS_ID
    };
    
    this.linkedin = {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN
    };
  }

  async postToFacebook(message, imageUrl = null) {
    try {
      const endpoint = `https://graph.facebook.com/v17.0/me/feed`;
      
      const params = {
        message: message,
        access_token: this.facebook.pageAccessToken
      };
      
      if (imageUrl) {
        params.link = imageUrl;
      }
      
      const response = await axios.post(endpoint, params);
      logger.info('Posted to Facebook:', response.data.id);
      return response.data;
    } catch (error) {
      logger.error('Facebook post error:', error);
      throw error;
    }
  }

  async postToInstagram(imageUrl, caption) {
    try {
      // Step 1: Create media object
      const createMediaEndpoint = `https://graph.facebook.com/v17.0/${this.instagram.businessAccountId}/media`;
      
      const mediaResponse = await axios.post(createMediaEndpoint, {
        image_url: imageUrl,
        caption: caption,
        access_token: this.instagram.accessToken
      });
      
      const creationId = mediaResponse.data.id;
      
      // Step 2: Publish media
      const publishEndpoint = `https://graph.facebook.com/v17.0/${this.instagram.businessAccountId}/media_publish`;
      
      const publishResponse = await axios.post(publishEndpoint, {
        creation_id: creationId,
        access_token: this.instagram.accessToken
      });
      
      logger.info('Posted to Instagram:', publishResponse.data.id);
      return publishResponse.data;
    } catch (error) {
      logger.error('Instagram post error:', error);
      throw error;
    }
  }

  async postToLinkedIn(text, imageUrl = null) {
    try {
      const endpoint = 'https://api.linkedin.com/v2/ugcPosts';
      
      const payload = {
        author: `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: imageUrl ? "IMAGE" : "NONE"
          }
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
      };
      
      if (imageUrl) {
        // Upload image first
        const mediaUpload = await this.uploadLinkedInImage(imageUrl);
        payload.specificContent["com.linkedin.ugc.ShareContent"].media = [{
          status: "READY",
          description: {
            text: "Property Investment Opportunity"
          },
          media: mediaUpload.asset
        }];
      }
      
      const response = await axios.post(endpoint, payload, {
        headers: {
          'Authorization': `Bearer ${this.linkedin.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      logger.info('Posted to LinkedIn:', response.data.id);
      return response.data;
    } catch (error) {
      logger.error('LinkedIn post error:', error);
      throw error;
    }
  }

  async schedulePost(platform, content, scheduledTime) {
    // Store in database for cron job to process
    const query = `
      INSERT INTO scheduled_posts (platform, content, scheduled_time, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING id
    `;
    
    const result = await db.query(query, [platform, JSON.stringify(content), scheduledTime]);
    return result.rows[0];
  }

  async postToAllPlatforms(content) {
    const results = {
      facebook: null,
      instagram: null,
      linkedin: null,
      errors: []
    };
    
    // Post to Facebook
    try {
      results.facebook = await this.postToFacebook(content.message, content.imageUrl);
    } catch (error) {
      results.errors.push({ platform: 'facebook', error: error.message });
    }
    
    // Post to Instagram (requires image)
    if (content.imageUrl) {
      try {
        results.instagram = await this.postToInstagram(content.imageUrl, content.message);
      } catch (error) {
        results.errors.push({ platform: 'instagram', error: error.message });
      }
    }
    
    // Post to LinkedIn
    try {
      results.linkedin = await this.postToLinkedIn(content.message, content.imageUrl);
    } catch (error) {
      results.errors.push({ platform: 'linkedin', error: error.message });
    }
    
    return results;
  }
}

module.exports = new SocialMediaService();