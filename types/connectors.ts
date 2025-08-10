// Base connector interface
export interface BaseConnector {
  id: string;
  userId: string;
  type: ConnectorType;
  status: ConnectorStatus;
  credentials: EncryptedCredentials;
  metadata: ConnectorMetadata;
  createdAt: Date;
  updatedAt: Date;
}

// Connector types
export enum ConnectorType {
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  GOOGLE_DRIVE = 'google_drive',
  OPENAI = 'openai',
  ELEVENLABS = 'elevenlabs',
  STABLE_DIFFUSION = 'stable_diffusion'
}

export enum ConnectorStatus {
  PENDING = 'pending',
  CONNECTED = 'connected',
  ERROR = 'error',
  EXPIRED = 'expired'
}

// Encrypted credentials wrapper
export interface EncryptedCredentials {
  vaultPath: string;
  keyId: string;
  algorithm: 'AES-256-GCM';
  checksum: string;
  version: number;
}

// Connector metadata
export interface ConnectorMetadata {
  lastTested?: Date;
  testResults?: TestResult;
  capabilities?: string[];
  limits?: RateLimits;
  customFields?: Record<string, any>;
}

// Specific connector configurations
export interface WhatsAppConnector extends BaseConnector {
  type: ConnectorType.WHATSAPP;
  config: {
    apiUrl: string;
    phoneNumberId: string;
    businessId: string;
    webhookUrl?: string;
    templates?: WhatsAppTemplate[];
  };
}

export interface EmailConnector extends BaseConnector {
  type: ConnectorType.EMAIL;
  config: {
    provider: 'gmail' | 'outlook' | 'custom';
    imap: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
    };
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
    };
    fromAddress: string;
    signature?: string;
  };
}

export interface SocialMediaConnector extends BaseConnector {
  type: ConnectorType.FACEBOOK | ConnectorType.INSTAGRAM | ConnectorType.LINKEDIN | ConnectorType.TWITTER;
  config: {
    accessToken: string;
    refreshToken?: string;
    pageId?: string;
    accountId?: string;
    permissions: string[];
    expiresAt?: Date;
  };
}

export interface AIConnector extends BaseConnector {
  type: ConnectorType.OPENAI | ConnectorType.ELEVENLABS | ConnectorType.STABLE_DIFFUSION;
  config: {
    apiKey: string;
    organizationId?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

// Multi-channel campaign payload
export interface MultiChannelCampaignPayload {
  campaignId: string;
  userId: string;
  channels: ChannelMessage[];
  recipients: Recipient[];
  schedule?: {
    sendAt: Date;
    timezone: string;
    batchSize?: number;
    delayBetweenBatches?: number;
  };
  tracking: {
    enableClickTracking: boolean;
    enableOpenTracking: boolean;
    customUtmParams?: Record<string, string>;
  };
}

export interface ChannelMessage {
  channel: ConnectorType;
  content: {
    whatsapp?: {
      templateName: string;
      templateLanguage: string;
      templateParams?: string[];
      mediaUrl?: string;
    };
    email?: {
      subject: string;
      htmlBody: string;
      textBody?: string;
      attachments?: Attachment[];
    };
    social?: {
      text: string;
      mediaUrls?: string[];
      hashtags?: string[];
      mentions?: string[];
    };
  };
  personalization?: {
    enabled: boolean;
    fields: string[];
  };
}

export interface Recipient {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  customFields: Record<string, any>;
  channels: {
    whatsapp?: boolean;
    email?: boolean;
    facebook?: boolean;
    instagram?: boolean;
    linkedin?: boolean;
    twitter?: boolean;
  };
}