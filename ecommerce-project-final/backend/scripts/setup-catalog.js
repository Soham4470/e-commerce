const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

const TOTAL_PRODUCTS = 7000;
const IMAGE_DIRECTORY = path.resolve(
  __dirname,
  "../../uploads/products"
);

const categories = [
  {
    name: "Electronics",
    code: "ELE",
    min: 499,
    max: 49999,
    types: [
      "Wireless Headphones",
      "Bluetooth Speaker",
      "Smart Watch",
      "Power Bank",
      "Wireless Mouse",
      "Keyboard",
      "Portable Charger",
      "Desk Microphone",
      "Gaming Controller",
      "Webcam",
    ],
  },

  {
    name: "Fashion",
    code: "FAS",
    min: 299,
    max: 9999,
    types: [
      "Casual T-Shirt",
      "Classic Shirt",
      "Denim Jacket",
      "Everyday Jeans",
      "Cotton Hoodie",
      "Summer Dress",
      "Casual Trousers",
      "Winter Sweater",
      "Polo Shirt",
      "Linen Outfit",
    ],
  },

  {
    name: "Home & Kitchen",
    code: "HOM",
    min: 199,
    max: 19999,
    types: [
      "Modern Table Lamp",
      "Ceramic Vase",
      "Kitchen Organizer",
      "Storage Basket",
      "Coffee Mug",
      "Dinner Set",
      "Wall Clock",
      "Decorative Cushion",
      "Bedside Table",
      "Kitchen Container",
    ],
  },

  {
    name: "Beauty",
    code: "BEA",
    min: 149,
    max: 4999,
    types: [
      "Skincare Set",
      "Face Cleanser",
      "Moisturizer",
      "Hair Serum",
      "Body Lotion",
      "Face Wash",
      "Sunscreen",
      "Lip Care Set",
      "Hair Conditioner",
      "Beauty Kit",
    ],
  },

  {
    name: "Sports & Fitness",
    code: "SPO",
    min: 199,
    max: 9999,
    types: [
      "Yoga Mat",
      "Fitness Bottle",
      "Training Gloves",
      "Resistance Band",
      "Gym Bag",
      "Skipping Rope",
      "Exercise Ball",
      "Sports T-Shirt",
      "Training Shorts",
      "Fitness Accessories",
    ],
  },

  {
    name: "Books & Stationery",
    code: "BOO",
    min: 49,
    max: 2499,
    types: [
      "Notebook Set",
      "Daily Planner",
      "Hardcover Journal",
      "Sketchbook",
      "Study Lamp",
      "Pen Set",
      "Desk Organizer",
      "Reading Book",
      "Art Supplies",
      "Office Stationery",
    ],
  },

  {
    name: "Toys & Games",
    code: "TOY",
    min: 99,
    max: 5999,
    types: [
      "Building Blocks",
      "Board Game",
      "Puzzle Set",
      "Remote Control Car",
      "Plush Toy",
      "Educational Toy",
      "Creative Art Kit",
      "Strategy Game",
      "Toy Vehicle",
      "Activity Set",
    ],
  },

  {
    name: "Grocery",
    code: "GRO",
    min: 39,
    max: 1999,
    types: [
      "Organic Coffee Beans",
      "Breakfast Cereal",
      "Dry Fruit Mix",
      "Organic Honey",
      "Pasta Pack",
      "Healthy Snack Box",
      "Green Tea",
      "Cooking Oil",
      "Spice Collection",
      "Baking Essentials",
    ],
  },

  {
    name: "Bags & Accessories",
    code: "BAG",
    min: 199,
    max: 7999,
    types: [
      "Everyday Backpack",
      "Travel Bag",
      "Leather Wallet",
      "Crossbody Bag",
      "Laptop Sleeve",
      "Shoulder Bag",
      "Card Holder",
      "Travel Organizer",
      "Mini Handbag",
      "Accessories Set",
    ],
  },

  {
    name: "Footwear",
    code: "FOO",
    min: 499,
    max: 11999,
    types: [
      "Running Shoes",
      "Casual Sneakers",
      "Walking Shoes",
      "Sports Sandals",
      "Classic Loafers",
      "Daily Slippers",
      "Training Shoes",
      "Canvas Shoes",
      "Formal Shoes",
      "Comfort Sandals",
    ],
  },

  {
    name: "Automotive",
    code: "AUT",
    min: 99,
    max: 14999,
    types: [
      "Car Phone Holder",
      "Car Cleaning Kit",
      "Seat Organizer",
      "Car Charger",
      "Dashboard Accessory",
      "Travel Organizer",
      "Car Vacuum",
      "Safety Kit",
      "Car Cover",
      "Interior Accessories",
    ],
  },

  {
    name: "Outdoor & Travel",
    code: "OUT",
    min: 199,
    max: 12999,
    types: [
      "Travel Backpack",
      "Camping Tent",
      "Water Bottle",
      "Travel Pillow",
      "Sleeping Bag",
      "Outdoor Lantern",
      "Travel Pouch",
      "Picnic Kit",
      "Hiking Accessories",
      "Travel Essentials",
    ],
  },
];

