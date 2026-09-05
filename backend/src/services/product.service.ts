import slugify from 'slugify';
import { prisma } from '../config/database.config';
import { calculateSalePrice } from '../utils/price.util';
import { isValidId } from '../utils/id.util';
import {
  GetProductsInput,
  GetDealsInput,
  GetProductBySlugInput,
  GetProductReviewsInput,
  CreateProductInput,
  GetProductsForAdminInput,
} from '../validators/product.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';
import type { Prisma } from '@prisma/client';

const PRODUCT_LIST_SELECT = {
  _id: true,
  name: true,
  slug: true,
  images: true,
  unit: true,
  originalPrice: true,
  salePrice: true,
  discountPercent: true,
  discountLabel: true,
  stockCount: true,
  ratingAverage: true,
  reviewCount: true,
  categoryId: true,
  category: { select: { _id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

export const getProductsService = async (query: GetProductsInput) => {
  const {
    categoryId,
    page,
    limit,
    hasDiscount,
    inStock,
    minPrice,
    maxPrice,
    sort,
    keyword,
    skip,
  } = query;

  const where: Prisma.ProductWhereInput = { isActive: true };

  if (categoryId && isValidId(categoryId)) {
    where.categoryId = categoryId;
  }

  if (hasDiscount !== undefined) {
    where.discountPercent = hasDiscount ? { gt: 0 } : 0;
  }

  if (inStock !== undefined) {
    where.stockCount = { gt: 0 };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.salePrice = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }

  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: 'insensitive' } },
      { description: { contains: keyword, mode: 'insensitive' } },
    ];
  }

  type SortOption =
    'best-match' | 'price-low' | 'price-high' | 'highest-rating';

  const sortMap: Record<SortOption, Prisma.ProductOrderByWithRelationInput> = {
    'best-match': { createdAt: 'desc' },
    'price-low': { salePrice: 'asc' },
    'price-high': { salePrice: 'desc' },
    'highest-rating': { ratingAverage: 'desc' },
  };

  const effectiveSkip = skip ?? (page - 1) * limit;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: sortMap[sort],
      skip: effectiveSkip,
      take: limit,
      select: PRODUCT_LIST_SELECT,
    }),
    prisma.product.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: effectiveSkip + limit < total,
      hasPrevPage: page > 1,
    },
  };
};

export const getDealsService = async (query: GetDealsInput) => {
  const { limit } = query;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      discountPercent: { gt: 0 },
      stockCount: { gt: 0 },
    },
    orderBy: { discountPercent: 'desc' },
    take: limit,
    select: {
      _id: true,
      name: true,
      slug: true,
      images: true,
      originalPrice: true,
      salePrice: true,
      discountPercent: true,
      discountLabel: true,
      unit: true,
      ratingAverage: true,
      reviewCount: true,
    },
  });

  return { products };
};

export const getProductBySlugService = async ({
  slug,
}: GetProductBySlugInput) => {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    select: {
      _id: true,
      name: true,
      slug: true,
      images: true,
      description: true,
      originalPrice: true,
      salePrice: true,
      unit: true,
      discountPercent: true,
      discountLabel: true,
      stockCount: true,
      ratingAverage: true,
      reviewCount: true,
      categoryId: true,
      createdAt: true,
      category: { select: { _id: true, name: true, slug: true } },
    },
  });

  if (!product) throw new NotFoundException('Product not found');

  const relatedProducts = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      isActive: true,
      slug: { not: slug },
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      _id: true,
      name: true,
      slug: true,
      images: true,
      originalPrice: true,
      salePrice: true,
      discountPercent: true,
      discountLabel: true,
      ratingAverage: true,
      reviewCount: true,
    },
  });

  return { product, relatedProducts };
};

export const getProductReviewsService = async ({
  slug,
  page,
  limit,
}: GetProductReviewsInput) => {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    select: { _id: true },
  });

  if (!product) throw new NotFoundException('Product not found');

  const productId = product._id;
  const skip = (page - 1) * limit;

  const [reviews, total, ratingAgg] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { name: true, avatar: true } },
      },
    }),
    prisma.review.count({ where: { productId } }),
    prisma.review.groupBy({
      by: ['rating'],
      where: { productId },
      _count: { rating: true },
      orderBy: { rating: 'desc' },
    }),
  ]);

  const breakdownMap: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const { rating, _count } of ratingAgg) {
    breakdownMap[rating] = _count.rating;
  }

  const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: breakdownMap[rating],
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    reviews,
    ratingBreakdown,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: skip + limit < total,
      hasPrevPage: page > 1,
    },
  };
};

export const createProductService = async (
  userId: string,
  data: CreateProductInput,
) => {
  const { categoryId } = data;

  if (!isValidId(categoryId)) {
    throw new BadRequestException('Invalid category ID');
  }

  const category = await prisma.category.findUnique({
    where: { _id: categoryId },
  });
  if (!category) {
    throw new BadRequestException('Category not found');
  }

  // Mirrors the old Mongoose pre-validate hooks on ProductModel: derive the
  // slug from the name, and compute salePrice from originalPrice/discount.
  const slug = slugify(data.name, { lower: true, strict: true });
  const salePrice =
    data.discountPercent > 0
      ? calculateSalePrice(data.originalPrice, data.discountPercent)
      : data.originalPrice;

  const product = await prisma.product.create({
    data: {
      ...data,
      slug,
      salePrice,
      userId,
      categoryId,
    },
  });

  return product;
};

export const getProductsForAdminService = async (
  query: GetProductsForAdminInput,
) => {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        category: { select: { _id: true, name: true, slug: true } },
      },
    }),
    prisma.product.count(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: skip + limit < total,
      hasPrevPage: page > 1,
    },
  };
};
