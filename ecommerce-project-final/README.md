# E-Commerce Website

Full-stack e-commerce application.

- frontend/ — React + Vite
- backend/ — Node.js + Express
- database/ — PostgreSQL migrations and seed data
- uploads/ — local development uploads
- docs/ — project documentation

## UPI checkout

Checkout uses Razorpay in INR. The backend creates orders using database prices, verifies payment signatures and captured payment status, updates inventory only after payment, and accepts signed `order.paid` webhooks.

1. Create a Razorpay merchant account and enable UPI in its dashboard.
2. Copy your Razorpay **test-mode** key ID and key secret into `backend/.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Never put the secret in frontend code or share it in chat.
3. Configure a Razorpay webhook at `https://<your-public-backend>/api/payments/razorpay/webhook` for the `order.paid` event, then copy its webhook secret into `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`.
4. Restart the backend. Its startup creates the order tables in the configured PostgreSQL database. The checkout UI stays disabled until both key values are configured.
5. Test with Razorpay test-mode UPI credentials before switching to live keys.

Shipping is ₹99 below ₹1,999 and free at or above ₹1,999. Taxes are not added because this project does not define a tax policy.
