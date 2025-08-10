
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');

class BackupMonitor {
  constructor() {
    this.s3 = new AWS.S3();
    this.alertThresholds = {
      postgres: 6 * 60 * 60 * 1000, // 6 hours
      redis: 4 * 60 * 60 * 1000, // 4 hours
      n8n: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  async checkBackupFreshness() {
    const services = ['postgres', 'redis', 'n8n'];
    const alerts = [];

    for (const service of services) {
      const latestBackup = await this.getLatestBackup(service);
      
      if (!latestBackup) {
        alerts.push({
          service,
          severity: 'critical',
          message: `No backup found for ${service}`
        });
        continue;
      }

      const age = Date.now() - latestBackup.LastModified.getTime();
      
      if (age > this.alertThresholds[service]) {
        alerts.push({
          service,
          severity: 'warning',
          message: `${service} backup is ${Math.floor(age / 3600000)} hours old`
        });
      }
    }

    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }
  }

  async getLatestBackup(service) {
    const params = {
      Bucket: process.env.S3_BUCKET,
      Prefix: `${service}/`,
      MaxKeys: 1
    };

    const result = await this.s3.listObjectsV2(params).promise();
    return result.Contents?.[0];
  }

  async sendAlerts(alerts) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const html = `
      <h2>Backup Alert</h2>
      <ul>
        ${alerts.map(alert => 
          `<li><strong>${alert.severity.toUpperCase()}:</strong> ${alert.message}</li>`
        ).join('')}
      </ul>
      <p>Please check the backup system immediately.</p>
    `;

    await transporter.sendMail({
      from: process.env.ALERT_FROM_EMAIL,
      to: process.env.ALERT_TO_EMAIL,
      subject: 'FINEACERS Backup Alert',
      html
    });
  }
}

// Run monitor
const monitor = new BackupMonitor();
setInterval(() => monitor.checkBackupFreshness(), 3600000); // Check every hour