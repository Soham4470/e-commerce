
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import AuthModal from "./components/common/AuthModal";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const PAGE_SIZE = 24;
const FREE_SHIPPING_THRESHOLD = 1999;
const SHIPPING_FEE = 99;
const PRODUCT_PHOTOS = {
  Automotive: ["photo-1492144534655-ae79c964c9d7", "photo-1503376780353-7e6692767b70", "photo-1486262715619-67b85e0b08d3"],
  "Bags & Accessories": ["photo-1553062407-98eeb64c6a62", "photo-1584917865442-de89df76afd3", "photo-1548036328-c9fa89d128fa"],
  Beauty: ["photo-1596462502278-27bfdc403348", "photo-1608248543803-ba4f8c70ae0b", "photo-1523293182086-7651a899d37f"],
  "Books & Stationery": ["photo-1544947950-fa07a98d237f", "photo-1512820790803-83ca734e83df", "photo-1495446815901-a7297e633e8d"],
  Electronics: ["photo-1498049794561-7780e7231661", "photo-1511707171634-5f897ff02aa9", "photo-1523275335684-37898b6baf30"],
  Fashion: ["photo-1529139574466-a303027c1d8b", "photo-1483985988355-763728e1935b", "photo-1490481651871-ab68de25d43d"],
  Footwear: ["photo-1542291026-7eec264c27ff", "photo-1543163521-1b539c27cc18", "photo-1460353581641-37baddab0fa2"],
  Grocery: ["photo-1542838132-92c53300491e", "photo-1543168256-418811576931", "photo-1547592180-85f173990554"],
  "Home & Kitchen": ["photo-1600210492486-724fe5c67fb0", "photo-1555041469-a586c61ea9bc", "photo-1600585154340-be6161a56a0c"],
  "Outdoor & Travel": ["photo-1472396961693-142e6e269027", "photo-1470770841072-f978cf4d019e", "photo-1511497584788-876760111969"],
  "Sports & Fitness": ["photo-1461896836934-ffe607ba8211", "photo-1517649763962-0c623066013b", "photo-1538805060514-97d9cc17730c"],
  "Toys & Games": ["photo-1566576912321-d58ddd7a6088", "photo-1596461404969-9ae70f2830c1", "photo-1599623560574-39d485900c95"],
};
const FALLBACK_PHOTO = "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80";

function getProductPhoto(product) {
  const photos = PRODUCT_PHOTOS[product.category] || PRODUCT_PHOTOS.Fashion;
  const index = Math.abs(Number(product.id) || 0) % photos.length;
  return `https://images.unsplash.com/${photos[index]}?auto=format&fit=crop&w=900&q=80`;
}

function loadRazorpayScript() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load secure checkout. Check your internet connection and try again."));
    };
    document.body.appendChild(script);
  });
}

