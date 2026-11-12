/// <reference types="node" />
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const candidate = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  const googleServicesFile = existsSync(resolve(__dirname, candidate)) ? candidate : undefined;
  return {
    ...config,
    name: config.name || 'delivery-app', slug: config.slug || 'delivery-app',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, notificationsConfigured: Boolean(googleServicesFile) },
  };
};
