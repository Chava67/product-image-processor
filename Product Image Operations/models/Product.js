const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  imageUrl: { type: String, required: true },
  
  status: { 
    type: String, 
    enum: ['queued', 'processing', 'processed', 'failed'], 
    default: 'queued' 
  },
  errorReason: { type: String, default: null },
  retryCount: { type: Number, default: 0 },
  
  imageMetadata: {
    originalSizeInBytes: Number,
    width: Number,
    height: Number,
    format: String,
    contentType: String,
    processingDurationMs: Number,
    originalS3Url: String,
    processedS3Url: String
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);