const express = require('express');
const cors = require('cors');
require('dotenv').config();
const serverless = require('serverless-http'); 
const connectDB = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

connectDB();
 app.use('/api/products', require('./routes/products'));

const isLambda = !!process.env.LAMBDA_TASK_ROOT;

if (!isLambda) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`💻 Local Server is running on port ${PORT} 🚀`);
  });
}
module.exports.handler = serverless(app);
