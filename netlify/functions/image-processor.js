// netlify/functions/image-processor.js
const { execSync } = require('child_process');
const fs = require('fs');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { imageData, operation, params } = JSON.parse(event.body);
    
    // Decode base64 image
    const buffer = Buffer.from(imageData, 'base64');
    const inputPath = '/tmp/input.jpg';
    const outputPath = '/tmp/output.jpg';
    
    fs.writeFileSync(inputPath, buffer);
    
    // Build ImageMagick command
    let command = `magick "${inputPath}"`;
    
    switch (operation) {
      case 'resize':
        command += ` -resize ${params.width}x${params.height}`;
        break;
      case 'rotate':
        command += ` -rotate ${params.degrees}`;
        break;
      case 'blur':
        command += ` -blur ${params.radius}`;
        break;
      case 'remove-background':
        command += ` -background none -alpha set -channel A -evaluate set 0 +channel -fuzz 10% -transparent white -filter Lanczos -resize 400% -unsharp 0x0.75+0.75+0.008 output.webp`;
        break;
    }
    
    command += ` "${outputPath}"`;
    
    // Execute ImageMagick command
    execSync(command);
    
    // Read processed image
    const outputBuffer = fs.readFileSync(outputPath);
    const outputBase64 = outputBuffer.toString('base64');
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        imageData: outputBase64,
        contentType: 'image/jpeg'
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};