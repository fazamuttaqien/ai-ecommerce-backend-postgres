import { prisma } from '../config/database.config';
import { isValidId } from '../utils/id.util';
import { CreateOrderInput } from '../validators/order.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';
import { calculateCartTotals } from '../utils/cart.util';
import { generateOrderNo } from '../utils/order.util';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PaymentMethod,
} from '../constants/enums';
import stripeClient from '../config/stripe.config';
import { envConfig } from '../config/env.config';

const CART_PRODUCT_SELECT = {
  select: {
    _id: true,
    name: true,
    slug: true,
    images: true,
    originalPrice: true,
    discountPercent: true,
    salePrice: true,
    stockCount: true,
  },
} as const;

export const createOrderService = async (
  userId: string,
  data: CreateOrderInput,
) => {
  const { addressId, paymentMethod } = data;

  const cart = await prisma.cart.findFirst({
    where: { userId },
    include: { items: { include: { product: CART_PRODUCT_SELECT } } },
  });

  if (!cart || !cart.items || cart.items.length === 0) {
    throw new BadRequestException('Cart is empty');
  }

  const address = await prisma.address.findFirst({
    where: { _id: addressId, userId },
  });
  if (!address) {
    throw new NotFoundException('Address not found');
  }

  const items = cart.items.map((item) => ({
    productId: item.product,
    quantity: item.quantity,
  }));

  const totals = calculateCartTotals(items);

  const orderItems = items.map((item) => ({
    productId: item.productId._id,
    name: item.productId.name,
    image: item.productId.images?.[0] ?? '',
    originalPrice: item.productId.originalPrice,
    discountPercent: item.productId.discountPercent,
    salePrice: item.productId.salePrice,
    quantity: item.quantity,
  }));

  const shippingAddress = {
    recipientName: address.recipientName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };

  const order = await prisma.order.create({
    data: {
      userId,
      orderNo: generateOrderNo(),
      shippingAddress,
      paymentMethod: paymentMethod as PaymentMethod,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      tax: totals.tax,
      total: totals.orderTotal,
      statusHistory: [{ status: ORDER_STATUS.PLACED, date: new Date() }],
      items: {
        create: orderItems,
      },
    },
    include: { items: true },
  });

  if (paymentMethod === PAYMENT_METHODS.CASH_ON_DELIVERY) {
    await prisma.$transaction([
      prisma.cart.delete({ where: { _id: cart._id } }),
      ...items.map((item) =>
        prisma.product.update({
          where: { _id: item.productId._id },
          data: { stockCount: { decrement: item.quantity } },
        }),
      ),
    ]);

    return { order, stripeUrl: null };
  }

  const lineItems: Array<{
    price_data: {
      currency: string;
      product_data: { name: string; images?: string[] };
      unit_amount: number;
    };
    quantity: number;
  }> = orderItems.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        images: item.image ? [item.image] : [],
      },
      unit_amount: Math.round(item.salePrice * 100),
    },
    quantity: item.quantity,
  }));

  if (totals.deliveryFee > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Delivery Fee' },
        unit_amount: Math.round(totals.deliveryFee * 100),
      },
      quantity: 1,
    });
  }

  if (totals.tax > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tax' },
        unit_amount: Math.round(totals.tax * 100),
      },
      quantity: 1,
    });
  }

  const user = await prisma.user.findUnique({
    where: { _id: userId },
    select: { email: true },
  });
  const customerEmail = user?.email;

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: lineItems,
    metadata: {
      orderId: order._id.toString(),
    },
    success_url: `${envConfig.FRONTEND_ORIGIN}/orders/${order._id}`,
    cancel_url: `${envConfig.FRONTEND_ORIGIN}/checkout`,
  });

  return { stripeUrl: session.url! };
};

export const getUserOrdersService = async (userId: string) => {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  return { orders };
};

export const getUserOrderByIdService = async (
  userId: string,
  orderId: string,
) => {
  if (!isValidId(orderId)) {
    throw new BadRequestException('Invalid order ID');
  }
  const order = await prisma.order.findFirst({
    where: { _id: orderId, userId },
    include: { items: true },
  });
  if (!order) {
    throw new NotFoundException('Order not found');
  }

  return { order };
};
