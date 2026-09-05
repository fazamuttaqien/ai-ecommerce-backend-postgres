import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { orderItems, orders, products, reviews } from '../db/schema';
import { isValidId } from '../utils/id.util';
import { CreateReviewInput } from '../validators/review.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';

export const createReviewService = async (userId: string, data: CreateReviewInput) => {
  const { orderId, orderItemId, rating, comment } = data;
  if (!isValidId(orderId) || !isValidId(orderItemId)) throw new BadRequestException('Invalid order or item ID');
  const [order] = await db.select().from(orders).where(and(eq(orders._id, orderId), eq(orders.userId, userId))).limit(1);
  if (!order) throw new NotFoundException('Order not found');
  if (order.status !== ORDER_STATUS.DELIVERED || order.paymentStatus !== PAYMENT_STATUS.PAID) throw new BadRequestException('Order must be delivered and paid to leave a review');
  const [orderItem] = await db.select().from(orderItems).where(and(eq(orderItems._id, orderItemId), eq(orderItems.orderId, orderId))).limit(1);
  if (!orderItem) throw new NotFoundException('Order item not found in this order');
  const [existingReview] = await db.select().from(reviews).where(eq(reviews.orderItemId, orderItemId)).limit(1);
  if (existingReview) throw new BadRequestException('You have already reviewed this item');
  const review = await db.transaction(async (tx) => {
    const [created] = await tx.insert(reviews).values({ userId, orderId, orderItemId, productId: orderItem.productId, rating, comment }).returning();
    await tx.update(orderItems).set({ isReviewed: true }).where(eq(orderItems._id, orderItemId));
    const [agg] = await tx.select({ average: sql<number>`avg(${reviews.rating})`, total: count() }).from(reviews).where(eq(reviews.productId, orderItem.productId));
    await tx.update(products).set({ ratingAverage: agg?.average != null ? Math.round(Number(agg.average) * 10) / 10 : 0, reviewCount: agg?.total ?? 0, updatedAt: new Date() }).where(eq(products._id, orderItem.productId));
    return created;
  });
  if (!review) throw new BadRequestException('Failed to create review');
  return { review };
};

export const getUserReviewsService = async (userId: string) => {
  const rows = await db.select({ review: reviews, product: { name: products.name, slug: products.slug, images: products.images } }).from(reviews).leftJoin(products, eq(reviews.productId, products._id)).where(eq(reviews.userId, userId)).orderBy(desc(reviews.createdAt));
  return { reviews: rows.map((row) => ({ ...row.review, product: row.product })) };
};

export const getUserReviewableOrderItemsService = async (userId: string) => {
  const orderRows = await db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.status, ORDER_STATUS.DELIVERED), eq(orders.paymentStatus, PAYMENT_STATUS.PAID))).orderBy(desc(orders.createdAt));
  const result = await Promise.all(orderRows.map(async (order) => {
    const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, order._id), eq(orderItems.isReviewed, false)));
    return items.length ? { _id: order._id, orderNo: order.orderNo, createdAt: order.createdAt, items } : null;
  }));
  return { orders: result.filter((order): order is NonNullable<typeof order> => order !== null) };
};
