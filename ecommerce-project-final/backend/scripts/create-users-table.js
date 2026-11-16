const pool = require("../src/config/database");

async function createUsersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("Users table created successfully.");
  } catch (error) {
    console.error("Failed to create users table:", error.message);
  } finally {
    await pool.end();
  }
}

createUsersTable();