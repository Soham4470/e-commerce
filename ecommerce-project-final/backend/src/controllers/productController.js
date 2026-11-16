
const productModel = require("../models/productModel");

const allowedSorts = new Set([
  "popular",
  "newest",
  "featured",
  "rating",
  "price-asc",
  "price-desc",
]);

function parsePrice(value) {
  if (value === undefined || value === "") {
    return { valid: true };
  }

  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    return { valid: false };
  }

  return { valid: true, value: price };
}

async function getProducts(req, res, next) {
  try {
    const {
      category,
      q,
      search: searchParameter,
      featured,
      sort = "popular",
    } = req.query;
    const minPriceResult = parsePrice(req.query.minPrice);
    const maxPriceResult = parsePrice(req.query.maxPrice);

    if (!minPriceResult.valid || !maxPriceResult.valid) {
      return res.status(400).json({
        success: false,
        message: "Prices must be valid non-negative numbers",
      });
    }

    if (
      minPriceResult.value !== undefined &&
      maxPriceResult.value !== undefined &&
      minPriceResult.value > maxPriceResult.value
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum price cannot be greater than maximum price",
      });
    }

    if (!allowedSorts.has(sort)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort option",
      });
    }

    if (featured !== undefined && !["true", "false"].includes(featured)) {
      return res.status(400).json({
        success: false,
        message: "Featured must be true or false",
      });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const offset = (page - 1) * limit;

    const filters = {
      category,
      search: q || searchParameter,
      featured,
      minPrice: minPriceResult.value,
      maxPrice: maxPriceResult.value,
    };

    const [products, total] = await Promise.all([
      productModel.getProducts({
        ...filters,
        sort,
        limit,
        offset,
      }),
      productModel.getProductCount(filters),
    ]);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getCategories(req, res, next) {
  try {
    const categories = await productModel.getCategories();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}

async function getProductById(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await productModel.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getCategories,
  getProductById,
};
