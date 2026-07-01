const axios = require('axios');
const sharp = require('sharp');
const AWS = require('aws-sdk');
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
const connectDB = require('./config/db');

const awsConfig = {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const s3 = new AWS.S3(awsConfig);
const sqs = new AWS.SQS(awsConfig);

connectDB();

async function processMessage(message) {
  const { sku, imageUrl } = JSON.parse(message.Body);
  console.log(`\n=== 🛠️ Starting processing for SKU: ${sku} ===`);
  const startTime = Date.now();

  try {
    await Product.findOneAndUpdate({ sku }, { status: 'processing', errorReason: null });

    console.log(`Downloading image from: ${imageUrl}`);
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    
    const originalBuffer = Buffer.from(response.data);
    const originalSize = originalBuffer.length;
    
    if (originalSize === 0) {
      throw new Error('Downloaded image buffer is empty');
    }

    const originalKey = `original/${sku}.jpg`;
    await s3.putObject({
       Bucket: process.env.S3_BUCKET_NAME,
       Key: originalKey,
       Body: originalBuffer,
       ContentType: response.headers['content-type'] || 'image/jpeg'
    }).promise();
    const originalS3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalKey}`;
    console.log(`[🟢 S3] Uploaded original image to S3: original/${sku}.jpg`);

    console.log(`Processing image with Sharp (Converting to WebP & optimizing)...`);
    
    const sharpImage = sharp(originalBuffer);
    const metadata = await sharpImage.metadata().catch(err => {
      throw new Error(`Sharp failed to read image metadata: ${err.message}`);
    });

    const processedBuffer = await sharpImage
      .webp({ quality: 80 }) 
      .toBuffer()
      .catch(err => {
        throw new Error(`Sharp failed to convert image to WebP: ${err.message}`);
      });

    const processedKey = `processed/${sku}.webp`;
    await s3.putObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: processedKey,
      Body: processedBuffer,
      ContentType: 'image/webp'
    }).promise();
    const processedS3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${processedKey}`;
    console.log(`[🟢 S3] Uploaded processed image to S3: processed/${sku}.webp`);

    const processingDurationMs = Date.now() - startTime;

    await Product.findOneAndUpdate({ sku }, {
      status: 'processed',
      imageMetadata: {
        originalSizeInBytes: originalSize,
        width: metadata.width,
        height: metadata.height,
        format: 'webp',
        contentType: 'image/webp',
        processingDurationMs,
        originalS3Url,
        processedS3Url
      },
      updatedAt: new Date()
    });

    console.log(`✅ Successfully processed SKU: ${sku} (${processingDurationMs}ms)`);

    await sqs.deleteMessage({
      QueueUrl: process.env.SQS_QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle
    }).promise();

  } catch (error) {
    console.error(`❌ Error processing SKU ${sku}:`, error.message);
    
    let specificReason = 'Unknown error during processing';

    if (error.response) {
      if (error.response.status === 404) {
        specificReason = 'Image not found (404) - The image link is broken.';
      } else if (error.response.status === 403) {
        specificReason = 'Access Denied (403) - The host blocks public image downloads.';
      } else {
        specificReason = `HTTP Error (${error.response.status}) from image provider server.`;
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      specificReason = 'Invalid URL Domain - The website address does not exist.';
    } else if (error.message && error.message.includes('Sharp failed')) {
      specificReason = 'Corrupted File - The file structure is damaged or it is not a valid image.';
    } else if (error.message) {
      specificReason = error.message;
    }
    
    await Product.findOneAndUpdate({ sku }, {
      status: 'failed',
      errorReason: specificReason,
      $inc: { retryCount: 1 }, 
      updatedAt: new Date()
    });
  }
}

async function startWorker() {
  console.log('🤖 Image Processing Worker is running and polling for messages...');
  
  while (true) {
    try {
      const data = await sqs.receiveMessage({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20 
      }).promise();

      if (data.Messages && data.Messages.length > 0) {
        await processMessage(data.Messages[0]);
      }
    } catch (err) {
      console.error('Worker polling error ❌:', err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

startWorker();