import slugify from 'slugify';
import { and, asc, count, desc, eq, gt, ilike, gte, lte, ne, or } from 'drizzle-orm';
import { db } from '../db';
import { categories, products, reviews, users } from '../db/schema';
import { calculateSalePrice } from '../utils/price.util';
import { isValidId } from '../utils/id.util';
import { GetProductsInput, GetDealsInput, GetProductBySlugInput, GetProductReviewsInput, CreateProductInput, GetProductsForAdminInput } from '../validators/product.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';

const productListColumns = { _id: products._id, name: products.name, slug: products.slug, images: products.images, unit: products.unit, originalPrice: products.originalPrice, salePrice: products.salePrice, discountPercent: products.discountPercent, discountLabel: products.discountLabel, stockCount: products.stockCount, ratingAverage: products.ratingAverage, reviewCount: products.reviewCount, categoryId: products.categoryId };
const categoryShape = { _id: categories._id, name: categories.name, slug: categories.slug };

export const getProductsService = async (query: GetProductsInput) => {
  const { categoryId, page, limit, hasDiscount, inStock, minPrice, maxPrice, sort, keyword, skip } = query;
  const conditions = [eq(products.isActive, true)];
  if (categoryId && isValidId(categoryId)) conditions.push(eq(products.categoryId, categoryId));
  if (hasDiscount !== undefined) conditions.push(hasDiscount ? gt(products.discountPercent, 0) : eq(products.discountPercent, 0));
  if (inStock !== undefined) conditions.push(gt(products.stockCount, 0));
  if (minPrice !== undefined) conditions.push(gte(products.salePrice, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(products.salePrice, maxPrice));
  if (keyword) conditions.push(or(ilike(products.name, `%${keyword}%`), ilike(products.description, `%${keyword}%`))!);
  const effectiveSkip = skip ?? (page - 1) * limit;
  const orderBy = sort === 'price-low' ? asc(products.salePrice) : sort === 'price-high' ? desc(products.salePrice) : sort === 'highest-rating' ? desc(products.ratingAverage) : desc(products.createdAt);
  const [rows, totalRows] = await Promise.all([
    db.select({ ...productListColumns, category: categoryShape }).from(products).leftJoin(categories, eq(products.categoryId, categories._id)).where(and(...conditions)).orderBy(orderBy).offset(effectiveSkip).limit(limit),
    db.select({ total: count() }).from(products).where(and(...conditions)),
  ]);
  const total = totalRows[0]?.total ?? 0;
  return { products: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: effectiveSkip + limit < total, hasPrevPage: page > 1 } };
};

export const getDealsService = async ({ limit }: GetDealsInput) => {
  const rows = await db.select({ _id: products._id, name: products.name, slug: products.slug, images: products.images, originalPrice: products.originalPrice, salePrice: products.salePrice, discountPercent: products.discountPercent, discountLabel: products.discountLabel, unit: products.unit, ratingAverage: products.ratingAverage, reviewCount: products.reviewCount }).from(products).where(and(eq(products.isActive, true), gt(products.discountPercent, 0), gt(products.stockCount, 0))).orderBy(desc(products.discountPercent)).limit(limit);
  return { products: rows };
};

export const getProductBySlugService = async ({ slug }: GetProductBySlugInput) => {
  const [product] = await db.select({ _id: products._id, name: products.name, slug: products.slug, images: products.images, description: products.description, originalPrice: products.originalPrice, salePrice: products.salePrice, unit: products.unit, discountPercent: products.discountPercent, discountLabel: products.discountLabel, stockCount: products.stockCount, ratingAverage: products.ratingAverage, reviewCount: products.reviewCount, categoryId: products.categoryId, createdAt: products.createdAt, category: categoryShape }).from(products).leftJoin(categories, eq(products.categoryId, categories._id)).where(and(eq(products.slug, slug), eq(products.isActive, true))).limit(1);
  if (!product) throw new NotFoundException('Product not found');
  const relatedProducts = await db.select({ _id: products._id, name: products.name, slug: products.slug, images: products.images, originalPrice: products.originalPrice, salePrice: products.salePrice, discountPercent: products.discountPercent, discountLabel: products.discountLabel, ratingAverage: products.ratingAverage, reviewCount: products.reviewCount }).from(products).where(and(eq(products.categoryId, product.categoryId), eq(products.isActive, true), ne(products.slug, slug))).orderBy(desc(products.createdAt)).limit(6);
  return { product, relatedProducts };
};

export const getProductReviewsService = async ({ slug, page, limit }: GetProductReviewsInput) => {
  const [product] = await db.select({ _id: products._id }).from(products).where(and(eq(products.slug, slug), eq(products.isActive, true))).limit(1);
  if (!product) throw new NotFoundException('Product not found');
  const offset = (page - 1) * limit;
  const [reviewRows, totalRows, ratingAgg] = await Promise.all([
    db.select({ _id: reviews._id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, user: { name: users.name, avatar: users.avatar } }).from(reviews).leftJoin(users, eq(reviews.userId, users._id)).where(eq(reviews.productId, product._id)).orderBy(desc(reviews.createdAt)).offset(offset).limit(limit),
    db.select({ total: count() }).from(reviews).where(eq(reviews.productId, product._id)),
    db.select({ rating: reviews.rating, count: count() }).from(reviews).where(eq(reviews.productId, product._id)).groupBy(reviews.rating).orderBy(desc(reviews.rating)),
  ]);
  const breakdownMap: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const row of ratingAgg) breakdownMap[row.rating] = row.count;
  const total = totalRows[0]?.total ?? 0;
  return { reviews: reviewRows, ratingBreakdown: [5,4,3,2,1].map((rating) => ({ rating, count: breakdownMap[rating] })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: offset + limit < total, hasPrevPage: page > 1 } };
};

export const createProductService = async (userId: string, data: CreateProductInput) => {
  const { categoryId } = data;
  if (!isValidId(categoryId)) throw new BadRequestException('Invalid category ID');
  const [category] = await db.select().from(categories).where(eq(categories._id, categoryId)).limit(1);
  if (!category) throw new BadRequestException('Category not found');
  const slug = slugify(data.name, { lower: true, strict: true });
  const salePrice = data.discountPercent > 0 ? calculateSalePrice(data.originalPrice, data.discountPercent) : data.originalPrice;
  const [product] = await db.insert(products).values({ ...data, slug, salePrice, userId, categoryId }).returning();
  return product;
};

export const getProductsForAdminService = async ({ page, limit }: GetProductsForAdminInput) => {
  const offset = (page - 1) * limit;
  const [rows, totalRows] = await Promise.all([
    db.select({ ...productListColumns, description: products.description, isActive: products.isActive, createdAt: products.createdAt, updatedAt: products.updatedAt, category: categoryShape }).from(products).leftJoin(categories, eq(products.categoryId, categories._id)).orderBy(desc(products.createdAt)).offset(offset).limit(limit),
    db.select({ total: count() }).from(products),
  ]);
  const total = totalRows[0]?.total ?? 0;
  return { products: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: offset + limit < total, hasPrevPage: page > 1 } };
};
