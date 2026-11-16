
const express = require("express");

const router = express.Router();

const {
  getProducts,
  getCategories,
  getProductById,
} = require("../controllers/productController");

// Get all products with filtering and pagination
router.get("/", getProducts);

// Get active product categories and counts
router.get("/categories", getCategories);

// Get one product by ID
router.get("/:id", getProductById);

module.exports = router;
