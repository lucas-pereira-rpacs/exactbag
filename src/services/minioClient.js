// Shared MinIO client for private object storage.
const Minio = require('minio');
const crypto = require('crypto');
const path = require('path');
const { minio: config } = require('../config');

function parseEndpoint(endpoint, configuredPort, configuredUseSSL) {
  if (!endpoint) return null;

  // MinIO's SDK expects a hostname and port separately, while deployments
  // commonly provide MINIO_ENDPOINT as a URL (for example, http://localhost:9000).
  const url = endpoint.includes('://')
    ? new URL(endpoint)
    : new URL(`${configuredUseSSL ? 'https' : 'http'}://${endpoint}`);

  return {
    endPoint: url.hostname,
    port: Number(configuredPort || url.port || (url.protocol === 'https:' ? 443 : 80)),
    useSSL: configuredUseSSL || url.protocol === 'https:',
  };
}

const endpointConfig = parseEndpoint(config.endpoint, config.port, config.useSSL);
const isConfigured = Boolean(endpointConfig && config.accessKey && config.secretKey);

const minioClient = isConfigured
  ? new Minio.Client({
      ...endpointConfig,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
    })
  : null;

async function ensureBucket() {
  if (!minioClient) return false;

  const exists = await minioClient.bucketExists(config.bucket);
  if (!exists) {
    await minioClient.makeBucket(config.bucket, config.region);
    console.log(`[MinIO] Created bucket: ${config.bucket}`);
  }

  return true;
}

async function getObjectUrl(objectName, expiry = 3600) {
  if (!objectName || objectName.startsWith('data:')) return objectName;
  if (!minioClient) return objectName;
  return minioClient.presignedGetObject(config.bucket, objectName, expiry);
}

const extensionsForMimeType = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/avif': ['.avif'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

function imageExtension(file) {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();
  const allowedExtensions = extensionsForMimeType[file.mimetype] || [];
  return allowedExtensions.includes(originalExtension)
    ? originalExtension
    : (allowedExtensions[0] || '');
}

// Multer storage engine: the request stream is uploaded directly to MinIO.
// No temporary file or Multer memory buffer is created.
const minioStorage = {
  _handleFile(_req, file, callback) {
    if (!minioClient) {
      return callback(new Error('MinIO is not configured'));
    }

    const objectName = `registrations/${crypto.randomUUID()}${imageExtension(file)}`;
    minioClient.putObject(
      config.bucket,
      objectName,
      file.stream,
      undefined,
      { 'Content-Type': file.mimetype },
      (error, etag) => {
        if (error) return callback(error);
        return callback(null, {
          key: objectName,
          size: file.size,
          etag,
          contentType: file.mimetype,
        });
      }
    );
  },

  _removeFile(_req, file, callback) {
    if (!minioClient || !file.key) return callback(null);
    minioClient.removeObject(config.bucket, file.key, callback);
  },
};

if (!isConfigured) {
  console.warn('[MinIO] Client disabled: endpoint and credentials are not fully configured');
}

module.exports = {
  client: minioClient,
  config,
  ensureBucket,
  getObjectUrl,
  isConfigured,
  minioStorage,
};
