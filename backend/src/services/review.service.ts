import { prisma } from '../config/database.config';
import { isValidId } from '../utils/id.util';
import { CreateReviewInput } from '../validators/review.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';

export const createReviewService = async (
  userId: string,
  data: CreateReviewInput,
) => {
  const { orderId, orderItemId, rating, comment } = data;

  if (!isValidId(orderId) || !isValidId(orderItemId)) {
    throw new BadRequestException('Invalid order or item ID');
  }

  const order = await prisma.order.findFirst({
    where: { _id: orderId, userId },
    include: { items: true },
  });
  if (!order) {
    throw new NotFoundException('Order not found');
  }

  if (
    order.status !== ORDER_STATUS.DELIVERED ||
    order.paymentStatus !== PAYMENT_STATUS.PAID
  ) {
    throw new BadRequestException(
      'Order must be delivered and paid to leave a review',
    );
  }

  const orderItem = order.items.find((item) => item._id === orderItemId);
  if (!orderItem) {
    throw new NotFoundException('Order item not found in this order');
  }

  const existingReview = await prisma.review.findUnique({
    where: { orderItemId },
  });
  if (existingReview) {
    throw new BadRequestException('You have already reviewed this item');
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        userId,
        orderId,
        orderItemId,
        productId: orderItem.productId,
        rating,
        comment,
      },
    });

    await tx.orderItem.update({
      where: { _id: orderItemId },
      data: { isReviewed: true },
    });

    const agg = await tx.review.aggregate({
      where: { productId: orderItem.productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const newAverage =
      agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : 0;
    const newCount = agg._count.rating ?? 0;

    await tx.product.update({
      where: { _id: orderItem.productId },
      data: {
        ratingAverage: newAverage,
        reviewCount: newCount,
      },
    });

    return created;
  });

  if (!review) {
    throw new BadRequestException('Failed to create review');
  }

  return { review };
};

export const getUserReviewsService = async (userId: string) => {
  const reviews = await prisma.review.findMany({
    where: { userId },
    include: {
      product: { select: { name: true, slug: true, images: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { reviews };
};

export const getUserReviewableOrderItemsService = async (userId: string) => {
  const orders = await prisma.order.findMany({
    where: {
      userId,
      status: ORDER_STATUS.DELIVERED,
      paymentStatus: PAYMENT_STATUS.PAID,
      items: { some: { isReviewed: false } },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      _id: true,
      orderNo: true,
      createdAt: true,
      items: { where: { isReviewed: false } },
    },
  });

  return { orders };
};
