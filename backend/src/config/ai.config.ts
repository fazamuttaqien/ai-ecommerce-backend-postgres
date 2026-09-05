import { createGroq } from '@ai-sdk/groq';
import type { LanguageModel } from 'ai';

import { envConfig } from './env.config';

export const AI_PROVIDERS = ['groq'] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

export interface AIProvider {
  readonly name: AIProviderName;
  getModel(modelId: string): LanguageModel;
}

export interface AIConfigValidation {
  enabled: boolean;
  valid: boolean;
  errors: string[];
}

const GROQ_MODELS = new Set(['openai/gpt-oss-120b']);

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  AI_PROVIDERS.includes(provider as AIProviderName);

export const aiConfig = {
  enabled: envConfig.AI_ENABLED,
  provider: envConfig.AI_PROVIDER,
  model: envConfig.AI_MODEL,
};

export const validateAIConfig = (): AIConfigValidation => {
  if (!aiConfig.enabled) {
    return {
      enabled: false,
      valid: true,
      errors: [],
    };
  }

  const errors: string[] = [];

  if (!isSupportedProvider(aiConfig.provider)) {
    errors.push(`Unsupported AI provider: ${aiConfig.provider}`);
  }

  if (aiConfig.provider === 'groq' && !GROQ_MODELS.has(aiConfig.model)) {
    errors.push(`Unsupported Groq model: ${aiConfig.model}`);
  }

  if (aiConfig.provider === 'groq' && !envConfig.GROQ_API_KEY.trim()) {
    errors.push('GROQ_API_KEY is required when AI_ENABLED=true');
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    errors,
  };
};

const createGroqProvider = (): AIProvider => {
  const validation = validateAIConfig();

  if (!validation.valid) {
    throw new Error(
      `AI configuration is invalid: ${validation.errors.join('; ')}`,
    );
  }

  const provider = createGroq({ apiKey: envConfig.GROQ_API_KEY });

  return {
    name: 'groq',
    getModel: (modelId: string) => provider(modelId),
  };
};

export const createAIProvider = (): AIProvider | null => {
  if (!aiConfig.enabled) {
    return null;
  }

  switch (aiConfig.provider) {
    case 'groq':
      return createGroqProvider();
    default:
      throw new Error(`Unsupported AI provider: ${aiConfig.provider}`);
  }
};
