const crypto = require("node:crypto");
const Razorpay = require("razorpay");
const pool = require("../config/database");
const {
  razorpayKeyId,
  razorpayKeySecret,
  razorpayWebhookSecret,
} = require("../config/env");

const FREE_SHIPPING_THRESHOLD_PAISE = 199900;
const SHIPPING_FEE_PAISE = 9900;
const MAX_ORDER_AMOUNT_PAISE = 100000000;
let razorpay;

function getRazorpay() {
  if (!razorpayKeyId || !razorpayKeySecret) {
    return null;
  }

  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });
  }

  return razorpay;
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, "hex");

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

function verifyWebhookSignature(body, signature, secret) {
  if (!Buffer.isBuffer(body) || typeof signature !== "string" || !secret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature, "hex");
  return (
    /^[a-f\d]{64}$/i.test(signature) &&
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

async function ensurePaymentTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id BIGSERIAL PRIMARY KEY,
      receipt VARCHAR(40) NOT NULL UNIQUE,
      gateway_order_id VARCHAR(80) NOT NULL UNIQUE,
      gateway_payment_id VARCHAR(80) UNIQUE,
      customer_name VARCHAR(100) NOT NULL,
      customer_email VARCHAR(254) NOT NULL,
      customer_phone VARCHAR(20) NOT NULL,
      shipping_address TEXT NOT NULL,
      subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise > 0),
      shipping_paise BIGINT NOT NULL CHECK (shipping_paise >= 0),
      amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'refund_pending', 'refunded')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      product_name VARCHAR(180) NOT NULL,
      image_url TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_store_orders_status_created
      ON store_orders(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_store_order_items_order
      ON store_order_items(order_id);
  `);
}

function getCustomer(body) {
  const customer = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
    phone: typeof body.phone === "string" ? body.phone.replace(/[\s()-]/g, "") : "",
    address: typeof body.address === "string" ? body.address.trim() : "",
  };

  if (
    customer.name.length < 2 ||
    customer.name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
    customer.email.length > 254 ||
    !/^\+?\d{10,15}$/.test(customer.phone) ||
    customer.address.length < 8 ||
    customer.address.length > 1000
  ) {
    return null;
  }

  return customer;
}

function normalizeItems(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) {
    return null;
  }

  const quantities = new Map();
  for (const item of input) {
    const id = String(item?.productId ?? "");
    const quantity = Number(item?.quantity);

    if (!/^\d+$/.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return null;
    }

    const combined = (quantities.get(id) || 0) + quantity;
    if (combined > 20) {
      return null;
    }
    quantities.set(id, combined);
  }

  return [...quantities.entries()].map(([id, quantity]) => ({ id, quantity }));
}

async function getPaymentConfig(req, res) {
  res.status(200).json({
    success: true,
    data: {
      provider: "razorpay",
      keyId: razorpayKeyId || null,
      enabled: Boolean(razorpayKeyId && razorpayKeySecret),
    },
  });
}

async function createOrder(req, res, next) {
  const gateway = getRazorpay();
  if (!gateway) {
    return res.status(503).json({
      success: false,
      message: "UPI checkout is not configured. Add Razorpay credentials to backend/.env.",
    });
  }

  const customer = getCustomer(req.body || {});
  const items = normalizeItems(req.body?.items);
  if (!customer || !items) {
    return res.status(400).json({
      success: false,
      message: "Enter valid contact and delivery details and at least one valid cart item.",
    });
  }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;

    const ids = items.map((item) => item.id);
    const productsResult = await client.query(
      `SELECT id, name, image_url, price, stock
       FROM products
       WHERE id = ANY($1::bigint[]) AND is_active = true
       ORDER BY id
       FOR UPDATE`,
      [ids]
    );
    const productById = new Map(
      productsResult.rows.map((product) => [String(product.id), product])
    );

    if (productById.size !== items.length) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(409).json({
        success: false,
        message: "One or more items are no longer available. Refresh your bag and try again.",
      });
    }

    let subtotalPaise = 0;
    for (const item of items) {
      const product = productById.get(item.id);
      if (Number(product.stock) < item.quantity) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(409).json({
          success: false,
          message: `${product.name} does not have enough stock for that quantity.`,
        });
      }

      const pricePaise = Math.round(Number(product.price) * 100);
      subtotalPaise += pricePaise * item.quantity;
    }

    const shippingPaise =
      subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE
        ? 0
        : SHIPPING_FEE_PAISE;
    const amountPaise = subtotalPaise + shippingPaise;

    if (amountPaise > MAX_ORDER_AMOUNT_PAISE) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(400).json({
        success: false,
        message: "This order total is above the supported checkout limit.",
      });
    }

    const receipt = `morrow_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const gatewayOrder = await gateway.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        customer_email: customer.email,
      },
    });

    const savedOrder = await client.query(
      `INSERT INTO store_orders (
        receipt, gateway_order_id, customer_name, customer_email,
        customer_phone, shipping_address, subtotal_paise, shipping_paise,
        amount_paise
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        receipt,
        gatewayOrder.id,
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        subtotalPaise,
        shippingPaise,
        amountPaise,
      ]
    );
    const orderId = savedOrder.rows[0].id;

    for (const item of items) {
      const product = productById.get(item.id);
      await client.query(
        `INSERT INTO store_order_items (
          order_id, product_id, product_name, image_url, quantity, unit_price_paise
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          product.id,
          product.name,
          product.image_url,
          item.quantity,
          Math.round(Number(product.price) * 100),
        ]
      );
    }

    await client.query("COMMIT");
    inTransaction = false;
    return res.status(201).json({
      success: true,
      data: {
        orderId,
        razorpayOrderId: gatewayOrder.id,
        amount: amountPaise,
        currency: "INR",
        keyId: razorpayKeyId,
        subtotal: subtotalPaise,
        shipping: shippingPaise,
      },
    });
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    client.release();
  }
}

