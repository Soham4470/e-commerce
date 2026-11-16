const cors = require("cors");
const { frontendUrl } = require("./env");

const corsOptions = {
  origin: frontendUrl,
  credentials: true,
};

module.exports = cors(corsOptions);