# Product Image Processing System

An asynchronous, serverless system designed to import products and process images using AWS and MongoDB Atlas.

---

## 🔗 Live Deployments
* **Frontend URL:** `http://candidate-product-image-frontend.s3-website.eu-central-1.amazonaws.com/`
* **API Gateway URL:** `https://qoerim2et5.execute-api.eu-central-1.amazonaws.com/api/products`
---

## 💻 Local Setup Instructions
1. **Clone the repo:** `git clone https://github.com/Chava67/product-image-processor.git`
2. **Backend Setup:** Open a terminal and navigate to the `/"Product Image Operations"` folder. Run `npm install`, create a `.env` file following the `.env.example` structure, and start the API server using `npm run dev`. Then, open an additional terminal window and execute the image processing worker script by `node index.js`
3. **Frontend Setup:** Run `npm install` inside the `/product-image-frontend` folder, update the API URL in `environment.ts`, and run `ng serve`.

---

## 🚀 Deployment Steps (Manual Setup)
1. **Database:** Create a MongoDB Atlas M0 cluster and whitelist all IPs (`0.0.0.0/0`).
2. **Storage & Queues:** Provision 2 S3 buckets (Frontend hosting with public read, Original images and Processed images) and 1 Standard SQS queue via the AWS Console.
3. **Compute & Routing:** Deploy two Node.js Lambda functions (API and Worker) with environment variables, connect them to an HTTP API Gateway, and upload the compiled Angular build to the hosting S3 bucket.

---


## 🔄 Workflow Test Steps
1. **Trigger:** Click "Import Products" on the Frontend UI to trigger a `POST` request to the API Gateway.
2. **Persistence:** The API Lambda saves the product state as `PENDING` in MongoDB and sends a message to SQS.
3. **Processing:** SQS triggers the Processor Lambda asynchronously, which processes the raw image, saves it to the output S3 bucket, and updates the database state to `COMPLETED`.
4. **Verification:** Refresh the frontend dashboard to see the updated status badge and the newly rendered image.

---

## 🛑 Teardown Instructions
1. **Storage:** Empty and delete all 3 Amazon S3 buckets.
2. **Services:** Delete the API Gateway, both Lambda functions, and the SQS queue from the AWS Console.
3. **Database:** Terminate or pause the active cluster inside your MongoDB Atlas web dashboard.
