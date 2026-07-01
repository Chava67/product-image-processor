const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION || 'eu-central-1'
});

const sqs = new AWS.SQS();

module.exports = sqs;