const pool = require("../config/database");

function buildFilters({ category, search, featured, minPrice, maxPrice }) {
  const conditions = ["is_active = true"];
  const values = [];
  let index = 1;

  if (category) {
    conditions.push(`category = $${index++}`);
    values.push(category);
  }

  if (search) {
    conditions.push(`
      (
        name ILIKE $${index}
        OR description ILIKE $${index}
        OR category ILIKE $${index}
      )
    `);
    values.push(`%${search}%`);
    index++;
  }

  if (featured !== undefined) {
    conditions.push(`featured = $${index++}`);
    values.push(featured === "true");
  }

  if (minPrice !== undefined) {
    conditions.push(`price >= $${index++}`);
    values.push(minPrice);
  }

  if (maxPrice !== undefined) {
    conditions.push(`price <= $${index++}`);
    values.push(maxPrice);
  }

  return { conditions, values, nextIndex: index };
}

async function getProducts({
  category,
  search,
  featured,
  minPrice,
  maxPrice,
  sort = "popular",
  limit = 20,
  offset = 0,
}) {
  const { conditions, values, nextIndex } = buildFilters({
    category,
    search,
    featured,
    minPrice,
    maxPrice,
  });
  let index = nextIndex;

  values.push(limit);
  const limitIndex = index++;

  values.push(offset);
  const offsetIndex = index++;

  const ordering = {
    popular: "featured DESC, rating DESC, reviews_count DESC, id DESC",
    newest: "created_at DESC, id DESC",
    featured: "featured DESC, created_at DESC, id DESC",
    rating: "rating DESC, reviews_count DESC, id DESC",
    "price-asc": "price ASC, id ASC",
    "price-desc": "price DESC, id DESC",
  }[sort] || "featured DESC, rating DESC, reviews_count DESC, id DESC";

  const query = `
    SELECT
      id,
      sku,
      name,
      slug,
      category,
      description,
      price,
      original_price,
      image_url,
      stock,
      rating,
      reviews_count,
      badge,
      featured
    FROM products
    WHERE ${conditions.join(" AND ")}
    ORDER BY ${ordering}
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const result = await pool.query(query, values);

  return result.rows;
}

async function getProductById(id) {
  const result = await pool.query(
    `
    SELECT
      id,
      sku,
      name,
      slug,
      category,
      description,
      price,
      original_price,
      image_url,
      stock,
      rating,
      reviews_count,
      badge,
      featured
    FROM products
    WHERE id = $1 AND is_active = true
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function getProductCount({
  category,
  search,
  featured,
  minPrice,
  maxPrice,
}) {
  const { conditions, values } = buildFilters({
    category,
    search,
    featured,
    minPrice,
    maxPrice,
  });

  const result = await pool.query(
    `SELECT COUNT(*) FROM products WHERE ${conditions.join(" AND ")}`,
    values
  );

  return Number(result.rows[0].count);
}

async function getCategories() {
  const result = await pool.query(`
    SELECT category AS name, COUNT(*)::int AS "productCount"
    FROM products
    WHERE is_active = true
    GROUP BY category
    ORDER BY category ASC
  `);

  return result.rows;
}

module.exports = {
  getProducts,
  getProductById,
  getProductCount,
  getCategories,
};