import { prisma } from '../config/database.config';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';
import {
  GetAdminOrdersInput,
  UpdateOrderStatusBodyInput,
  UpdateOrderStatusParamsInput,
} from '../validators/admin.validator';
import { NotFoundException } from '../utils/app-error';

type StatusHistoryEntry = {
  status: string;
  note?: string;
  date: Date | string;
};

export const getAdminAnalyticsService = async () => {
  const [
    totalOrders,
    totalUsers,
    totalProducts,
    outOfStockProducts,
    totalSalesResult,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.product.count({ where: { stockCount: { lte: 0 } } }),
    prisma.order.aggregate({
      where: { paymentStatus: PAYMENT_STATUS.PAID },
      _sum: { total: true },
    }),
  ]);

  const totalSales = totalSalesResult._sum.total ?? 0;

  return {
    totalSales,
    totalOrders,
    totalUsers,
    totalProducts,
    totalOutOfStock: outOfStockProducts,
  };
};

export const getAdminOrdersService = async ({
  page,
  limit,
}: GetAdminOrdersInput) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
        items: true,
      },
    }),
    prisma.order.count(),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
  };
};

export const updateOrderStatusService = async (
  params: UpdateOrderStatusParamsInput,
  body: UpdateOrderStatusBodyInput,
) => {
  const order = await prisma.order.findUnique({ where: { _id: params.id } });

  if (!order) throw new NotFoundException('Order not found');

  const statusHistory = (order.statusHistory as StatusHistoryEntry[]) ?? [];
  const statusExistsInHistory = statusHistory.some(
    (entry) => entry.status === body.status,
  );

  if (!statusExistsInHistory) {
    statusHistory.push({
      status: body.status,
      note: body.note || `Status updated to ${body.status} by admin`,
      date: new Date(),
    });
  }

  const nextStatus = body.status as (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
  const nextPaymentStatus =
    nextStatus === ORDER_STATUS.DELIVERED &&
    order.paymentStatus !== PAYMENT_STATUS.PAID
      ? PAYMENT_STATUS.PAID
      : order.paymentStatus;

  const updated = await prisma.order.update({
    where: { _id: params.id },
    data: {
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      statusHistory,
    },
    include: { items: true },
  });

  return { order: updated };
};