const styles = [
  "Essential",
  "Classic",
  "Modern",
  "Premium",
  "Studio",
  "Everyday",
  "Urban",
  "Signature",
  "Compact",
  "Professional",
];

const categoryThemes = {
  Electronics: ["#2563eb", "#0f172a"],
  Fashion: ["#db2777", "#7c3aed"],
  "Home & Kitchen": ["#ea580c", "#92400e"],
  Beauty: ["#ec4899", "#be185d"],
  "Sports & Fitness": ["#16a34a", "#166534"],
  "Books & Stationery": ["#ca8a04", "#713f12"],
  "Toys & Games": ["#7c3aed", "#4338ca"],
  Grocery: ["#65a30d", "#365314"],
  "Bags & Accessories": ["#0891b2", "#164e63"],
  Footwear: ["#4f46e5", "#312e81"],
  Automotive: ["#64748b", "#1e293b"],
  "Outdoor & Travel": ["#059669", "#064e3b"],
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hashNumber(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createProductSvg({
  productNumber,
  name,
  category,
  style,
  imageIndex,
}) {
  const seed = hashNumber(
    `${productNumber}-${name}-${category}-${imageIndex}`
  );

  const theme =
    categoryThemes[category] || ["#2563eb", "#1e293b"];

  const angle = seed % 360;
  const circleX = 140 + (seed % 620);
  const circleY = 150 + ((seed >>> 8) % 500);
  const boxX = 180 + ((seed >>> 16) % 380);
  const boxY = 180 + ((seed >>> 24) % 300);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="900"
     height="900"
     viewBox="0 0 900 900">
  <defs>
    <linearGradient id="background" x1="0%" y1="0%" x2="100%" y2="100%"
      gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${theme[0]}"/>
      <stop offset="100%" stop-color="${theme[1]}"/>
    </linearGradient>

    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#f1f5f9" stop-opacity="0.96"/>
    </linearGradient>
  </defs>

  <rect width="900" height="900" rx="42" fill="url(#background)"/>

  <circle
    cx="${circleX}"
    cy="${circleY}"
    r="${120 + (seed % 100)}"
    fill="#ffffff"
    opacity="0.10"/>

  <circle
    cx="${800 - (seed % 140)}"
    cy="${120 + ((seed >>> 4) % 180)}"
    r="${60 + ((seed >>> 12) % 80)}"
    fill="#ffffff"
    opacity="0.08"/>

  <rect
    x="${boxX}"
    y="${boxY}"
    width="${300 + (seed % 120)}"
    height="${260 + ((seed >>> 10) % 100)}"
    rx="38"
    fill="url(#card)"
    opacity="0.98"/>

  <rect
    x="${boxX + 55}"
    y="${boxY + 55}"
    width="${190 + (seed % 70)}"
    height="${150 + ((seed >>> 18) % 60)}"
    rx="24"
    fill="${theme[0]}"
    opacity="0.18"/>

  <circle
    cx="${boxX + 150 + (seed % 80)}"
    cy="${boxY + 130}"
    r="${48 + (seed % 25)}"
    fill="${theme[0]}"
    opacity="0.85"/>

  <path
    d="M ${boxX + 70} ${boxY + 225}
       Q ${boxX + 180} ${boxY + 130}
         ${boxX + 300} ${boxY + 225}"
    fill="none"
    stroke="${theme[1]}"
    stroke-width="16"
    stroke-linecap="round"
    opacity="0.75"/>

  <text
    x="70"
    y="650"
    fill="#ffffff"
    font-family="Arial, Helvetica, sans-serif"
    font-size="34"
    font-weight="700">
    ${escapeXml(category)}
  </text>

  <text
    x="70"
    y="710"
    fill="#ffffff"
    font-family="Arial, Helvetica, sans-serif"
    font-size="42"
    font-weight="800">
    ${escapeXml(style)}
  </text>

  <text
    x="70"
    y="765"
    fill="#ffffff"
    font-family="Arial, Helvetica, sans-serif"
    font-size="30"
    font-weight="500">
    ${escapeXml(name)}
  </text>

  <rect
    x="70"
    y="810"
    width="230"
    height="48"
    rx="24"
    fill="#ffffff"
    opacity="0.18"/>

  <text
    x="185"
    y="843"
    text-anchor="middle"
    fill="#ffffff"
    font-family="Arial, Helvetica, sans-serif"
    font-size="22"
    font-weight="700">
    PRODUCT ${String(productNumber).padStart(5, "0")}
  </text>
</svg>`;
}

function generateProducts() {
  const result = [];

  const basePerCategory = Math.floor(
    TOTAL_PRODUCTS / categories.length
  );

  const remainder =
    TOTAL_PRODUCTS % categories.length;

  let globalIndex = 0;

  categories.forEach((category, categoryIndex) => {
    const categoryProductCount =
      basePerCategory +
      (categoryIndex < remainder ? 1 : 0);

    for (let i = 0; i < categoryProductCount; i++) {
      const type =
        category.types[i % category.types.length];

      const style =
        styles[(i + categoryIndex) % styles.length];

      const productNumber = globalIndex + 1;

      const sku =
        `DEMO-${category.code}-${String(productNumber).padStart(5, "0")}`;

      const name =
        `${style} ${type} ${String(i + 1).padStart(4, "0")}`;

      const priceRange =
        category.max - category.min + 1;

      const price =
        category.min +
        ((i * 37 + categoryIndex * 113) %
          priceRange);

      const originalPrice =
        Math.round(
          price * (1.12 + (i % 20) / 100)
        );

      const rating =
        Number(
          (4 + (i % 10) / 10).toFixed(1)
        );

      const badge =
        i % 40 === 0
          ? "NEW"
          : i % 25 === 0
            ? "POPULAR"
            : null;

      const imageFilename =
        `product-${String(productNumber).padStart(5, "0")}.svg`;

      const imagePath =
        path.join(IMAGE_DIRECTORY, imageFilename);

      const imageUrl =
        `/uploads/products/${imageFilename}`;

      const svg = createProductSvg({
        productNumber,
        name,
        category: category.name,
        style,
        imageIndex: globalIndex,
      });

      fs.writeFileSync(imagePath, svg, "utf8");

      result.push([
        sku,
        name,
        `${slugify(name)}-${sku.toLowerCase()}`,
        category.name,
        `${name}. This is a demonstration catalogue product. Replace its description and specifications with verified supplier information before selling.`,
        price,
        originalPrice,
        imageUrl,
        (i * 13 + categoryIndex * 7) % 150,
        rating,
        (i * 23 + categoryIndex * 31) % 1500,
        badge,
        i % 10 === 0,
      ]);

      globalIndex++;
    }
  });

  return result;
}

async function setupCatalog() {
  try {
    console.log("Connecting to PostgreSQL...");

    fs.mkdirSync(IMAGE_DIRECTORY, {
      recursive: true,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        sku VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(180) NOT NULL,
        slug VARCHAR(220) NOT NULL UNIQUE,
        category VARCHAR(80) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
        original_price NUMERIC(12, 2) NOT NULL CHECK (original_price >= 0),
        image_url TEXT NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        rating NUMERIC(2, 1) NOT NULL DEFAULT 0
          CHECK (rating >= 0 AND rating <= 5),
        reviews_count INTEGER NOT NULL DEFAULT 0
          CHECK (reviews_count >= 0),
        badge VARCHAR(40),
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_products_category
        ON products(category);

      CREATE INDEX IF NOT EXISTS idx_products_price
        ON products(price);

      CREATE INDEX IF NOT EXISTS idx_products_featured
        ON products(featured);

      CREATE INDEX IF NOT EXISTS idx_products_active
        ON products(is_active);
    `);

    console.log("Product table is ready.");

    console.log(
      `Generating ${TOTAL_PRODUCTS.toLocaleString()} products...`
    );

    const products = generateProducts();

    console.log(
      `Generated ${products.length.toLocaleString()} products.`
    );

    const batchSize = 250;
    const columnCount = 13;

    await pool.query("BEGIN");

    try {
      /*
       * Remove old demonstration catalogue rows.
       *
       * This is necessary because the old catalogue contains
       * 12,000 products and the new catalogue contains 7,000.
       */
      await pool.query(`
        DELETE FROM products
        WHERE sku LIKE 'DEMO-%'
      `);

      for (
        let start = 0;
        start < products.length;
        start += batchSize
      ) {
        const batch =
          products.slice(start, start + batchSize);

        const values = [];

        const placeholders = batch.map(
          (product, rowIndex) => {
            const rowPlaceholders =
              product.map(
                (value, columnIndex) => {
                  const position =
                    rowIndex *
                      columnCount +
                    columnIndex +
                    1;

                  values.push(value);

                  return `$${position}`;
                }
              );

            return `(${rowPlaceholders.join(", ")})`;
          }
        );

        await pool.query(
          `
          INSERT INTO products (
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
          )
          VALUES ${placeholders.join(", ")}
          `,
          values
        );

        const completed =
          Math.min(
            start + batchSize,
            products.length
          );

        console.log(
          `Processed ${completed} / ${products.length}`
        );
      }

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    const result =
      await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(DISTINCT category)::int AS categories,
          COUNT(DISTINCT image_url)::int AS unique_images
        FROM products
        WHERE is_active = TRUE
      `);

    const stats = result.rows[0];

    console.log("\nCatalogue setup successful!");
    console.log(
      "Active products:",
      stats.total
    );
    console.log(
      "Categories:",
      stats.categories
    );
    console.log(
      "Unique images:",
      stats.unique_images
    );

    if (
      stats.total !== TOTAL_PRODUCTS
    ) {
      throw new Error(
        `Expected ${TOTAL_PRODUCTS} products but found ${stats.total}`
      );
    }

    if (
      stats.unique_images !== TOTAL_PRODUCTS
    ) {
      throw new Error(
        `Expected ${TOTAL_PRODUCTS} unique images but found ${stats.unique_images}`
      );
    }

    console.log(
      "\nVerified: 1 unique image per product."
    );
  } catch (error) {
    console.error(
      "\nCatalogue setup failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

setupCatalog();