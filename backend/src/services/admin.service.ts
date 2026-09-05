import { and, count, desc, eq, lte, sum } from 'drizzle-orm';
import { db } from '../db';
import { orders, orderItems, products, users } from '../db/schema';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';
import { GetAdminOrdersInput, UpdateOrderStatusBodyInput, UpdateOrderStatusParamsInput } from '../validators/admin.validator';
import { NotFoundException } from '../utils/app-error';

type StatusHistoryEntry = { status: string; note?: string; date: Date | string };

export const getAdminAnalyticsService = async () => {
  const [totalOrders, totalUsers, totalProducts, outOfStockProducts, totalSalesResult] = await Promise.all([
    db.select({ count: count() }).from(orders),
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(products),
    db.select({ count: count() }).from(products).where(lte(products.stockCount, 0)),
    db.select({ total: sum(orders.total) }).from(orders).where(eq(orders.paymentStatus, PAYMENT_STATUS.PAID)),
  ]);
  return { totalSales: Number(totalSalesResult[0]?.total ?? 0), totalOrders: totalOrders[0]?.count ?? 0, totalUsers: totalUsers[0]?.count ?? 0, totalProducts: totalProducts[0]?.count ?? 0, totalOutOfStock: outOfStockProducts[0]?.count ?? 0 };
};

export const getAdminOrdersService = async ({ page, limit }: GetAdminOrdersInput) => {
  const offset = (page - 1) * limit;
  const [orderRows, totalRows] = await Promise.all([
    db.select({ order: orders, user: { name: users.name, email: users.email } }).from(orders).leftJoin(users, eq(orders.userId, users._id)).orderBy(desc(orders.createdAt)).offset(offset).limit(limit),
    db.select({ total: count() }).from(orders),
  ]);
  const result = await Promise.all(orderRows.map(async ({ order, user }) => ({ ...order, user, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order._id)) })));
  const total = totalRows[0]?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  return { orders: result, pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
};

export const updateOrderStatusService = async (params: UpdateOrderStatusParamsInput, body: UpdateOrderStatusBodyInput) => {
  const [order] = await db.select().from(orders).where(eq(orders._id, params.id)).limit(1);
  if (!order) throw new NotFoundException('Order not found');
  const statusHistory = [...((order.statusHistory as StatusHistoryEntry[]) ?? [])];
  if (!statusHistory.some((entry) => entry.status === body.status)) statusHistory.push({ status: body.status, note: body.note || `Status updated to ${body.status} by admin`, date: new Date() });
  const nextStatus = body.status as (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
  const nextPaymentStatus = nextStatus === ORDER_STATUS.DELIVERED && order.paymentStatus !== PAYMENT_STATUS.PAID ? PAYMENT_STATUS.PAID : order.paymentStatus;
  const [updated] = await db.update(orders).set({ status: nextStatus, paymentStatus: nextPaymentStatus, statusHistory, updatedAt: new Date() }).where(eq(orders._id, params.id)).returning();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, params.id));
  return { order: { ...updated, items } };
};
