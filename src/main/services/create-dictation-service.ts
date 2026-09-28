import { getAppConfig } from '../app-config.js';
import { OssDictationService } from './oss-dictation-service.js';
import { ProductDictationService } from './product-dictation-service.js';
import type { DictationService } from '../providers/types.js';

export const createDictationService = (apiKey: string): DictationService => {
  const config = getAppConfig();
  return config.capabilities.byoApiKey
    ? new OssDictationService(apiKey)
    : new ProductDictationService();
};
