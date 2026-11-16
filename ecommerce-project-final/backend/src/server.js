
const express = require("express");
const cors = require("cors");
const path = require("path");

const { port, frontendUrl } = require("./config/env");
const paymentController = require("./controllers/paymentController");

const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);

app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json" }),
  paymentController.handleWebhook
);

app.use(express.json());

// Serve product images from the root uploads folder
const uploadsPath = path.join(__dirname, "../../uploads");
app.use("/uploads", express.static(uploadsPath));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
  });
});

app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

async function startServer() {
  await paymentController.ensurePaymentTables();

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