const categoryIcons = {
  Automotive: "🚗",
  "Bags & Accessories": "👜",
  Beauty: "✦",
  "Books & Stationery": "📚",
  Electronics: "⌁",
  Fashion: "✳",
  Footwear: "👟",
  Grocery: "🥬",
  "Home & Kitchen": "⌂",
  "Outdoor & Travel": "✈",
  "Sports & Fitness": "◉",
  "Toys & Games": "✧",
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readCart() {
  const storedCart = readStorage("morrow-cart", []);
  if (!Array.isArray(storedCart)) {
    return [];
  }

  return storedCart
    .filter((item) =>
      item?.product?.id !== undefined &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
    )
    .map((item) => ({
      ...item,
      quantity: Math.min(item.quantity, Math.max(0, Number(item.product.stock) || 0)),
    }))
    .filter((item) => item.quantity > 0);
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const [cart, setCart] = useState(readCart);

  const [wishlist, setWishlist] = useState(() =>
    [...new Set(
      (Array.isArray(readStorage("morrow-wishlist", []))
        ? readStorage("morrow-wishlist", [])
        : []
      ).filter((item) => item !== null && item !== undefined).map(String)
    )]
  );
  const [wishlistProducts, setWishlistProducts] = useState(() => {
    const storedProducts = readStorage("morrow-wishlist-products", []);
    return Array.isArray(storedProducts)
      ? storedProducts.filter((product) => product?.id !== undefined)
      : [];
  });
  const [showWishlist, setShowWishlist] = useState(false);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderConfirmation, setOrderConfirmation] = useState("");
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [paymentConfigError, setPaymentConfigError] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  // Authentication state
  const [authOpen, setAuthOpen] = useState(false);

  const [user, setUser] = useState(() =>
    readStorage("morrow-user", null)
  );

  const handleLogout = () => {
    localStorage.removeItem("morrow-token");
    localStorage.removeItem("morrow-user");
    setUser(null);
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadPaymentConfig() {
      try {
        const response = await fetch(`${API_URL}/payments/config`, {
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load payment options");
        }

        setPaymentConfig(result.data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setPaymentConfigError(err.message || "Unable to load payment options");
        }
      }
    }

    loadPaymentConfig();
    return () => controller.abort();
  }, []);

  const priceRangeInvalid =
    (minPrice !== "" &&
      (!Number.isFinite(Number(minPrice)) || Number(minPrice) < 0)) ||
    (maxPrice !== "" &&
      (!Number.isFinite(Number(maxPrice)) || Number(maxPrice) < 0)) ||
    minPrice !== "" &&
    maxPrice !== "" &&
    Number(minPrice) > Number(maxPrice);

  // Load categories
  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch(`${API_URL}/products/categories`, {
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load categories");
        }

        setCategories(Array.isArray(result.data) ? result.data : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Category loading error:", err);
          setCategoriesError(err.message || "Unable to load categories");
        }
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => controller.abort();
  }, []);

  // Load products
  useEffect(() => {
    if (showWishlist || priceRangeInvalid) {
      return undefined;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          sort,
        });

        if (query.trim()) {
          params.set("q", query.trim());
        }

        if (category !== "All") {
          params.set("category", category);
        }

        if (minPrice !== "") {
          params.set("minPrice", minPrice);
        }

        if (maxPrice !== "") {
          params.set("maxPrice", maxPrice);
        }

        const response = await fetch(
          `${API_URL}/products?${params.toString()}`,
          { signal: controller.signal }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load products");
        }

        setProducts(result.data);
        setPagination(result.pagination);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Product loading error:", err);
          setError(err.message || "Something went wrong.");
          setProducts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    query,
    category,
    sort,
    minPrice,
    maxPrice,
    page,
    retryCount,
    priceRangeInvalid,
    showWishlist,
  ]);

  // Save cart and wishlist
  useEffect(() => {
    localStorage.setItem("morrow-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("morrow-wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    localStorage.setItem(
      "morrow-wishlist-products",
      JSON.stringify(wishlistProducts)
    );
  }, [wishlistProducts]);

  // Cart calculations
  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  );

  const cartSubtotal = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + Number(item.product.price) * item.quantity,
        0
      ),
    [cart]
  );

  const filteredWishlistProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return wishlistProducts
      .filter((product) => category === "All" || product.category === category)
      .filter((product) => {
        const price = Number(product.price);
        return (
          (minPrice === "" || price >= Number(minPrice)) &&
          (maxPrice === "" || price <= Number(maxPrice))
        );
      })
      .filter((product) => {
        if (!normalizedQuery) {
          return true;
        }

        return `${product.name} ${product.category} ${product.description || ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((first, second) => {
        if (sort === "price-asc") {
          return Number(first.price) - Number(second.price);
        }
        if (sort === "price-desc") {
          return Number(second.price) - Number(first.price);
        }
        if (sort === "rating") {
          return Number(second.rating) - Number(first.rating);
        }
        if (sort === "featured") {
          return Number(second.featured) - Number(first.featured);
        }
        return 0;
      });
  }, [wishlistProducts, category, minPrice, maxPrice, query, sort]);

  const visibleProducts = showWishlist
    ? filteredWishlistProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : products;
  const visibleTotalPages = showWishlist
    ? Math.ceil(filteredWishlistProducts.length / PAGE_SIZE)
    : pagination.totalPages;

  // Pagination numbers
  const pageNumbers = useMemo(() => {
    const totalPages = visibleTotalPages;
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    const result = [];

    for (let number = start; number <= end; number += 1) {
      result.push(number);
    }

    return result;
  }, [page, visibleTotalPages]);

  const addToCart = (product) => {
    const stock = Number(product.stock);
    if (stock <= 0) return;

    setCart((current) => {
      const existing = current.find(
        (item) => String(item.product.id) === String(product.id)
      );

      if (existing) {
        if (existing.quantity >= stock) {
          return current;
        }

        return current.map((item) =>
          String(item.product.id) === String(product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { product, quantity: 1 }];
    });

    setCartOpen(true);
  };

  const beginCheckout = async (event) => {
    event.preventDefault();
    if (!paymentConfig?.enabled || cart.length === 0) {
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      await loadRazorpayScript();
      const createResponse = await fetch(`${API_URL}/payments/razorpay/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });
      const createResult = await createResponse.json();

      if (!createResponse.ok || !createResult.success) {
        throw new Error(createResult.message || "Unable to create checkout order");
      }

      const order = createResult.data;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Morrow",
        description: "Everyday finds",
        order_id: order.razorpayOrderId,
        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
          emi: false,
          paylater: false,
        },
        prefill: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          contact: customer.phone.replace(/[\s()-]/g, ""),
        },
        theme: { color: "#354c3c" },
        modal: {
          ondismiss: () => setCheckoutLoading(false),
        },
        handler: async (paymentResponse) => {
          setCheckoutLoading(true);
          try {
            const verifyResponse = await fetch(
              `${API_URL}/payments/razorpay/verify`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: order.orderId,
                  ...paymentResponse,
                }),
              }
            );
            const verifyResult = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyResult.success) {
              throw new Error(verifyResult.message || "Payment could not be verified");
            }

            setCart([]);
            setCheckoutOpen(false);
            setOrderConfirmation(String(verifyResult.data.orderId));
          } catch (err) {
            setCheckoutError(err.message || "Payment verification failed. Contact support before trying to pay again.");
          } finally {
            setCheckoutLoading(false);
          }
        },
      });

      checkout.on("payment.failed", (paymentEvent) => {
        setCheckoutError(
          paymentEvent.error?.description ||
            "The UPI payment was not completed. You can try again."
        );
        setCheckoutLoading(false);
      });
      checkout.open();
    } catch (err) {
      setCheckoutError(err.message || "Unable to start checkout");
      setCheckoutLoading(false);
    }
  };

  const changeCartQuantity = (productId, amount) => {
    setCart((current) =>
      current
        .map((item) =>
          String(item.product.id) === String(productId)
            ? {
                ...item,
                quantity: Math.min(
                  Math.max(0, item.quantity + amount),
                  Math.max(0, Number(item.product.stock) || 0)
                ),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setCart((current) =>
      current.filter(
        (item) => String(item.product.id) !== String(productId)
      )
    );
  };

  const toggleWishlist = (product) => {
    const id = String(product.id);
    const saved = wishlist.includes(id);

    setWishlist((current) =>
      saved ? current.filter((item) => item !== id) : [...current, id]
    );
    setWishlistProducts((current) =>
      saved
        ? current.filter((item) => String(item.id) !== id)
        : [
            ...current.filter((item) => String(item.id) !== id),
            product,
          ]
    );
  };

  const clearFilters = () => {
    setLoading(!showWishlist);
    setError("");
    setQuery("");
    setCategory("All");
    setSort("popular");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  };

  const updateFilter = (callback) => {
    setLoading(!showWishlist);
    setError("");
    callback();
    setPage(1);
  };

  const goToPage = (nextPage) => {
    setLoading(!showWishlist);
    setError("");
    setPage(nextPage);
    document.getElementById("shop")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const totalResults = showWishlist
    ? filteredWishlistProducts.length
    : priceRangeInvalid
      ? 0
      : pagination.total;
  const displayedStart =
    totalResults === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const displayedEnd = Math.min(
    page * PAGE_SIZE,
    totalResults
  );
  const productError = priceRangeInvalid
    ? "Enter valid non-negative prices, with the minimum no greater than the maximum."
    : error;
  const catalogueCount = categories.reduce(
    (total, item) => total + Number(item.productCount || 0),
    0
  );

  return (
    <div className="store">
      {/* Announcement */}
      <div className="announcement">
        <span>THOUGHTFUL FINDS. EVERYDAY PRICES.</span>
        <span>FREE SHIPPING ON ORDERS OVER ₹1,999</span>
      </div>

      {/* Header */}
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top">
            morrow<span>.</span>
          </a>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="#top">Home</a>
            <a href="#categories">Categories</a>
            <a href="#shop">Shop all</a>
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <span className="header-link">
                  Hi, {user.name}
                </span>

                <button
                  className="header-link"
                  type="button"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                className="header-link"
                type="button"
                onClick={() => setAuthOpen(true)}
              >
                Login / Register
              </button>
            )}

            <button
              className="header-link wishlist-header"
              type="button"
              aria-label={`View saved items (${wishlist.length})`}
              onClick={() => {
                setShowWishlist(true);
                setPage(1);
                setLoading(false);
                document.getElementById("shop")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
            >
              ♡ <span>{wishlist.length}</span>
            </button>

            <button
              className="cart-button"
              type="button"
              onClick={() => setCartOpen(true)}
            >
              Bag <span className="cart-count">{cartCount}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="hero">
          <div className="hero-content">
            <p className="eyebrow">THE EVERYDAY EDIT · VOL. 01</p>

            <h1>
              Find your
              <br />
              <span>everyday good.</span>
            </h1>

            <p className="hero-description">
              Discover thoughtful essentials across technology,
              fashion, home, beauty and everything in between.
            </p>

            <a href="#shop" className="primary-button">
              Explore the collection <span>↗</span>
            </a>

            <div className="hero-trust">
              <span>✦</span> {catalogueCount.toLocaleString("en-IN")} catalogue items · {categories.length} categories
            </div>
          </div>

          <div className="hero-image">
            <img
              src={FALLBACK_PHOTO}
              alt="Everyday fashion and accessories"
            />
            <div className="hero-image-card">
              <small>THE MORROW EDIT</small>
              <strong>Better finds.</strong>
              <strong>Every day.</strong>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="category-section section-shell" id="categories">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXPLORE THE STORE</p>
              <h2>Shop by category</h2>
            </div>
            <span className="muted-text">
              {categories.length} collections to discover
            </span>
          </div>

          {categories.length > 0 ? (
            <div className="category-grid">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={
                    category === item.name
                      ? "category-card selected"
                      : "category-card"
                  }
                  onClick={() => {
                    updateFilter(() => setCategory(item.name));
                    document.getElementById("shop")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  <span className="category-symbol">
                    {categoryIcons[item.name] || "✦"}
                  </span>
                  <span className="category-name">{item.name}</span>
                  <span className="category-count">
                    {Number(item.productCount).toLocaleString("en-IN")} items
                  </span>
                  <span className="category-arrow">↗</span>
                </button>
              ))}
            </div>
          ) : categoriesError ? (
            <p className="muted-text" role="alert">{categoriesError}</p>
          ) : categoriesLoading ? (
            <p className="muted-text">Loading categories...</p>
          ) : (
            <p className="muted-text">No categories are available yet.</p>
          )}
        </section>

        {/* Product catalogue */}
        <section className="products-section" id="shop">
          <div className="section-shell">
            <div className="section-heading product-section-heading">
              <div>
                <p className="eyebrow">THE FULL COLLECTION</p>
                <h2>{showWishlist ? "Your saved finds." : "Find something good."}</h2>
                <p className="section-subtitle">
                  {showWishlist
                    ? "The things you have saved for later."
                    : "Explore our catalogue and discover your next favourite."}
                </p>
              </div>

              <div className="catalogue-total">
                <strong>
                  {totalResults.toLocaleString("en-IN")}
                </strong>
                <span>matching products</span>
              </div>
            </div>

            {/* Search and filters */}
            <div className="filter-panel">
              <label className="search-control">
                <span>⌕</span>
                <input
                  type="search"
                  placeholder="Search products, brands or keywords..."
                  aria-label="Search the product catalogue"
                  value={query}
                  onChange={(event) => {
                    setLoading(!showWishlist);
                    setError("");
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setLoading(!showWishlist);
                      setError("");
                      setQuery("");
                      setPage(1);
                    }}
                  >
                    ×
                  </button>
                )}
              </label>

              <div className="filter-controls">
                <label className="filter-field">
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={(event) =>
                      updateFilter(() => setCategory(event.target.value))
                    }
                  >
                    <option value="All">All categories</option>
                    {categories.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="filter-field">
                  <span>Min price (₹)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Minimum"
                    value={minPrice}
                    onChange={(event) =>
                      updateFilter(() => setMinPrice(event.target.value))
                    }
                  />
                </label>

                <label className="filter-field">
                  <span>Max price (₹)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Maximum"
                    value={maxPrice}
                    onChange={(event) =>
                      updateFilter(() => setMaxPrice(event.target.value))
                    }
                  />
                </label>

                <label className="filter-field sort-field">
                  <span>Sort by</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      updateFilter(() => setSort(event.target.value))
                    }
                  >
                    <option value="popular">Most popular</option>
                    <option value="newest">Newest</option>
                    <option value="featured">Featured</option>
                    <option value="rating">Top rated</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                  </select>
                </label>

                <button
                  className="clear-filters"
                  type="button"
                  onClick={clearFilters}
                >
                  Reset filters
                </button>
              </div>
            </div>

            {/* Product results information */}
            <div className="results-toolbar">
              <p>
                Showing <strong>{displayedStart.toLocaleString("en-IN")}</strong>
                {" – "}
                <strong>{displayedEnd.toLocaleString("en-IN")}</strong>
                {" of "}
                <strong>{totalResults.toLocaleString("en-IN")}</strong>
                {" products"}
              </p>

              {loading && !priceRangeInvalid && !showWishlist && (
                <span className="loading-indicator">
                  <span className="loading-dot"></span>
                  Updating catalogue...
                </span>
              )}
              <button
                type="button"
                className="wishlist-view-toggle"
                aria-pressed={showWishlist}
                onClick={() => {
                  setShowWishlist(!showWishlist);
                  setPage(1);
                  setLoading(false);
                }}
              >
                {showWishlist
                  ? "Continue shopping"
                  : `View saved items (${wishlist.length})`}
              </button>
            </div>

            {productError && !showWishlist && (
              <div className="error-message" role="alert">
                <div>
                  <strong>{priceRangeInvalid ? "Invalid price range" : "Unable to load products"}</strong>
                  <p>{productError}</p>
                </div>
                {priceRangeInvalid ? (
                  <button type="button" onClick={clearFilters}>Reset filters</button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setRetryCount((value) => value + 1);
                    }}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {/* Product cards */}
            {!showWishlist && loading && products.length === 0 && !productError ? (
              <div className="product-grid">
                {Array.from({ length: 8 }, (_, index) => (
                  <div className="skeleton-card" key={index}>
                    <div className="skeleton-image"></div>
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                  </div>
                ))}
              </div>
            ) : visibleProducts.length > 0 && (showWishlist || !priceRangeInvalid) ? (
              <div className="product-grid" aria-busy={loading}>
                {visibleProducts.map((product) => {
                  const productId = String(product.id);
                  const saved = wishlist.includes(productId);
                  const stock = Number(product.stock);
                  const outOfStock = stock <= 0;
                  const cartQuantity = cart.find(
                    (item) => String(item.product.id) === productId
                  )?.quantity || 0;

                  const discount =
                    Number(product.original_price) > Number(product.price)
                      ? Math.round(
                          (1 -
                            Number(product.price) /
                              Number(product.original_price)) *
                            100
                        )
                      : 0;

                  return (
                    <article className="product-card" key={product.id}>
                      <div className="product-image-wrap">
                        <img
                          src={getProductPhoto(product)}
                          alt={product.name}
                          loading="lazy"
                          onError={(event) => {
                            if (!event.currentTarget.src.includes("photo-1490481651871-ab68de25d43d")) {
                              event.currentTarget.src = FALLBACK_PHOTO;
                            }
                          }}
                        />

                        {product.badge && (
                          <span className="product-badge">
                            {product.badge}
                          </span>
                        )}

                        {discount > 0 && (
                          <span className="discount-badge">
                            {discount}% OFF
                          </span>
                        )}

                        <button
                          className={
                            saved
                              ? "wishlist-button saved"
                              : "wishlist-button"
                          }
                          type="button"
                          aria-label={
                            saved
                              ? "Remove from wishlist"
                              : "Add to wishlist"
                          }
                          aria-pressed={saved}
                          onClick={() => toggleWishlist(product)}
                        >
                          {saved ? "♥" : "♡"}
                        </button>

                        <button
                          type="button"
                          className={
                            outOfStock
                              ? "quick-add unavailable"
                              : "quick-add"
                          }
                          disabled={outOfStock || cartQuantity >= stock}
                          onClick={() => addToCart(product)}
                        >
                          {outOfStock
                            ? "Out of stock"
                            : cartQuantity >= stock
                              ? "Stock limit reached"
                              : "Add to bag"}
                          {!outOfStock && cartQuantity < stock && <span>+</span>}
                        </button>
                      </div>

                      <div className="product-info">
                        <div className="product-category">
                          {product.category}
                        </div>

                        <h3 title={product.name}>{product.name}</h3>

                        <div className="product-meta">
                          <span className="rating">
                            ★ {Number(product.rating).toFixed(1)}
                          </span>
                          <span>
                            ({Number(product.reviews_count).toLocaleString("en-IN")})
                          </span>
                          <span className="stock-status">
                            {outOfStock ? "Out of stock" : "In stock"}
                          </span>
                        </div>

                        <div className="product-price">
                          <strong>{formatPrice(product.price)}</strong>
                          {discount > 0 && (
                            <del>{formatPrice(product.original_price)}</del>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              (showWishlist || (!loading && !productError)) && (
                <div className="empty-state">
                  <span>⌕</span>
                  <h3>{showWishlist ? "No saved items found" : "No products found"}</h3>
                  <p>
                    {showWishlist && wishlistProducts.length === 0
                      ? "Use the heart on a product to save it here."
                      : "Try changing your search, category or price range."}
                  </p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={showWishlist ? () => setShowWishlist(false) : clearFilters}
                  >
                    {showWishlist ? "Continue shopping" : "Clear all filters"}
                  </button>
                </div>
              )
            )}

            {/* Pagination */}
            {(showWishlist || !priceRangeInvalid) && visibleTotalPages > 1 && (
              <nav className="pagination" aria-label="Product pages">
                <button
                  type="button"
                  disabled={(showWishlist ? page <= 1 : !pagination.hasPreviousPage) || (loading && !showWishlist)}
                  onClick={() => goToPage(Math.max(1, page - 1))}
                >
                  ← Previous
                </button>

                <div className="page-numbers">
                  {pageNumbers[0] > 1 && (
                    <>
                      <button type="button" onClick={() => goToPage(1)}>
                        1
                      </button>
                      {pageNumbers[0] > 2 && <span>...</span>}
                    </>
                  )}

                  {pageNumbers.map((number) => (
                    <button
                      type="button"
                      key={number}
                      className={page === number ? "current-page" : ""}
                      aria-current={page === number ? "page" : undefined}
                      disabled={loading && !showWishlist}
                      onClick={() => goToPage(number)}
                    >
                      {number}
                    </button>
                  ))}

                  {pageNumbers[pageNumbers.length - 1] <
                    visibleTotalPages && (
                    <>
                      {pageNumbers[pageNumbers.length - 1] <
                        visibleTotalPages - 1 && <span>...</span>}
                      <button
                        type="button"
                        onClick={() => goToPage(visibleTotalPages)}
                      >
                        {visibleTotalPages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={(showWishlist ? page >= visibleTotalPages : !pagination.hasNextPage) || (loading && !showWishlist)}
                  onClick={() => goToPage(page + 1)}
                >
                  Next →
                </button>
              </nav>
            )}
          </div>
        </section>

        {/* Brand story */}
        <section className="story-section" id="about">
          <div className="section-shell story-inner">
            <div className="story-mark">m.</div>

            <div className="story-content">
              <p className="eyebrow">A NOTE FROM MORROW</p>
              <h2>
                Less searching.
                <br />
                More finding what you love.
              </h2>
              <p>
                We bring everyday categories together in one place,
                making it easier to explore and discover useful finds.
              </p>
              <a href="#shop">Explore the collection ↗</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-shell footer-main">
          <div>
            <a className="brand footer-brand" href="#top">
              morrow<span>.</span>
            </a>
            <p>Good things for everyday living.</p>
          </div>

          <div className="footer-links">
            <a href="#shop">Shop</a>
            <a href="#categories">Categories</a>
            <a href="#about">Our story</a>
          </div>

          <a href="#top" className="back-to-top">
            Back to top ↑
          </a>
        </div>

        <div className="section-shell footer-bottom">
          <span>© 2026 Morrow. All rights reserved.</span>
          <span>12 collections · Everyday finds</span>
        </div>
      </footer>

      {/* Shopping cart drawer */}
      {cartOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setCartOpen(false)}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">YOUR PICKS</p>
                <h2>Your bag ({cartCount})</h2>
              </div>

              <button
                type="button"
                className="drawer-close"
                onClick={() => setCartOpen(false)}
                aria-label="Close shopping bag"
              >
                ×
              </button>
            </div>

            {orderConfirmation ? (
              <div className="checkout-success" role="status">
                <span>✓</span>
                <h3>Payment confirmed.</h3>
                <p>Your order #{orderConfirmation} has been placed.</p>
                <button
                  type="button"
                  className="checkout-button"
                  onClick={() => {
                    setOrderConfirmation("");
                    setCartOpen(false);
                  }}
                >
                  Continue shopping
                </button>
              </div>
            ) : cart.length > 0 ? (
              <>
                <div className="drawer-items">
                  {cart.map((item) => (
                    <div className="cart-item" key={item.product.id}>
                      <img
                        src={getProductPhoto(item.product)}
                        alt={item.product.name}
                        onError={(event) => {
                          if (!event.currentTarget.src.includes("photo-1490481651871-ab68de25d43d")) {
                            event.currentTarget.src = FALLBACK_PHOTO;
                          }
                        }}
                      />

                      <div className="cart-item-details">
                        <span className="product-category">
                          {item.product.category}
                        </span>
                        <h3>{item.product.name}</h3>
                        <strong>{formatPrice(item.product.price)}</strong>

                        <div className="quantity-control">
                          <button
                            type="button"
                            onClick={() =>
                              changeCartQuantity(item.product.id, -1)
                            }
                          >
                            −
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            type="button"
                            disabled={item.quantity >= Number(item.product.stock)}
                            onClick={() =>
                              changeCartQuantity(item.product.id, 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="remove-item"
                        onClick={() => removeFromCart(item.product.id)}
                        aria-label="Remove item"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="drawer-summary">
                  <div className="subtotal-row">
                    <span>Subtotal</span>
                    <strong>{formatPrice(cartSubtotal)}</strong>
                  </div>
                  <div className="subtotal-row shipping-row">
                    <span>Shipping</span>
                    <strong>
                      {cartSubtotal >= FREE_SHIPPING_THRESHOLD
                        ? "Free"
                        : formatPrice(SHIPPING_FEE)}
                    </strong>
                  </div>
                  <p>
                    {cartSubtotal >= FREE_SHIPPING_THRESHOLD
                      ? "Free delivery on this order."
                      : `Add ${formatPrice(FREE_SHIPPING_THRESHOLD - cartSubtotal)} for free shipping.`}
                    {" UPI checkout is securely verified."}
                  </p>
                  {paymentConfigError && (
                    <p className="checkout-error" role="alert">
                      {paymentConfigError}
                    </p>
                  )}
                  {paymentConfig && !paymentConfig.enabled && (
                    <p className="checkout-setup-note">
                      Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env to enable checkout.
                    </p>
                  )}
                  {checkoutError && (
                    <p className="checkout-error" role="alert">
                      {checkoutError}
                    </p>
                  )}

                  {checkoutOpen && (
                    <form className="checkout-form" onSubmit={beginCheckout}>
                      <label>
                        Full name
                        <input
                          autoComplete="name"
                          maxLength={100}
                          required
                          value={customer.name}
                          onChange={(event) =>
                            setCustomer({ ...customer, name: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Email address
                        <input
                          type="email"
                          autoComplete="email"
                          maxLength={254}
                          required
                          value={customer.email}
                          onChange={(event) =>
                            setCustomer({ ...customer, email: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Phone number
                        <input
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          pattern="[+0-9 ()-]{10,20}"
                          title="Enter a phone number with 10 to 15 digits."
                          required
                          value={customer.phone}
                          onChange={(event) =>
                            setCustomer({ ...customer, phone: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Delivery address
                        <textarea
                          autoComplete="street-address"
                          minLength={8}
                          maxLength={1000}
                          required
                          value={customer.address}
                          onChange={(event) =>
                            setCustomer({ ...customer, address: event.target.value })
                          }
                        />
                      </label>
                      <button
                        type="submit"
                        className="checkout-button"
                        disabled={checkoutLoading || !paymentConfig?.enabled}
                      >
                        {checkoutLoading ? "Connecting to UPI..." : `Pay ${formatPrice(cartSubtotal + (cartSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE))} with UPI`}
                      </button>
                    </form>
                  )}

                  {!checkoutOpen && (
                    <button
                      type="button"
                      className="checkout-button"
                      disabled={!paymentConfig?.enabled || Boolean(paymentConfigError)}
                      onClick={() => {
                        setCheckoutError("");
                        setCheckoutOpen(true);
                      }}
                    >
                      {paymentConfig?.enabled
                        ? "Continue to UPI checkout"
                        : "UPI checkout unavailable"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="continue-shopping"
                    onClick={() => {
                      if (checkoutOpen) {
                        setCheckoutOpen(false);
                        setCheckoutError("");
                      } else {
                        setCartOpen(false);
                      }
                    }}
                  >
                    {checkoutOpen ? "Back to bag" : "Continue shopping"}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-cart">
                <span>▢</span>
                <h3>Your bag is empty.</h3>
                <p>Discover something good for your everyday.</p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setCartOpen(false)}
                >
                  Continue shopping ↗
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Login and registration popup */}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onLogin={(loggedInUser) => setUser(loggedInUser)}
        />
      )}
    </div>
  );
}

export default App;
