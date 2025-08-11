// netlify/functions/cloudinary-processor.js
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const { 
      imageData, 
      operation, 
      params = {},
      returnUrl = false,
      format = 'jpg',
      quality = 'auto'
    } = requestBody;

    // Validate required fields
    if (!imageData || !operation) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields: imageData and operation' 
        })
      };
    }

    // Build transformation object based on operation
    let transformation = {};
    
    switch (operation) {
      case 'resize':
        transformation = {
          width: params.width || 800,
          height: params.height || 600,
          crop: params.crop || 'fill'
        };
        break;
        
      case 'crop':
        transformation = {
          width: params.width,
          height: params.height,
          x: params.x || 0,
          y: params.y || 0,
          crop: 'crop'
        };
        break;
        
      case 'rotate':
        transformation = {
          angle: params.degrees || 0
        };
        break;
        
      case 'filter':
        const effects = [];
        if (params.grayscale) effects.push('grayscale');
        if (params.sepia) effects.push('sepia');
        if (params.blur) effects.push(`blur:${params.blur}`);
        if (params.brightness) effects.push(`brightness:${params.brightness}`);
        if (params.contrast) effects.push(`contrast:${params.contrast}`);
        
        transformation = {
          effect: effects.join(',') || 'grayscale'
        };
        break;
        
      case 'watermark':
        transformation = {
          overlay: params.watermarkText || 'Sample Watermark',
          gravity: params.position || 'south_east',
          opacity: params.opacity || 60,
          color: params.color || 'white'
        };
        break;
        
      case 'background_removal':
        transformation = {
          background: 'remove'
        };
        break;
        
      case 'auto_enhance':
        transformation = {
          effect: 'auto_color',
          improve: 'auto'
        };
        break;
        
      case 'format_conversion':
        // Format handled separately in upload options
        break;
        
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: `Unsupported operation: ${operation}` 
          })
        };
    }

    // Add format and quality to transformation
    transformation.format = format;
    transformation.quality = quality;

    // Upload image to Cloudinary with transformations
    const uploadOptions = {
      folder: 'retool-processed',
      resource_type: 'image',
      transformation: [transformation],
      use_filename: false,
      unique_filename: true
    };

    // Handle different input formats
    let uploadData;
    if (imageData.startsWith('data:')) {
      // Data URL format
      uploadData = imageData;
    } else {
      // Base64 string
      uploadData = `data:image/jpeg;base64,${imageData}`;
    }

    const uploadResult = await cloudinary.uploader.upload(uploadData, uploadOptions);

    // Generate additional transformation URLs if needed
    const variations = {};
    if (params.generateThumbnail) {
      variations.thumbnail = cloudinary.url(uploadResult.public_id, {
        width: 150,
        height: 150,
        crop: 'fill',
        format: format,
        quality: 'auto'
      });
    }

    if (params.generateWebP) {
      variations.webp = cloudinary.url(uploadResult.public_id, {
        ...transformation,
        format: 'webp'
      });
    }

    // Prepare response
    const response = {
      success: true,
      originalUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      size: uploadResult.bytes,
      variations: variations
    };

    // Return processed image as base64 if requested
    if (!returnUrl) {
      try {
        const processedImageResponse = await fetch(uploadResult.secure_url);
        const processedImageBuffer = await processedImageResponse.arrayBuffer();
        const processedImageBase64 = Buffer.from(processedImageBuffer).toString('base64');
        response.imageData = processedImageBase64;
      } catch (fetchError) {
        console.warn('Failed to fetch processed image:', fetchError);
        response.warning = 'Could not return base64 data, URL provided instead';
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Cloudinary processing error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Image processing failed',
        details: error.message,
        code: error.http_code || 'UNKNOWN'
      })
    };
  }
};