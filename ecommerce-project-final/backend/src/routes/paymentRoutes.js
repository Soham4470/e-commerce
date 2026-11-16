const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getPaymentConfig,
  createOrder,
  verifyPayment,
} = require("../controllers/paymentController");

const router = express.Router();
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many checkout attempts. Please wait and try again.",
  },
});

router.get("/config", getPaymentConfig);
router.post("/razorpay/orders", checkoutLimiter, createOrder);
router.post("/razorpay/verify", checkoutLimiter, verifyPayment);

module.exports = router;
