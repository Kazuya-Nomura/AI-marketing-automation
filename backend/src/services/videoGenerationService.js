const { createCanvas, loadImage } = require('canvas');
const { S3 } = require('aws-sdk');
const Bull = require('bull');

class VideoGenerationService {
  constructor() {
    this.s3 = new S3();
    this.videoQueue = new Bull('video-generation', {
      redis: process.env.REDIS_URL
    });
    this.setupVideoProcessing();
  }

  setupVideoProcessing() {
    this.videoQueue.process(5, async (job) => {
      const { property, style, duration } = job.data;
      
      try {
        // Generate video based on style
        let video;
        switch (style) {
          case 'cinematic':
            video = await this.generateCinematicVideo(property);
            break;
          case 'social_media':
            video = await this.generateSocialMediaVideo(property);
            break;
          case 'virtual_tour':
            video = await this.generateVirtualTour(property);
            break;
          default:
            video = await this.generateStandardVideo(property);
        }

        // Upload to S3
        const videoUrl = await this.uploadVideo(video);
        
        // Update job progress
        await job.progress(100);
        
        return { videoUrl, duration: video.duration };
      } catch (error) {
        console.error('Video generation failed:', error);
        throw error;
      }
    });
  }

  // Generate cinematic property video
  async generateCinematicVideo(property) {
    const storyboard = [
      {
        scene: 'aerial_approach',
        duration: 5,
        transition: 'fade',
        music: 'epic_orchestral',
        text: null
      },
      {
        scene: 'entrance',
        duration: 3,
        transition: 'smooth_cut',
        text: property.name,
        textAnimation: 'fade_in'
      },
      {
        scene: 'interior_tour',
        duration: 15,
        shots: ['living_room', 'kitchen', 'master_bedroom', 'bathroom'],
        transition: 'dolly',
        text: 'Luxury Redefined'
      },
      {
        scene: 'amenities',
        duration: 8,
        shots: ['pool', 'gym', 'spa', 'concierge'],
        transition: 'montage',
        text: 'World-Class Amenities'
      },
      {
        scene: 'lifestyle',
        duration: 7,
        mood: 'aspirational',
        text: 'Your Dream Lifestyle Awaits'
      },
      {
        scene: 'investment_graphics',
        duration: 5,
        data: {
          roi: property.roi_percentage,
          appreciation: property.appreciation_rate,
          comparison: property.market_comparison
        },
        style: 'modern_infographic'
      },
      {
        scene: 'closing',
        duration: 3,
        logo: true,
        cta: 'Schedule Your Private Tour',
        contact: property.contact_info
      }
    ];

    // Generate each scene
    const scenes = await Promise.all(
      storyboard.map(scene => this.generateScene(scene, property))
    );

    // Compile with transitions
    return await this.compileScenes(scenes, {
      music: '/assets/cinematic_music.mp3',
      colorGrading: 'luxury_warm',
      aspectRatio: '16:9',
      quality: 'high'
    });
  }

  // Generate scene using AI
  async generateScene(sceneConfig, property) {
    const { scene, duration, shots } = sceneConfig;
    
    if (scene === 'investment_graphics') {
      return await this.generateDataVisualization(sceneConfig.data, duration);
    }

    // Generate using Stable Video Diffusion or Sora
    const prompt = this.buildScenePrompt(scene, property, sceneConfig);
    
    try {
      // Try Sora API first (when available)
      if (process.env.SORA_API_KEY) {
        return await this.generateWithSora(prompt, duration);
      }
      
      // Fallback to Stable Video Diffusion
      return await this.generateWithStableVideo(prompt, duration);
    } catch (error) {
      // Final fallback: Ken Burns effect on images
      return await this.generateKenBurnsVideo(scene, property, duration);
    }
  }

  // Generate with OpenAI Sora (future implementation)
  async generateWithSora(prompt, duration) {
    // Sora API implementation
    // This is a placeholder for when Sora API becomes available
    const response = await axios.post('https://api.openai.com/v1/video/generate', {
      prompt: prompt,
      duration: duration,
      quality: 'hd',
      style: 'photorealistic'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.SORA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.video_url;
  }

  // Animated data visualization for ROI
  async generateDataVisualization(data, duration) {
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');
    
    // Create animated chart
    const frames = [];
    const fps = 30;
    const totalFrames = duration * fps;

    for (let frame = 0; frame < totalFrames; frame++) {
      // Clear canvas
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 1920, 1080);

      // Animate ROI graph
      this.drawROIAnimation(ctx, data, frame / totalFrames);

      // Capture frame
      frames.push(canvas.toBuffer());
    }

    // Compile frames to video
    return await this.compileFramesToVideo(frames, fps);
  }

  drawROIAnimation(ctx, data, progress) {
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Investment Returns Analysis', 960, 100);

    // ROI Chart
    const chartX = 200;
    const chartY = 200;
    const chartWidth = 1520;
    const chartHeight = 600;

    // Draw axes
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.stroke();

    // Animate ROI line
    const years = 10;
    const roiData = this.calculateROIProjection(data.roi, years);
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 4;
    ctx.beginPath();

    for (let i = 0; i <= years * progress; i += 0.1) {
      const x = chartX + (i / years) * chartWidth;
      const y = chartY + chartHeight - (roiData[Math.floor(i)] / 200) * chartHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Animated value display
    const currentROI = roiData[Math.floor(years * progress)] || 0;
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 72px Arial';
    ctx.fillText(`${currentROI.toFixed(1)}% ROI`, 960, 950);
  }

  calculateROIProjection(baseROI, years) {
    const projection = [0];
    for (let i = 1; i <= years; i++) {
      projection.push(baseROI * i + (Math.random() * 5 - 2.5));
    }
    return projection;
  }

  // Ken Burns effect for image slideshow
  async generateKenBurnsVideo(scene, property, duration) {
    const images = await this.getSceneImages(scene, property);
    const fps = 30;
    const frames = [];
    const totalFrames = duration * fps;
    const framesPerImage = Math.floor(totalFrames / images.length);

    for (let i = 0; i < images.length; i++) {
      const image = await loadImage(images[i]);
      
      for (let frame = 0; frame < framesPerImage; frame++) {
        const canvas = createCanvas(1920, 1080);
        const ctx = canvas.getContext('2d');
        
        // Calculate zoom and pan
        const progress = frame / framesPerImage;
        const zoom = 1 + (progress * 0.2); // 20% zoom
        const panX = Math.sin(progress * Math.PI) * 50;
        const panY = Math.cos(progress * Math.PI) * 30;
        
        // Apply transformation
        ctx.save();
        ctx.translate(960 + panX, 540 + panY);
        ctx.scale(zoom, zoom);
        ctx.translate(-960, -540);
        
        // Draw image
        ctx.drawImage(image, 0, 0, 1920, 1080);
        ctx.restore();
        
        frames.push(canvas.toBuffer());
      }
    }

    return await this.compileFramesToVideo(frames, fps);
  }
}

module.exports = new VideoGenerationService();