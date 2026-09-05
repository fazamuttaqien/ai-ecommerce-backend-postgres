import { tool } from 'ai';
import { z } from 'zod';

import {
  getProductBySlugService,
  getProductReviewsService,
  getProductsService,
} from '../../services/product.service';
import type {
  GetProductBySlugInput,
  GetProductReviewsInput,
  GetProductsInput,
} from '../../validators/product.validator';
import { getProductsSchema } from '../../validators/product.validator';
import { AppError } from '../../utils/app-error';

const AI_PRODUCT_LIMIT = 20;
const AI_REVIEW_LIMIT = 10;

export const searchProductsInputSchema = z
  .object({
    keyword: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().trim().min(1).optional(),
    minPrice: z.number().finite().min(0).optional(),
    maxPrice: z.number().finite().min(0).optional(),
    hasDiscount: z.boolean().optional(),
    inStock: z.boolean().optional(),
    sort: z
      .enum(['best-match', 'price-low', 'price-high', 'highest-rating'])
      .default('best-match'),
    limit: z.number().int().min(1).max(AI_PRODUCT_LIMIT).default(10),
  })
  .superRefine((value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'maxPrice must be greater than or equal to minPrice',
      });
    }
  });

export const getProductInputSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export const getProductReviewsInputSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(AI_REVIEW_LIMIT).default(10),
});

export type SearchProductsToolInput = z.infer<typeof searchProductsInputSchema>;
export type GetProductToolInput = z.infer<typeof getProductInputSchema>;
export type GetProductReviewsToolInput = z.infer<
  typeof getProductReviewsInputSchema
>;

type ProductServiceDependencies = {
  getProducts: typeof getProductsService;
  getProductBySlug: typeof getProductBySlugService;
  getProductReviews: typeof getProductReviewsService;
};

const defaultDependencies: ProductServiceDependencies = {
  getProducts: getProductsService,
  getProductBySlug: getProductBySlugService,
  getProductReviews: getProductReviewsService,
};

const toId = (value: unknown): string => String(value);

const mapCategory = (category: unknown) => {
  if (!category || typeof category !== 'object') return null;
  const value = category as { _id?: unknown; name?: unknown; slug?: unknown };
  return {
    _id: value._id === undefined ? undefined : toId(value._id),
    name: typeof value.name === 'string' ? value.name : undefined,
    slug: typeof value.slug === 'string' ? value.slug : undefined,
  };
};

const mapProduct = (product: Record<string, unknown>) => ({
  _id: toId(product._id),
  name: product.name,
  slug: product.slug,
  images: Array.isArray(product.images) ? product.images : [],
  description: product.description,
  originalPrice: product.originalPrice,
  salePrice: product.salePrice,
  discountPercent: product.discountPercent,
  discountLabel: product.discountLabel,
  unit: product.unit,
  stockCount: product.stockCount,
  ratingAverage: product.ratingAverage,
  reviewCount: product.reviewCount,
  category: mapCategory(product.category ?? product.categoryId),
});

const toControlledToolError = (error: unknown, operation: string): Error => {
  if (error instanceof AppError) {
    return new Error(`${operation} failed: ${error.message}`);
  }

  return new Error(`${operation} failed. Please try again.`);
};

const parseToolInput = <T>(
  schema: z.ZodType<T>,
  rawInput: unknown,
  operation: string,
): T => {
  try {
    return schema.parse(rawInput);
  } catch {
    throw new Error(`${operation} received invalid arguments.`);
  }
};

export const executeSearchProducts = async (
  rawInput: unknown,
  dependencies: ProductServiceDependencies = defaultDependencies,
) => {
  const input = parseToolInput(
    searchProductsInputSchema,
    rawInput,
    'Product search',
  );
  const serviceInput = getProductsSchema.parse({
    ...input,
    page: 1,
    hasDiscount:
      input.hasDiscount === undefined ? undefined : String(input.hasDiscount),
    inStock: input.inStock === undefined ? undefined : String(input.inStock),
  }) satisfies GetProductsInput;

  try {
    const result = await dependencies.getProducts(serviceInput);
    return {
      products: result.products.map((product) =>
        mapProduct(product as unknown as Record<string, unknown>),
      ),
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        hasNextPage: result.pagination.hasNextPage,
      },
    };
  } catch (error) {
    throw toControlledToolError(error, 'Product search');
  }
};

export const executeGetProduct = async (
  rawInput: unknown,
  dependencies: ProductServiceDependencies = defaultDependencies,
) => {
  const input = parseToolInput(
    getProductInputSchema,
    rawInput,
    'Product detail lookup',
  );
  const serviceInput = { slug: input.slug } satisfies GetProductBySlugInput;

  try {
    const result = await dependencies.getProductBySlug(serviceInput);
    return {
      product: mapProduct(result.product as unknown as Record<string, unknown>),
    };
  } catch (error) {
    throw toControlledToolError(error, 'Product detail lookup');
  }
};

export const executeGetProductReviews = async (
  rawInput: unknown,
  dependencies: ProductServiceDependencies = defaultDependencies,
) => {
  const input = parseToolInput(
    getProductReviewsInputSchema,
    rawInput,
    'Product review lookup',
  );
  const serviceInput = {
    slug: input.slug,
    page: input.page,
    limit: input.limit,
  } satisfies GetProductReviewsInput;

  try {
    const result = await dependencies.getProductReviews(serviceInput);
    return {
      reviews: result.reviews.map((review) => {
        const value = review as unknown as Record<string, unknown>;
        const user = (value.user ?? value.userId) as
          { name?: unknown; avatar?: unknown } | undefined;
        return {
          rating: value.rating,
          comment: value.comment,
          createdAt: value.createdAt,
          user: user
            ? {
                name: typeof user.name === 'string' ? user.name : undefined,
                avatar:
                  typeof user.avatar === 'string' ? user.avatar : undefined,
              }
            : null,
        };
      }),
      ratingBreakdown: result.ratingBreakdown,
      pagination: result.pagination,
    };
  } catch (error) {
    throw toControlledToolError(error, 'Product review lookup');
  }
};

export const createAIShoppingTools = (
  dependencies: ProductServiceDependencies = defaultDependencies,
) => ({
  search_products: tool({
    description:
      'Search active products using keyword, category, price, discount, stock, and sorting filters. Read-only.',
    inputSchema: searchProductsInputSchema,
    execute: (input) => executeSearchProducts(input, dependencies),
  }),
  get_product: tool({
    description: 'Get an active product by its slug. Read-only.',
    inputSchema: getProductInputSchema,
    execute: (input) => executeGetProduct(input, dependencies),
  }),
  get_product_reviews: tool({
    description:
      'Get reviews and rating summary for an active product by slug. Read-only.',
    inputSchema: getProductReviewsInputSchema,
    execute: (input) => executeGetProductReviews(input, dependencies),
  }),
});

// Explicit whitelist: only these named tools are exposed to the LLM.
export const aiShoppingTools = createAIShoppingTools();
