const { OpenAI } = require('openai');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { Replicate } = require('replicate');
const { StabilityAI } = require('stability-sdk');

class AIContentCreationService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    this.stability = new StabilityAI({ apiKey: process.env.STABILITY_API_KEY });
    this.initializeServices();
  }

  async initializeServices() {
    // Initialize database tables for content storage
    const query = `
      CREATE TABLE IF NOT EXISTS ai_generated_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        property_id UUID REFERENCES properties(id),
        campaign_id UUID REFERENCES campaigns(id),
        prompt TEXT NOT NULL,
        generated_content JSONB,
        media_urls JSONB,
        performance_metrics JSONB,
        generation_cost DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS content_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        template_data JSONB,
        performance_score DECIMAL(5,2),
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_ai_content_property ON ai_generated_content(property_id);
      CREATE INDEX idx_ai_content_campaign ON ai_generated_content(campaign_id);
    `;
    
    await pool.query(query);
  }

  // Generate complete marketing campaign content
  async generateCampaignContent(campaignData) {
    const { property, targetAudience, channels, tone, language } = campaignData;
    
    // Generate base marketing copy
    const marketingCopy = await this.generateMarketingCopy(property, targetAudience, tone);
    
    // Generate visuals
    const images = await this.generatePropertyImages(property, targetAudience);
    const video = await this.generatePropertyVideo(property, marketingCopy);
    
    // Generate channel-specific content
    const channelContent = {};
    for (const channel of channels) {
      channelContent[channel] = await this.optimizeForChannel(
        channel, 
        marketingCopy, 
        images, 
        video
      );
    }
    
    // Generate A/B test variants
    const variants = await this.generateABTestVariants(channelContent);
    
    return {
      marketingCopy,
      images,
      video,
      channelContent,
      variants,
      estimatedPerformance: await this.predictContentPerformance(channelContent)
    };
  }

  // Advanced marketing copy generation with GPT-4
  async generateMarketingCopy(property, targetAudience, tone) {
    const prompt = `
      Create compelling marketing copy for a luxury property with these details:
      
      Property: ${JSON.stringify(property)}
      Target Audience: ${JSON.stringify(targetAudience)}
      Tone: ${tone}
      
      Generate:
      1. Headline (max 10 words)
      2. Subheadline (max 20 words)
      3. Main description (100-150 words)
      4. 3 key selling points
      5. Call-to-action
      6. Social media captions for Instagram, Facebook, LinkedIn
      7. WhatsApp message template
      8. Email subject lines (3 variants)
      
      Focus on ROI, luxury lifestyle, and investment benefits.
      Output as JSON.
    `;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  // Generate property images using DALL-E 3
  async generatePropertyImages(property, targetAudience) {
    const imageTypes = [
      'exterior_luxury_view',
      'interior_living_space',
      'amenities_showcase',
      'lifestyle_visualization',
      'investment_infographic'
    ];

    const generatedImages = [];

    for (const imageType of imageTypes) {
      const prompt = this.buildImagePrompt(property, imageType, targetAudience);
      
      try {
        const response = await this.openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          quality: "hd",
          style: "natural"
        });

        // Process and optimize image
        const optimizedImage = await this.optimizeImage(
          response.data[0].url, 
          imageType
        );

        generatedImages.push({
          type: imageType,
          originalUrl: response.data[0].url,
          optimizedVersions: optimizedImage,
          prompt: prompt
        });
      } catch (error) {
        console.error(`Failed to generate ${imageType}:`, error);
      }
    }

    return generatedImages;
  }

  buildImagePrompt(property, imageType, targetAudience) {
    const prompts = {
      exterior_luxury_view: `
        Photorealistic luxury ${property.type} exterior in ${property.location}.
        Modern architecture with ${property.style} design elements.
        Golden hour lighting, pristine landscaping, high-end vehicles in driveway.
        Shot with professional real estate photography techniques.
        ${targetAudience.preferences?.style || ''} aesthetic.
      `,
      interior_living_space: `
        Stunning interior of luxury ${property.type} living room.
        ${property.bedrooms}-bedroom property with high-end furnishing.
        Natural lighting, ${property.view} view through floor-to-ceiling windows.
        Designer furniture, marble flooring, contemporary art pieces.
        Architectural Digest quality photography.
      `,
      amenities_showcase: `
        Luxury amenities collage for high-end ${property.type}.
        Include: infinity pool, modern gym, spa, concierge desk, rooftop lounge.
        Clean, modern layout with elegant typography overlays.
        Professional real estate marketing material style.
      `,
      lifestyle_visualization: `
        Affluent lifestyle scene at luxury ${property.type} in ${property.location}.
        Happy successful ${targetAudience.demographic} enjoying the space.
        Activities: morning coffee on balcony, yoga, entertaining guests.
        Warm, inviting atmosphere showcasing the dream lifestyle.
      `,
      investment_infographic: `
        Professional investment infographic for ${property.type} property.
        Show ROI graph trending upward, ${property.roi}% returns highlighted.
        Modern, clean design with gold and navy color scheme.
        Include comparison charts, location benefits, appreciation forecast.
        Financial Times style visualization.
      `
    };

    return prompts[imageType] || prompts.exterior_luxury_view;
  }

  // Generate property video using AI
  async generatePropertyVideo(property, marketingCopy) {
    // Using Runway Gen-2 / Sora API (when available) or Stable Video Diffusion
    const videoScenes = [
      {
        duration: 3,
        type: 'aerial_establishing',
        prompt: `Drone aerial view of luxury ${property.type} in ${property.location}`
      },
      {
        duration: 4,
        type: 'exterior_tour',
        prompt: `Smooth camera movement around ${property.type} exterior, golden hour`
      },
      {
        duration: 5,
        type: 'interior_walkthrough',
        prompt: `Elegant walkthrough of luxury interior spaces, modern design`
      },
      {
        duration: 3,
        type: 'amenities_montage',
        prompt: `Quick cuts of premium amenities: pool, gym, spa, lounge`
      },
      {
        duration: 2,
        type: 'lifestyle_scene',
        prompt: `Happy family or successful individual enjoying the property`
      },
      {
        duration: 3,
        type: 'closing_aerial',
        prompt: `Sunset aerial pullback showing property and surroundings`
      }
    ];

    const generatedScenes = [];

    for (const scene of videoScenes) {
      try {
        // Using Replicate's Stable Video Diffusion
        const output = await this.replicate.run(
          "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
          {
            input: {
              input_image: scene.prompt,
              frames_per_second: 25,
              motion_amount: 120,
              sizing_strategy: "maintain_aspect_ratio"
            }
          }
        );

        generatedScenes.push({
          ...scene,
          videoUrl: output,
          status: 'generated'
        });
      } catch (error) {
        console.error(`Failed to generate scene ${scene.type}:`, error);
        // Fallback to image slideshow
        generatedScenes.push({
          ...scene,
          fallbackImage: await this.generateSceneImage(scene.prompt),
          status: 'fallback'
        });
      }
    }

    // Compile video with voiceover
    const compiledVideo = await this.compileVideoWithVoiceover(
      generatedScenes,
      marketingCopy
    );

    return compiledVideo;
  }

  // Compile video with AI voiceover
  async compileVideoWithVoiceover(scenes, marketingCopy) {
    // Generate voiceover using ElevenLabs
    const voiceoverScript = this.createVoiceoverScript(marketingCopy);
    const audioUrl = await this.generateVoiceover(voiceoverScript);

    // Use FFmpeg to compile video
    return new Promise((resolve, reject) => {
      const outputPath = `/tmp/property_video_${Date.now()}.mp4`;
      
      const command = ffmpeg();
      
      // Add video scenes
      scenes.forEach(scene => {
        if (scene.videoUrl) {
          command.input(scene.videoUrl);
        } else if (scene.fallbackImage) {
          command.input(scene.fallbackImage)
            .loop(scene.duration);
        }
      });

      // Add voiceover
      command.input(audioUrl);

      // Add background music
      command.input('/assets/background_music.mp3')
        .audioFilters('volume=0.3');

      // Compile with transitions
      command
        .complexFilter([
          'concat=n=' + scenes.length + ':v=1:a=0[v]',
          '[1:a][2:a]amix=inputs=2:duration=first[a]'
        ])
        .outputOptions([
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-c:a', 'aac',
          '-b:a', '192k'
        ])
        .output(outputPath)
        .on('end', () => {
          resolve({
            videoPath: outputPath,
            duration: scenes.reduce((sum, s) => sum + s.duration, 0),
            scenes: scenes.length
          });
        })
        .on('error', reject)
        .run();
    });
  }

  // Generate voiceover using ElevenLabs
  async generateVoiceover(script) {
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
      {
        text: script,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    // Save audio file
    const audioPath = `/tmp/voiceover_${Date.now()}.mp3`;
    const writer = fs.createWriteStream(audioPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(audioPath));
      writer.on('error', reject);
    });
  }

  // Optimize content for different channels
  async optimizeForChannel(channel, copy, images, video) {
    const channelSpecs = {
      instagram: {
        imageSize: { width: 1080, height: 1080 },
        videoLength: 60,
        captionLength: 2200,
        hashtags: 30,
        format: ['feed', 'story', 'reel']
      },
      facebook: {
        imageSize: { width: 1200, height: 630 },
        videoLength: 240,
        captionLength: 63206,
        format: ['post', 'story', 'video']
      },
      linkedin: {
        imageSize: { width: 1200, height: 627 },
        videoLength: 600,
        captionLength: 3000,
        format: ['post', 'article']
      },
      youtube: {
        videoLength: 600,
        thumbnailSize: { width: 1280, height: 720 },
        titleLength: 100,
        descriptionLength: 5000
      },
      whatsapp: {
        imageSize: { width: 800, height: 800 },
        videoLength: 90,
        messageLength: 1024,
        format: ['message', 'status']
      }
    };

    const spec = channelSpecs[channel];
    const optimized = {
      channel,
      content: {}
    };

    // Optimize copy
    optimized.content.copy = await this.optimizeCopyForChannel(copy, spec);

    // Optimize images
    optimized.content.images = await Promise.all(
      images.map(img => this.optimizeImageForChannel(img, spec))
    );

    // Optimize video
    if (video && spec.videoLength) {
      optimized.content.video = await this.optimizeVideoForChannel(video, spec);
    }

    // Generate channel-specific variations
    optimized.variations = await this.generateChannelVariations(channel, optimized.content);

    return optimized;
  }

  // Image optimization with multiple formats
  async optimizeImage(imageUrl, purpose) {
    const image = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(image.data);

    const sizes = {
      thumbnail: { width: 150, height: 150 },
      mobile: { width: 768, height: 768 },
      desktop: { width: 1920, height: 1080 },
      social: { width: 1200, height: 630 }
    };

    const optimized = {};

    for (const [size, dimensions] of Object.entries(sizes)) {
      optimized[size] = await sharp(buffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
    }

    // Add text overlay for social media
    if (purpose.includes('social')) {
      optimized.social_with_text = await this.addTextOverlay(
        optimized.social,
        'Luxury Investment Opportunity'
      );
    }

    return optimized;
  }

  // Predict content performance using ML
  async predictContentPerformance(content) {
    // Use historical data to predict performance
    const features = this.extractContentFeatures(content);
    
    const prediction = await this.mlService.predict('content_performance', {
      features,
      historical_data: await this.getHistoricalPerformance(features)
    });

    return {
      expectedEngagement: prediction.engagement_rate,
      expectedConversion: prediction.conversion_rate,
      expectedROI: prediction.roi_percentage,
      confidence: prediction.confidence,
      recommendations: prediction.improvement_suggestions
    };
  }
}

module.exports = new AIContentCreationService();