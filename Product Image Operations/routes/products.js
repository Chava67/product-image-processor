const express = require('express');
const router = express.Router();
const { Readable } = require('stream');
const csv = require('csv-parser');
const Product = require('../models/Product');
const sqs = require('../config/awsSDK');  
const multer = require('multer'); 
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/import', upload.single('csvFile'), async (req, res) => {
  try {
    let csvData = '';

    if (req.file) {
      console.log(`📂 Processing uploaded CSV file: ${req.file.originalname}`);
      csvData = req.file.buffer.toString('utf-8');
    } else if (req.body.csvData) {
      console.log(`✏️ Processing pasted CSV text lines`);
      csvData = req.body.csvData;
    } else {
      return res.status(400).json({ error: 'Missing CSV data. Please provide csvData or upload a file.' });
    }

    csvData = csvData.trim();

    if (csvData.toLowerCase().startsWith('sku')) {
      const lines = csvData.split('\n');
      lines.shift(); 
      csvData = lines.join('\n').trim();
    }

    const results = [];
    
    const stream = Readable.from([csvData]);

    stream
      .pipe(csv({
        headers: ['sku', 'title', 'category', 'imageUrl'],  
        skipLines: 0
      }))
      .on('data', (data) => {
        const cleanedData = {
          sku: data.sku?.trim(),
          title: data.title?.trim(),
          category: data.category?.trim(),
          imageUrl: data.imageUrl?.trim()
        };

        if (cleanedData.sku && cleanedData.title && cleanedData.imageUrl) {
          results.push(cleanedData);
        }
      })
      .on('end', async () => {
        let importedCount = 0;
        let skippedCount = 0;

        for (const item of results) {
          const { sku, title, category, imageUrl } = item;
          let shouldQueue = false;

          const existingProduct = await Product.findOne({ sku });

          if (existingProduct) {
            if (existingProduct.imageUrl === imageUrl && existingProduct.status === 'processed') {
              skippedCount++;
              continue; 
            }

            existingProduct.title = title;
            existingProduct.category = category;
            existingProduct.imageUrl = imageUrl;
            existingProduct.status = 'queued';
            existingProduct.errorReason = null;
            await existingProduct.save();
            shouldQueue = true;
          } else {
            await Product.create({
              sku,
              title,
              category,
              imageUrl,
              status: 'queued'
            });
            shouldQueue = true;
          }

          if (shouldQueue) {
            const sqsParams = {
              QueueUrl: process.env.SQS_QUEUE_URL,
              MessageBody: JSON.stringify({ sku, imageUrl })
            };

            try {
              await sqs.sendMessage(sqsParams).promise();
              console.log(`Successfully queued SQS message for SKU: ${sku} 📥`);
            } catch (sqsError) {
              console.error(`Failed to send SQS message for SKU ${sku} ❌:`, sqsError);
              await Product.findOneAndUpdate({ sku }, { 
                status: 'failed', 
                errorReason: 'Failed to queue job in SQS' 
              });
            }
            importedCount++;
          }
        }

        res.json({
          message: 'CSV Import completed successfully',
          totalFoundInCsv: results.length,
          processedOrQueued: importedCount,
          skippedUnchanged: skippedCount
        });
      });

  } catch (error) {
    console.error('Import error ❌:', error);
    res.status(500).json({ error: 'Internal server error during import' });
  }
});
router.post('/retry/:id', async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.status = 'queued';
    product.errorReason = null;
    await product.save();

    console.log(`🔄 Reset status for SKU: ${product.sku} back to queued.`);

    const sqsParams = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ 
        sku: product.sku, 
        imageUrl: product.imageUrl 
      })
    };

    await sqs.sendMessage(sqsParams).promise();
    console.log(`📥 Successfully re-queued SQS message for SKU: ${product.sku}`);

    res.json({ 
      message: 'Product successfully rescheduled for reprocessing', 
      product 
    });

  } catch (error) {
    console.error('❌ Error executing retry:', error);
    res.status(500).json({ error: 'Internal server error during retry execution' });
  }
});

module.exports = router;