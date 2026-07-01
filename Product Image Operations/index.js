require('dotenv').config();
const axios = require('axios');
const sharp = require('sharp');
const AWS = require('aws-sdk');
const mongoose = require('mongoose');

const Product = require('./models/Product');
const connectDB = require('./config/db');

const awsConfig = {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const s3 = new AWS.S3(awsConfig);

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;
  await connectDB();
  isConnected = true;
}


exports.handler = async (event) => {
  console.log(`🤖 Lambda Worker triggered with ${event.Records.length} messages.`);
  
  await connectMongo();

  for (const record of event.Records) {
    const { sku, imageUrl } = JSON.parse(record.body);
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

  return { status: 'success' };
};
if (!process.env.LAMBDA_TASK_ROOT) {
  const sqsClient = new AWS.SQS(awsConfig);
  const queueUrl = process.env.SQS_QUEUE_URL;

  const startLocalWorkerPolling = async () => {
    console.log("\n==================================================");
    console.log("🔍 Local Lambda Worker is listening to AWS SQS... 🚀");
    console.log(`📡 Connected to queue: ${queueUrl}`);
    console.log("==================================================\n");

    while (true) {
      try {
        const data = await sqsClient.receiveMessage({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 10
        }).promise();

        if (data.Messages && data.Messages.length > 0) {
          const message = data.Messages[0];
          console.log(`📥 [SQS] Found a new message. Sending to Handler...`);

          const simulatedLambdaEvent = {
            Records: [{
              body: message.Body,
              messageId: message.MessageId,
              receiptHandle: message.ReceiptHandle
            }]
          };

          // הפעלת ה-handler שמוגדר למעלה
          await exports.handler(simulatedLambdaEvent);

          await sqsClient.deleteMessage({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle
          }).promise();
          
          console.log("🗑️ [SQS] Message deleted from queue successfully.");
        }
      } catch (error) {
        console.error("❌ Error in local worker loop:", error.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };

  // הפעלת הפונקציה רק אחרי שהיא כבר הוגדרה במלואה
  if (queueUrl) {
    startLocalWorkerPolling();
  } else {
    console.error("❌ Error: SQS_QUEUE_URL is missing from .env!");
  }
}