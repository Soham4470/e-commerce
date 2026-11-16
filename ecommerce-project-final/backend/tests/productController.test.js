const { afterEach, test } = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ||= "test-secret";
process.env.FRONTEND_URL ||= "http://localhost:5173";

const productModel = require("../src/models/productModel");
const {
  verifyRazorpaySignature,
  verifyWebhookSignature,
  normalizeItems,
  getCustomer,
} = require("../src/controllers/paymentController");
const {
  getCategories,
  getProducts,
} = require("../src/controllers/productController");

const originalGetProducts = productModel.getProducts;
const originalGetProductCount = productModel.getProductCount;
const originalGetCategories = productModel.getCategories;

afterEach(() => {
  productModel.getProducts = originalGetProducts;
  productModel.getProductCount = originalGetProductCount;
  productModel.getCategories = originalGetCategories;
});

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("product listing forwards storefront filters and pagination flags", async () => {
  let productFilters;
  let countFilters;
  productModel.getProducts = async (filters) => {
    productFilters = filters;
    return [{ id: 8 }];
  };
  productModel.getProductCount = async (filters) => {
    countFilters = filters;
    return 25;
  };

  const response = createResponse();
  await getProducts({
    query: {
      page: "2",
      limit: "10",
      q: "linen",
      category: "Fashion",
      minPrice: "300",
      maxPrice: "800",
      sort: "price-asc",
    },
  }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(productFilters, {
    category: "Fashion",
    search: "linen",
    featured: undefined,
    minPrice: 300,
    maxPrice: 800,
    sort: "price-asc",
    limit: 10,
    offset: 10,
  });
  assert.deepEqual(countFilters, {
    category: "Fashion",
    search: "linen",
    featured: undefined,
    minPrice: 300,
    maxPrice: 800,
  });
  assert.deepEqual(response.body.pagination, {
    total: 25,
    page: 2,
    limit: 10,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  });
});

test("product listing rejects reversed price bounds", async () => {
  const response = createResponse();
  await getProducts({
    query: { minPrice: "500", maxPrice: "100" },
  }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Minimum price/);
});

test("categories endpoint returns category counts", async () => {
  const categories = [{ name: "Fashion", productCount: 12 }];
  productModel.getCategories = async () => categories;

  const response = createResponse();
  await getCategories({}, response, (error) => {
    throw error;
  });

  assert.deepEqual(response.body, {
    success: true,
    data: categories,
  });
});

test("Razorpay payment signatures are verified against the order and payment IDs", () => {
  const crypto = require("node:crypto");
  const secret = "local-test-secret";
  const orderId = "order_test123";
  const paymentId = "pay_test456";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  assert.equal(verifyRazorpaySignature(orderId, paymentId, signature, secret), true);
  assert.equal(verifyRazorpaySignature(orderId, "pay_another", signature, secret), false);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, "invalid", secret), false);
});

test("Razorpay webhook signatures are verified against the raw request body", () => {
  const crypto = require("node:crypto");
  const secret = "local-webhook-secret";
  const body = Buffer.from('{"event":"order.paid"}');
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(body, signature, ""), false);
});

test("checkout validates customer details and aggregates duplicate cart items", () => {
  assert.deepEqual(normalizeItems([
    { productId: "12", quantity: 2 },
    { productId: 12, quantity: 1 },
  ]), [{ id: "12", quantity: 3 }]);
  assert.equal(normalizeItems([{ productId: "12", quantity: 21 }]), null);

  assert.deepEqual(getCustomer({
    name: "  Shopper ",
    email: "SHOPPER@example.com ",
    phone: "+91 98765-43210",
    address: "  15 Market Road, Pune  ",
  }), {
    name: "Shopper",
    email: "shopper@example.com",
    phone: "+919876543210",
    address: "15 Market Road, Pune",
  });
  assert.equal(getCustomer({ name: "A", email: "invalid" }), null);
});
