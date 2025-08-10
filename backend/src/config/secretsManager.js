const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const AWS = require('aws-sdk');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

class SecretsManager {
  constructor() {
    this.provider = process.env.SECRETS_PROVIDER || 'local';
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.initializeProvider();
  }

  initializeProvider() {
    switch (this.provider) {
      case 'gcp':
        this.client = new SecretManagerServiceClient();
        this.projectId = process.env.GCP_PROJECT_ID;
        break;
      
      case 'aws':
        this.client = new AWS.SecretsManager({
          region: process.env.AWS_REGION || 'us-east-1'
        });
        break;
      
      case 'hashicorp':
        this.initializeVault();
        break;
      
      default:
        logger.info('Using local environment variables for secrets');
    }
  }

  async initializeVault() {
    const vault = require('node-vault')({
      endpoint: process.env.VAULT_ADDR,
      token: process.env.VAULT_TOKEN
    });
    
    this.client = vault;
  }

  async getSecret(secretName) {
    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    let secretValue;

    switch (this.provider) {
      case 'gcp':
        secretValue = await this.getGCPSecret(secretName);
        break;
      
      case 'aws':
        secretValue = await this.getAWSSecret(secretName);
        break;
      
      case 'hashicorp':
        secretValue = await this.getVaultSecret(secretName);
        break;
      
      default:
        secretValue = process.env[secretName];
    }

    // Cache the secret
    this.cache.set(secretName, {
      value: secretValue,
      expiry: Date.now() + this.cacheTimeout
    });

    return secretValue;
  }

  async getGCPSecret(secretName) {
    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });
      const payload = version.payload.data.toString('utf8');
      return payload;
    } catch (error) {
      logger.error(`Failed to get GCP secret ${secretName}:`, error);
      throw error;
    }
  }

  async getAWSSecret(secretName) {
    try {
      const data = await this.client.getSecretValue({ SecretId: secretName }).promise();
      if ('SecretString' in data) {
        return data.SecretString;
      } else {
        const buff = Buffer.from(data.SecretBinary, 'base64');
        return buff.toString('ascii');
      }
    } catch (error) {
      logger.error(`Failed to get AWS secret ${secretName}:`, error);
      throw error;
    }
  }

  async getVaultSecret(secretName) {
    try {
      const result = await this.client.read(`secret/data/${secretName}`);
      return result.data.data;
    } catch (error) {
      logger.error(`Failed to get Vault secret ${secretName}:`, error);
      throw error;
    }
  }

  async setSecret(secretName, secretValue) {
    switch (this.provider) {
      case 'gcp':
        await this.setGCPSecret(secretName, secretValue);
        break;
      
      case 'aws':
        await this.setAWSSecret(secretName, secretValue);
        break;
      
      case 'hashicorp':
        await this.setVaultSecret(secretName, secretValue);
        break;
      
      default:
        process.env[secretName] = secretValue;
    }

    // Clear cache
    this.cache.delete(secretName);
  }

  async setGCPSecret(secretName, secretValue) {
    try {
      const parent = `projects/${this.projectId}`;
      
      // Create secret if it doesn't exist
      try {
        await this.client.createSecret({
          parent,
          secretId: secretName,
          secret: {
            replication: {
              automatic: {}
            }
          }
        });
      } catch (error) {
        // Secret might already exist
      }

      // Add secret version
      await this.client.addSecretVersion({
        parent: `${parent}/secrets/${secretName}`,
        payload: {
          data: Buffer.from(secretValue, 'utf8')
        }
      });
    } catch (error) {
      logger.error(`Failed to set GCP secret ${secretName}:`, error);
      throw error;
    }
  }

  async setAWSSecret(secretName, secretValue) {
    try {
      await this.client.putSecretValue({
        SecretId: secretName,
        SecretString: secretValue
      }).promise();
    } catch (error) {
      logger.error(`Failed to set AWS secret ${secretName}:`, error);
      throw error;
    }
  }

  async setVaultSecret(secretName, secretValue) {
    try {
      await this.client.write(`secret/data/${secretName}`, {
        data: { value: secretValue }
      });
    } catch (error) {
      logger.error(`Failed to set Vault secret ${secretName}:`, error);
      throw error;
    }
  }

  // Rotate API keys
  async rotateApiKeys() {
    const keysToRotate = [
      'OPENAI_API_KEY',
      'CLAUDE_API_KEY',
      'WHATSAPP_TOKEN',
      'FACEBOOK_APP_SECRET',
      'JWT_SECRET'
    ];

    const rotationResults = [];

    for (const keyName of keysToRotate) {
      try {
        const newKey = await this.generateNewKey(keyName);
        await this.setSecret(keyName, newKey);
        
        // Update application configuration
        await this.updateApplicationConfig(keyName, newKey);
        
        rotationResults.push({
          key: keyName,
          status: 'success',
          rotatedAt: new Date()
        });

        logger.info(`Successfully rotated ${keyName}`);
      } catch (error) {
        logger.error(`Failed to rotate ${keyName}:`, error);
        rotationResults.push({
          key: keyName,
          status: 'failed',
          error: error.message
        });
      }
    }

    return rotationResults;
  }

  async generateNewKey(keyName) {
    switch (keyName) {
      case 'JWT_SECRET':
        return crypto.randomBytes(64).toString('hex');
      
      case 'ENCRYPTION_KEY':
        return crypto.randomBytes(32).toString('hex');
      
      default:
        // For API keys, you would typically call the service's API
        // to generate a new key
        throw new Error(`Auto-rotation not implemented for ${keyName}`);
    }
  }

  async updateApplicationConfig(keyName, newValue) {
    // Update the application's runtime configuration
    process.env[keyName] = newValue;
    
    // If using a configuration service, update it
    // await configService.update(keyName, newValue);
    
    // Trigger application restart if needed
    // await applicationManager.gracefulRestart();
  }

  // Get all secrets for a service
  async getServiceSecrets(serviceName) {
    const secrets = {};
    const secretKeys = this.getServiceSecretKeys(serviceName);
    
    for (const key of secretKeys) {
      secrets[key] = await this.getSecret(key);
    }
    
    return secrets;
  }

  getServiceSecretKeys(serviceName) {
    const serviceSecrets = {
      backend: [
        'DB_PASSWORD',
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'REDIS_PASSWORD'
      ],
      ai: [
        'OPENAI_API_KEY',
        'CLAUDE_API_KEY'
      ],
      messaging: [
        'WHATSAPP_TOKEN',
        'SMTP_PASS',
        'TWILIO_AUTH_TOKEN'
      ],
      social: [
        'FACEBOOK_APP_SECRET',
        'INSTAGRAM_ACCESS_TOKEN',
        'LINKEDIN_CLIENT_SECRET'
      ]
    };
    
    return serviceSecrets[serviceName] || [];
  }

  // Validate all secrets are present
  async validateSecrets() {
    const requiredSecrets = [
      'DB_PASSWORD',
      'JWT_SECRET',
      'OPENAI_API_KEY',
      'WHATSAPP_TOKEN'
    ];
    
    const missing = [];
    
    for (const secret of requiredSecrets) {
      try {
        const value = await this.getSecret(secret);
        if (!value) {
          missing.push(secret);
        }
      } catch (error) {
        missing.push(secret);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    }
    
    return true;
  }
}

// Singleton instance
module.exports = new SecretsManager();