async function verifyPayment(req, res, next) {
  const gateway = getRazorpay();
  if (!gateway) {
    return res.status(503).json({
      success: false,
      message: "UPI checkout is not configured.",
    });
  }

  const { orderId, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (
    !/^\d+$/.test(String(orderId || "")) ||
    typeof gatewayOrderId !== "string" ||
    typeof paymentId !== "string" ||
    !verifyRazorpaySignature(gatewayOrderId, paymentId, signature, razorpayKeySecret)
  ) {
    return res.status(400).json({
      success: false,
      message: "Payment verification failed.",
    });
  }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    const orderResult = await client.query(
      `SELECT id, gateway_order_id, gateway_payment_id, amount_paise, status
       FROM store_orders WHERE id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order || order.gateway_order_id !== gatewayOrderId) {
      return res.status(404).json({
        success: false,
        message: "Checkout order not found.",
      });
    }
    if (order.status === "paid") {
      if (order.gateway_payment_id !== paymentId) {
        const duplicatePayment = await gateway.payments.fetch(paymentId);
        if (
          duplicatePayment.order_id === gatewayOrderId &&
          Number(duplicatePayment.amount) === Number(order.amount_paise) &&
          duplicatePayment.status === "captured"
        ) {
          await gateway.payments.refund(paymentId, {
            amount: Number(order.amount_paise),
            notes: { reason: "Duplicate payment for an already paid order" },
          });
          return res.status(409).json({
            success: false,
            message: "A duplicate payment was detected and a refund was initiated.",
          });
        }
      }
      return res.status(200).json({
        success: true,
        data: { orderId: order.id, status: "paid" },
      });
    }
    if (order.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "This order is no longer awaiting payment.",
      });
    }

    const payment = await gateway.payments.fetch(paymentId);
    if (
      payment.order_id !== gatewayOrderId ||
      Number(payment.amount) !== Number(order.amount_paise) ||
      payment.currency !== "INR"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment details do not match this order.",
      });
    }

    let confirmedPayment = payment;
    if (payment.status === "authorized") {
      confirmedPayment = await gateway.payments.capture(
        paymentId,
        Number(order.amount_paise),
        "INR"
      );
    }
    if (confirmedPayment.status !== "captured") {
      return res.status(409).json({
        success: false,
        message: "Payment has not been captured yet. Please wait a moment and try again.",
      });
    }

    await client.query("BEGIN");
    inTransaction = true;
    const lockedOrder = await client.query(
      `SELECT id, status FROM store_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (lockedOrder.rows[0]?.status === "paid") {
      await client.query("COMMIT");
      inTransaction = false;
      return res.status(200).json({
        success: true,
        data: { orderId, status: "paid" },
      });
    }
    if (lockedOrder.rows[0]?.status !== "pending") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(409).json({
        success: false,
        message: "This order is no longer awaiting payment.",
      });
    }

    const orderItems = await client.query(
      `SELECT product_id, quantity
       FROM store_order_items WHERE order_id = $1
       ORDER BY product_id FOR UPDATE`,
      [orderId]
    );

    for (const item of orderItems.rows) {
      const stockResult = await client.query(
        `UPDATE products
         SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2 AND is_active = true AND stock >= $1
         RETURNING id`,
        [item.quantity, item.product_id]
      );
      if (stockResult.rowCount !== 1) {
        await client.query("ROLLBACK");
        inTransaction = false;
        const claimedRefund = await pool.query(
          `UPDATE store_orders
           SET status = 'refund_pending', gateway_payment_id = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id`,
          [orderId, paymentId]
        );
        if (claimedRefund.rowCount === 0) {
          return res.status(409).json({
            success: false,
            message: "This order has already been processed.",
          });
        }

        let refundInitiated = false;
        try {
          await gateway.payments.refund(paymentId, {
            amount: Number(order.amount_paise),
            notes: { reason: "Inventory unavailable during payment verification" },
          });
          refundInitiated = true;
        } catch (refundError) {
          console.error("Razorpay refund initiation failed:", refundError);
        }

        return res.status(409).json({
          success: false,
          message: refundInitiated
            ? "An item sold out during payment. Your refund has been initiated."
            : "An item sold out during payment. Your refund needs manual processing.",
        });
      }
    }

    await client.query(
      `UPDATE store_orders
       SET status = 'paid', gateway_payment_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [orderId, paymentId]
    );
    await client.query("COMMIT");
    inTransaction = false;

    return res.status(200).json({
      success: true,
      data: { orderId, status: "paid" },
    });
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    client.release();
  }
}

async function handleWebhook(req, res) {
  const signature = req.get("x-razorpay-signature");
  if (!razorpayWebhookSecret) {
    return res.status(503).json({
      success: false,
      message: "Webhook verification is not configured",
    });
  }
  if (!verifyWebhookSignature(req.body, signature, razorpayWebhookSecret)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook payload",
    });
  }

  if (event.event !== "order.paid") {
    return res.status(200).json({ success: true, ignored: true });
  }

  const gateway = getRazorpay();
  const payment = event.payload?.payment?.entity;
  const gatewayOrderId = payment?.order_id;
  const paymentId = payment?.id;
  if (
    !gateway ||
    !gatewayOrderId ||
    !paymentId ||
    payment.status !== "captured"
  ) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const orderResult = await pool.query(
    `SELECT id, gateway_order_id, gateway_payment_id, amount_paise, status
     FROM store_orders WHERE gateway_order_id = $1`,
    [gatewayOrderId]
  );
  const order = orderResult.rows[0];
  if (!order) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const paymentAmount = Number(payment.amount);
  if (
    payment.currency !== "INR" ||
    paymentAmount !== Number(order.amount_paise)
  ) {
    console.error("Razorpay webhook amount mismatch for order:", order.id);
    return res.status(400).json({
      success: false,
      message: "Payment amount does not match the order",
    });
  }
  if (order.status === "paid") {
    if (order.gateway_payment_id !== paymentId) {
      try {
        await gateway.payments.refund(paymentId, {
          amount: paymentAmount,
          notes: { reason: "Duplicate payment for an already paid order" },
        });
      } catch (refundError) {
        console.error("Razorpay duplicate-payment refund failed:", refundError);
        return res.status(500).json({
          success: false,
          message: "Duplicate payment refund needs manual processing",
        });
      }
    }
    return res.status(200).json({ success: true, ignored: true });
  }
  if (order.status !== "pending") {
    return res.status(200).json({ success: true, ignored: true });
  }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const lockedOrder = await client.query(
      `SELECT id, status FROM store_orders WHERE id = $1 FOR UPDATE`,
      [order.id]
    );
    if (lockedOrder.rows[0]?.status !== "pending") {
      await client.query("COMMIT");
      inTransaction = false;
      return res.status(200).json({ success: true, ignored: true });
    }

    const items = await client.query(
      `SELECT product_id, quantity
       FROM store_order_items WHERE order_id = $1
       ORDER BY product_id`,
      [order.id]
    );
    for (const item of items.rows) {
      const updated = await client.query(
        `UPDATE products
         SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2 AND is_active = true AND stock >= $1
         RETURNING id`,
        [item.quantity, item.product_id]
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        inTransaction = false;
        const claimed = await pool.query(
          `UPDATE store_orders
           SET status = 'refund_pending', gateway_payment_id = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id`,
          [order.id, paymentId]
        );
        if (claimed.rowCount > 0) {
          try {
            await gateway.payments.refund(paymentId, {
              amount: paymentAmount,
              notes: { reason: "Inventory unavailable during payment verification" },
            });
          } catch (refundError) {
            console.error("Razorpay webhook refund initiation failed:", refundError);
          }
        }
        return res.status(200).json({ success: true });
      }
    }

    await client.query(
      `UPDATE store_orders
       SET status = 'paid', gateway_payment_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [order.id, paymentId]
    );
    await client.query("COMMIT");
    inTransaction = false;
    return res.status(200).json({ success: true });
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error("Razorpay webhook processing failed:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  ensurePaymentTables,
  getPaymentConfig,
  createOrder,
  verifyPayment,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  normalizeItems,
  getCustomer,
  handleWebhook,
};
