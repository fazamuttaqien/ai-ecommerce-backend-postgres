import { aiShoppingTools } from '../tools/ai/product.tools';

/**
 * Explicit AI tool whitelist for the shopping assistant.
 * Do not expose application services or database access directly to the LLM.
 */
export const AI_SHOPPING_TOOLS = {
  search_products: aiShoppingTools.search_products,
  get_product: aiShoppingTools.get_product,
  get_product_reviews: aiShoppingTools.get_product_reviews,
} as const;

export const AI_TOOL_NAMES = [
  'search_products',
  'get_product',
  'get_product_reviews',
] as const;
