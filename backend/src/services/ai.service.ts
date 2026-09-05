import { generateText, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';

import { aiConfig, createAIProvider } from '../config/ai.config';
import type { AIChatInput } from '../validators/ai.validator';
import { AI_SHOPPING_SYSTEM_PROMPT } from '../ai/ai.prompts';
import { AI_SHOPPING_TOOLS } from '../ai/ai.tools';
import { AppError } from '../utils/app-error';
import { HTTPSTATUS } from '../config/http.config';

export const AI_CHAT_MAX_TOOL_ROUNDS = 5;

export class AIServiceError extends AppError {
  constructor(message = 'AI service is unavailable') {
    super(message, HTTPSTATUS.SERVICE_UNAVAILABLE, 'ERR_AI_UNAVAILABLE');
    Object.setPrototypeOf(this, AIServiceError.prototype);
  }
}

export class AIServiceUnavailableError extends AIServiceError {}

/**
 * Provider-agnostic entry point for AI model access.
 * Business features should depend on this service rather than importing a
 * concrete provider such as @ai-sdk/groq directly.
 */
export const getAIModel = (): LanguageModel | null => {
  if (!aiConfig.enabled) {
    return null;
  }

  try {
    const provider = createAIProvider();

    if (!provider) {
      return null;
    }

    return provider.getModel(aiConfig.model);
  } catch (_error) {
    throw new AIServiceError();
  }
};

export type AIChatResult = {
  content: string;
  products: Array<Record<string, unknown>>;
};

const extractRecommendedProducts = (
  steps: unknown[],
): Array<Record<string, unknown>> => {
  const products: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;

    const toolResults = (step as { toolResults?: unknown }).toolResults;
    if (!Array.isArray(toolResults)) continue;

    for (const toolResult of toolResults) {
      if (!toolResult || typeof toolResult !== 'object') continue;

      const value = toolResult as {
        toolName?: unknown;
        output?: unknown;
        result?: unknown;
      };
      if (
        value.toolName !== 'search_products' &&
        value.toolName !== 'get_product'
      )
        continue;

      const output = value.output ?? value.result;
      if (!output || typeof output !== 'object') continue;

      const candidateProducts = Array.isArray(
        (output as { products?: unknown }).products,
      )
        ? (output as { products: unknown[] }).products
        : (output as { product?: unknown }).product
          ? [(output as { product: unknown }).product]
          : [];

      for (const candidate of candidateProducts) {
        if (!candidate || typeof candidate !== 'object') continue;
        const product = candidate as Record<string, unknown>;
        const id = String(product._id ?? product.slug ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        products.push({
          _id: product._id,
          name: product.name,
          slug: product.slug,
          image: Array.isArray(product.images)
            ? (product.images[0] ?? null)
            : null,
          salePrice: product.salePrice,
          originalPrice: product.originalPrice,
          discountPercent: product.discountPercent,
          stockCount: product.stockCount,
          ratingAverage: product.ratingAverage,
          reviewCount: product.reviewCount,
        });
      }
    }
  }

  return products;
};

const toModelMessages = (input: AIChatInput): ModelMessage[] =>
  input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

export const generateAIChat = async (
  input: AIChatInput,
  model?: LanguageModel | null,
): Promise<AIChatResult> => {
  if (!aiConfig.enabled) {
    throw new AIServiceUnavailableError();
  }

  try {
    const resolvedModel = model === undefined ? getAIModel() : model;

    if (!resolvedModel) {
      throw new AIServiceUnavailableError();
    }

    const result = await generateText({
      model: resolvedModel,
      system: AI_SHOPPING_SYSTEM_PROMPT,
      messages: toModelMessages(input),
      tools: AI_SHOPPING_TOOLS,
      stopWhen: stepCountIs(AI_CHAT_MAX_TOOL_ROUNDS),
    });

    const steps = Array.isArray(result.steps) ? result.steps : [];
    const lastStep = steps.at(-1) as { toolCalls?: unknown[] } | undefined;

    if (
      steps.length >= AI_CHAT_MAX_TOOL_ROUNDS &&
      Array.isArray(lastStep?.toolCalls) &&
      lastStep.toolCalls.length > 0 &&
      !result.text.trim()
    ) {
      throw new AIServiceError();
    }

    return {
      content:
        result.text.trim() ||
        'Maaf, saya belum dapat memberikan jawaban saat ini.',
      products: extractRecommendedProducts(steps),
    };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      throw error;
    }

    throw new AIServiceError();
  }
};
