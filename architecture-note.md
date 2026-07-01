# Architecture Note

This document details the architectural design, technical strategies, and structural decisions implemented within the Product Image Processing System.

---

## 1. Main AWS Resources

The system utilizes a fully decoupled, serverless microservices infrastructure built with the following AWS resources:
* **Amazon API Gateway (HTTP API):** Acts as the public entry point. It receives incoming HTTP traffic from the client application and routes it seamlessly to the core backend compute layer.
* **AWS Lambda (Compute Tier):**
  * `candidate-product-image-Api`: A synchronous execution environment managing CRUD functions, user requests, and initial state persistence.
  * `candidate-product-image-worker`: An asynchronous worker focused on performance, pulling event records strictly from an execution queue.
* **Amazon SQS (Simple Queue Service):** Houses image processing workloads, acting as a highly durable buffer between the synchronous API layer and the heavy computational image processing worker.
* **Amazon S3 (Simple Storage Service):**
  * `candidate-product-image-frontend`: Publicly readable bucket serving the static client bundle.
  * `candidate-product-images/original/`: Secure, private bucket for internal asset storage.
  * `candidate-product-images/processed/`: Optimized asset delivery bucket enabling public direct-URL read functionality.

---

## 2. Data Flow: From Product Import to Processed Image

The application leverages an event-driven architecture to decouple slow network and media tasks from customer UI execution:
1. **Ingest Phase:** The Frontend issues a `POST /import` request containing new product payloads via the API Gateway.
2. **Acceptance Phase:** The `api-backend-lambda` processes the request, commits a document into MongoDB Atlas with a status of `PENDING`, pushes a message envelope into the SQS queue, and immediately delivers a `202 Accepted` response back to the client interface.
3. **Processing Phase:** SQS automatically invokes the `image-processor-lambda`. The worker parses the message, fetches the target raw image URL, carries out optimizations, and saves the production asset to the Processed S3 bucket.
4. **Finalization Phase:** The worker updates the product state in MongoDB to `COMPLETED` and attaches the newly generated S3 asset URL.

---

## 3. MongoDB Collections & Structural Documents

The system relies on MongoDB Atlas to handle dynamic transactional statuses and metadata. Two primary collections are utilized:

### `products` Collection
Stores core catalog attributes along with asset pointer associations.
```json
{
  "_id": "6a4529257685e146ce9a0217",
  "sku": "ART-1003",
  "title": "Soft Desert Lines",
  "category": "Canvas",
  "imageUrl": "https://picsum.photos/seed/art-1003/1200/800",
  "status": "processed", 
  "errorReason": null,
  "retryCount": 0,
  "updatedAt": "2026-07-01T14:59:15.211+00:00",
  "__v": 0,
  "imageMetadata": {
    "originalSizeInBytes": 92947,
    "width": 1200,
    "height": 800,
    "format": "webp",
    "contentType": "image/webp",
    "processingDurationMs": 1606,
    "originalS3Url": "https://candidate-product-images.s3.eu-central-1.amazonaws.com/original/...",
    "processedS3Url": "https://candidate-product-images.s3.eu-central-1.amazonaws.com/processed/..."
  }
}
```
### 4 Queue, Retry, and Idempotency Decisions

* **Queue Mechanism:** Amazon SQS standard queue is utilized to decouple the synchronous API ingestion from the heavy image processing workloads. This acts as a protective buffer, ensuring high-traffic spikes from product imports do not overload our system or exceed database connection pools.
* **Retry Strategy:** The system implements a robust retry pattern. If the image-processor-lambda fails due to transient issues (e.g., source network timeouts), the message is safely returned to the queue. The state is tracked via the retryCount field in the document. After 3 failed attempts, the processing stops to avoid endless execution loops.
* **Idempotency Strategy:** To guarantee that processing the same product request multiple times yields the same exact system state without duplication, the product's sku acts as the unique idempotent key. Before processing an SQS payload, the worker validates the product state; if the SKU already exists with a status of processed, the operation is skipped, protecting storage integrity and compute resources.

---

### 5 Failure Handling

Distributed reliability is maintained using strict fault isolation patterns:
* **Graceful Degradation:** If an unhandled exception or image corruption occurs during processing, the worker catches the error, updates the product document status to failed, and logs the specific error signature directly into the errorReason database field.

---

### 6 Important Tradeoffs

* **Serverless Architecture vs. Cold Starts:** Choosing AWS Lambda eliminates the need for maintaining and paying for persistent EC2 servers, allowing the system to scale down to $0 when not in use. The tradeoff is occasional minor latency (cold starts) during unexpected traffic shifts, which is highly acceptable for asynchronous back-office image processing operations.
* **Consolidated Data Model:** Storing both product details and image processing tracking metrics inside a single MongoDB collection optimizes development speed and lookups. The tradeoff is that the collection handles both heavy transactional write loads (job status updates) and catalog read loads simultaneously.

---

### 7 What Would Be Improved with More Time

## What Would Be Improved with More Time

1. **Full Cloud Integration (API Gateway Deployments):** Dedicate more time to getting the complete architecture fully operational in the cloud. Currently, the API Gateway is not fully wired up, so I would focus on stabilizing all remote cloud endpoints and ensuring smooth end-to-end communication across the live cloud environment.
2. **URL-Based Image De-duplication:** Implement a mechanism to prevent uploading and processing identical images when submitted under different SKUs. This would be achieved by validating and comparing the source image URLs against existing database records before triggering a new processing job, ensuring we don't process the same link twice.
