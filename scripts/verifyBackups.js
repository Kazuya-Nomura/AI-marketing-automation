const crypto = require('crypto');
const fs = require('fs').promises;

async function verifyBackup(filePath, checksumPath) {
  const fileBuffer = await fs.readFile(filePath);
  const expectedChecksum = (await fs.readFile(checksumPath, 'utf8')).split(' ')[0];
  
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  const actualChecksum = hash.digest('hex');
  
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch for ${filePath}`);
  }
  
  console.log(`✓ ${filePath} integrity verified`);
  return true;
}

// Run verification
(async () => {
  const backupDir = '/backups';
  const files = await fs.readdir(backupDir);
  
  for (const file of files) {
    if (file.endsWith('.sha256')) continue;
    
    const filePath = `${backupDir}/${file}`;
    const checksumPath = `${filePath}.sha256`;
    
    try {
      await verifyBackup(filePath, checksumPath);
    } catch (error) {
      console.error(`✗ ${file}: ${error.message}`);
      process.exit(1);
    }
  }
})();