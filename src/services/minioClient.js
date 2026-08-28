// Shared MinIO client for private object storage.
const Minio = require('minio');
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

if (!isConfigured) {
  console.warn('[MinIO] Client disabled: endpoint and credentials are not fully configured');
}

module.exports = {
  client: minioClient,
  config,
  isConfigured,
};
