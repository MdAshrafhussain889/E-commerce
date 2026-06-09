const state = {
  apiBase: localStorage.getItem("superHardwareApiBase") || "http://127.0.0.1:8000/api/v1",
  token: localStorage.getItem("superHardwareToken") || "",
  refreshToken: localStorage.getItem("superHardwareRefreshToken") || "",
  user: JSON.parse(localStorage.getItem("superHardwareUser") || "null"),
  sessionId: localStorage.getItem("superHardwareSessionId") || crypto.randomUUID(),
  categories: [],
  products: [],
  cart: { items: [], total_amount: 0, item_count: 0 },
  lowStockThreshold: 5,
  adminProducts: [],
  selectedAdminProductId: "",
};

localStorage.setItem("superHardwareSessionId", state.sessionId);

const els = {
  apiBaseInput: document.querySelector("#apiBaseInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  toast: document.querySelector("#toast"),
  viewTitle: document.querySelector("#viewTitle"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  userBadge: document.querySelector("#userBadge"),
  authForms: document.querySelector("#authForms"),
  signedInPanel: document.querySelector("#signedInPanel"),
  signedInText: document.querySelector("#signedInText"),
  logoutBtn: document.querySelector("#logoutBtn"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  productsGrid: document.querySelector("#productsGrid"),
  productCount: document.querySelector("#productCount"),
  categoryFilter: document.querySelector("#categoryFilter"),
  productCategorySelect: document.querySelector("#productForm select[name='category_id']"),
  searchInput: document.querySelector("#searchInput"),
  minPrice: document.querySelector("#minPrice"),
  maxPrice: document.querySelector("#maxPrice"),
  inStockOnly: document.querySelector("#inStockOnly"),
  applyFiltersBtn: document.querySelector("#applyFiltersBtn"),
  cartItems: document.querySelector("#cartItems"),
  cartCount: document.querySelector("#cartCount"),
  cartTotal: document.querySelector("#cartTotal"),
  checkoutBtn: document.querySelector("#checkoutBtn"),
  clearCartBtn: document.querySelector("#clearCartBtn"),
  checkoutDialog: document.querySelector("#checkoutDialog"),
  checkoutForm: document.querySelector("#checkoutForm"),
  billDialog: document.querySelector("#billDialog"),
  billContent: document.querySelector("#billContent"),
  printBillBtn: document.querySelector("#printBillBtn"),
  closeBillBtn: document.querySelector("#closeBillBtn"),
  ordersList: document.querySelector("#ordersList"),
  stockAlerts: document.querySelector("#stockAlerts"),
  stockAlertCount: document.querySelector("#stockAlertCount"),
  productForm: document.querySelector("#productForm"),
  adminProductsList: document.querySelector("#adminProductsList"),
  loadAdminProductsBtn: document.querySelector("#loadAdminProductsBtn"),
  adminTabs: document.querySelectorAll("[data-admin-page]"),
  adminPages: document.querySelectorAll(".admin-page"),
  adminPageShortcuts: document.querySelectorAll("[data-admin-page-shortcut]"),
  adminProductSearch: document.querySelector("#adminProductSearch"),
  adminCategoryFilter: document.querySelector("#adminCategoryFilter"),
  adminStockFilter: document.querySelector("#adminStockFilter"),
  adminOrdersList: document.querySelector("#adminOrdersList"),
  loadAdminOrdersBtn: document.querySelector("#loadAdminOrdersBtn"),
  departmentButtons: document.querySelectorAll("[data-dept]"),
  viewShortcuts: document.querySelectorAll("[data-view-shortcut]"),
};

els.apiBaseInput.value = state.apiBase;

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 3600);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Session-Id": state.sessionId,
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers,
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : `Request failed: ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function persistAuth(payload, user) {
  state.token = payload?.access_token || "";
  state.refreshToken = payload?.refresh_token || "";
  state.user = user || null;
  localStorage.setItem("superHardwareToken", state.token);
  localStorage.setItem("superHardwareRefreshToken", state.refreshToken);
  localStorage.setItem("superHardwareUser", JSON.stringify(state.user));
  renderAuth();
}

function clearAuth() {
  state.token = "";
  state.refreshToken = "";
  state.user = null;
  localStorage.removeItem("superHardwareToken");
  localStorage.removeItem("superHardwareRefreshToken");
  localStorage.removeItem("superHardwareUser");
  renderAuth();
}

function renderAuth() {
  if (state.user) {
    els.userBadge.textContent = state.user.role;
    els.userBadge.classList.remove("muted");
    els.authForms.classList.add("hidden");
    els.signedInPanel.classList.remove("hidden");
    els.signedInText.textContent = `${state.user.name} (${state.user.email})`;
    return;
  }

  els.userBadge.textContent = "Guest";
  els.userBadge.classList.add("muted");
  els.authForms.classList.remove("hidden");
  els.signedInPanel.classList.add("hidden");
  els.signedInText.textContent = "";
}

function renderCategories() {
  const options = [`<option value="">All categories</option>`]
    .concat(state.categories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`))
    .join("");
  els.categoryFilter.innerHTML = options;
  if (els.adminCategoryFilter) {
    els.adminCategoryFilter.innerHTML = options;
  }

  els.productCategorySelect.innerHTML = [`<option value="">No category</option>`]
    .concat(state.categories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`))
    .join("");
}

function productInitial(name) {
  return (name || "SH")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderProducts() {
  els.productCount.textContent = `${state.products.length} shown`;
  if (!state.products.length) {
    els.productsGrid.innerHTML = `<div class="empty">No products found.</div>`;
    return;
  }

  els.productsGrid.innerHTML = state.products
    .map((product) => {
      const stock = Number(product.stock_available || 0);
      const stockLabel = stock <= 0 ? "Out of stock" : stock <= state.lowStockThreshold ? `Only ${stock} left` : `${stock} in stock`;
      const stockLevel = stock <= 0 ? "danger" : stock <= state.lowStockThreshold ? "warn" : "ok";
      const image = product.image_url
        ? `<img src="${product.image_url}" alt="${product.name}">`
        : `<div class="product-visual">${productInitial(product.name)}</div>`;
      return `
        <article class="product-card">
          <div class="product-media">
            ${image}
            <span class="stock-chip ${stockLevel}">${stockLabel}</span>
          </div>
          <div class="product-body">
            <div>
              <p class="product-category">${product.category?.name || "General"}</p>
              <div class="product-name">${product.name}</div>
              <p class="muted-text">${product.description || "Hardware product"}</p>
            </div>
            <div class="product-meta">
              <strong class="price">${money(product.price)}</strong>
              <button data-add-product="${product.id}" ${stock <= 0 ? "disabled" : ""} type="button">Add</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCart() {
  els.cartCount.textContent = `${state.cart.item_count || 0} items`;
  els.cartTotal.textContent = money(state.cart.total_amount);
  els.checkoutBtn.disabled = !state.cart.items.length;
  els.clearCartBtn.disabled = !state.cart.items.length;

  if (!state.cart.items.length) {
    els.cartItems.innerHTML = `<div class="empty">Cart is empty.</div>`;
    return;
  }

  els.cartItems.innerHTML = state.cart.items
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <strong>${item.product_name}</strong>
          <p class="muted-text">${money(item.product_price)} x ${item.quantity}</p>
        </div>
        <div class="qty-control">
          <button data-cart-dec="${item.id}" type="button">-</button>
          <strong>${item.quantity}</strong>
          <button data-cart-inc="${item.id}" type="button">+</button>
        </div>
      </div>
    `,
    )
    .join("");
}

function orderStatusBadge(status) {
  const label = String(status || "pending");
  return `<span class="badge">${label}</span>`;
}

function billNumber(order) {
  return `SHB-${String(order.id).slice(0, 8).toUpperCase()}`;
}

function orderDate(order) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(order.created_at));
}

function renderBill(order) {
  const rows = order.items
    .map((item, index) => {
      const lineTotal = Number(item.price_at_purchase || 0) * Number(item.quantity || 0);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.product_name || item.product_id)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.price_at_purchase)}</td>
          <td class="num">${money(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const address = order.delivery_address || {};
  return `
    <section class="bill-paper">
      <header class="bill-header">
        <div>
          <h2>Super Hardware & Paints</h2>
          <p>Shop No. 9-183/5, CMC Complex, Opp. Bus Stand, Bidar - 585401</p>
          <p>Phone: 9342371525 | Open daily 9:00 am - 9:30 pm</p>
        </div>
        <div class="bill-meta">
          <strong>Bill</strong>
          <span>${billNumber(order)}</span>
        </div>
      </header>

      <div class="bill-info-grid">
        <div>
          <span>Bill Date</span>
          <strong>${orderDate(order)}</strong>
        </div>
        <div>
          <span>Order ID</span>
          <strong>${escapeHtml(order.id)}</strong>
        </div>
        <div>
          <span>Payment</span>
          <strong>${escapeHtml(order.payment_method || "cod").toUpperCase()}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>${escapeHtml(order.status)}</strong>
        </div>
      </div>

      <div class="bill-address">
        <span>Customer / Delivery Address</span>
        <p>${escapeHtml(address.street || "")}, ${escapeHtml(address.city || "")}, ${escapeHtml(address.state || "")} ${escapeHtml(address.postal_code || "")}</p>
      </div>

      <table class="bill-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Product</th>
            <th class="num">Qty</th>
            <th class="num">Rate</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="bill-total">
        <span>Grand Total</span>
        <strong>${money(order.total_amount)}</strong>
      </div>

      <footer class="bill-footer">
        <p>Thank you for shopping with Super Hardware & Paints, Bidar.</p>
        <p>Goods once sold are subject to shop return policy.</p>
      </footer>
    </section>
  `;
}

function showBill(order) {
  els.billContent.innerHTML = renderBill(order);
  els.billDialog.showModal();
}

function renderOrders(target, orders, isAdmin = false) {
  if (!orders.length) {
    target.innerHTML = `<div class="empty">No orders found.</div>`;
    return;
  }

  target.innerHTML = orders
    .map((order) => {
      const lines = order.items
        .map((item) => `<span>${item.quantity} x ${item.product_name || item.product_id} at ${money(item.price_at_purchase)}</span>`)
        .join("");
      const statusControl = isAdmin
        ? `
          <form class="admin-status" data-order-status="${order.id}">
            <select name="status">
              ${["pending", "processing", "ready", "shipped", "delivered"]
                .map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
            <button type="submit">Save</button>
          </form>`
        : orderStatusBadge(order.status);

      return `
        <article class="order-card">
          <div class="order-head">
            <div>
              <strong>${money(order.total_amount)}</strong>
              <div class="order-id">${order.id}</div>
            </div>
            ${statusControl}
          </div>
          <div class="order-lines">${lines}</div>
          <p class="muted-text">${order.delivery_address.street}, ${order.delivery_address.city}, ${order.delivery_address.state} ${order.delivery_address.postal_code}</p>
          <div class="order-actions">
            <button data-view-bill="${order.id}" type="button">View Bill</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function categoryOptions(selectedId) {
  return [`<option value="">No category</option>`]
    .concat(
      state.categories.map(
        (cat) => `<option value="${cat.id}" ${cat.id === selectedId ? "selected" : ""}>${cat.name}</option>`,
      ),
    )
    .join("");
}

function stockStatus(product) {
  const stock = Number(product.stock_available || 0);
  if (stock <= 0) {
    return { label: "Out of stock", level: "danger" };
  }
  if (stock <= state.lowStockThreshold) {
    return { label: `Low stock: ${stock}`, level: "warn" };
  }
  return { label: `Stock: ${stock}`, level: "ok" };
}

function renderStockAlerts(products) {
  const alerts = products
    .filter((product) => product.is_active && Number(product.stock_available || 0) <= state.lowStockThreshold)
    .sort((a, b) => Number(a.stock_available || 0) - Number(b.stock_available || 0));

  els.stockAlertCount.textContent = `${alerts.length} alerts`;
  els.stockAlertCount.classList.toggle("muted", alerts.length === 0);

  if (!alerts.length) {
    els.stockAlerts.innerHTML = `<div class="empty">All active products have more than ${state.lowStockThreshold} units.</div>`;
    return;
  }

  els.stockAlerts.innerHTML = alerts
    .map((product) => {
      const stock = Number(product.stock_available || 0);
      const status = stockStatus(product);
      return `
        <div class="stock-alert ${status.level}">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <p class="muted-text">${escapeHtml(product.category?.name || "General")}</p>
          </div>
          <span class="badge ${status.level === "danger" ? "danger" : "warn"}">${status.label}</span>
        </div>
      `;
    })
    .join("");
}

function filteredAdminProducts() {
  const search = els.adminProductSearch?.value.trim().toLowerCase() || "";
  const categoryId = els.adminCategoryFilter?.value || "";
  const stockFilter = els.adminStockFilter?.value || "";

  return state.adminProducts.filter((product) => {
    const stock = Number(product.stock_available || 0);
    const matchesSearch =
      !search ||
      product.name.toLowerCase().includes(search) ||
      (product.description || "").toLowerCase().includes(search);
    const matchesCategory = !categoryId || product.category_id === categoryId;
    const matchesStock =
      !stockFilter ||
      (stockFilter === "low" && product.is_active && stock > 0 && stock <= state.lowStockThreshold) ||
      (stockFilter === "out" && product.is_active && stock <= 0) ||
      (stockFilter === "inactive" && !product.is_active);
    return matchesSearch && matchesCategory && matchesStock;
  });
}

function renderAdminProducts(products = filteredAdminProducts()) {
  if (!products.length) {
    els.adminProductsList.innerHTML = `<div class="empty">No products found.</div>`;
    return;
  }

  els.adminProductsList.innerHTML = products
    .map(
      (product) => {
        const stock = stockStatus(product);
        const isSelected = product.id === state.selectedAdminProductId;
        const editForm = isSelected
          ? `
            <form class="admin-product-form expanded" data-product-edit="${product.id}">
              <p class="muted-text edit-hint">Edit price, stock, category, and availability.</p>
              <input name="name" value="${escapeHtml(product.name)}" placeholder="Product name" required>
              <textarea name="description" placeholder="Description">${escapeHtml(product.description || "")}</textarea>
              <div class="split">
                <input name="price" type="number" min="1" step="0.01" value="${product.price}" placeholder="Price" required>
                <input name="stock" type="number" min="0" step="1" value="${product.stock_available}" placeholder="Stock" required>
              </div>
              <select name="category_id">${categoryOptions(product.category_id)}</select>
              <input name="image_url" value="${escapeHtml(product.image_url || "")}" placeholder="Image URL">
              <div class="admin-product-actions">
                <button class="primary" type="submit">Save</button>
                ${
                  product.is_active
                    ? `<button data-product-deactivate="${product.id}" type="button">Deactivate</button>`
                    : `<button data-product-activate="${product.id}" type="button">Reactivate</button>`
                }
              </div>
            </form>
          `
          : "";
        return `
      <article class="admin-product-card ${product.is_active ? "" : "inactive"} ${stock.level} ${isSelected ? "selected" : ""}">
          <button class="admin-product-summary" data-product-select="${product.id}" type="button">
            <div>
              <strong>${escapeHtml(product.name)}</strong>
              <p class="muted-text">${escapeHtml(product.category?.name || "General")} &middot; ${money(product.price)}</p>
            </div>
            <div class="badge-row">
              <span class="badge ${stock.level}">${stock.label}</span>
              <span class="badge ${product.is_active ? "" : "muted"}">${product.is_active ? "Active" : "Inactive"}</span>
            </div>
          </button>
          ${editForm}
      </article>
    `;
      },
    )
    .join("");
}

function setAdminPage(pageName) {
  els.adminTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminPage === pageName));
  els.adminPages.forEach((page) => {
    const id = page.id.replace("admin", "").replace("Page", "").toLowerCase();
    page.classList.toggle("active", id === pageName);
  });
  if (pageName === "products") {
    loadAdminProducts();
  }
  if (pageName === "stock") {
    loadAdminProducts();
  }
  if (pageName === "orders") {
    loadAdminOrders();
  }
}

function setView(viewName) {
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  els.viewTitle.textContent = {
    shop: "Storefront",
    orders: "My Orders",
    admin: "Admin",
  }[viewName];

  if (viewName === "orders") {
    loadMyOrders();
  }
  if (viewName === "admin" && state.user?.role === "admin") {
    setAdminPage(document.querySelector(".admin-tab.active")?.dataset.adminPage || "stock");
  }
}

function getFilters() {
  const params = new URLSearchParams({ page_size: "100" });
  if (els.categoryFilter.value) params.set("category_id", els.categoryFilter.value);
  if (els.minPrice.value) params.set("min_price", els.minPrice.value);
  if (els.maxPrice.value) params.set("max_price", els.maxPrice.value);
  if (els.inStockOnly.checked) params.set("in_stock", "true");
  return params;
}

async function loadCategories() {
  state.categories = await api("/categories");
  renderCategories();
}

async function loadProducts() {
  const q = els.searchInput.value.trim();
  const path = q ? `/products/search?q=${encodeURIComponent(q)}&page_size=100` : `/products?${getFilters()}`;
  const data = await api(path);
  state.products = data.items || [];
  renderProducts();
}

async function loadCart() {
  state.cart = await api("/cart");
  renderCart();
}

async function loadMyOrders() {
  if (!state.token) {
    els.ordersList.innerHTML = `<div class="empty">Sign in to view orders.</div>`;
    return;
  }
  try {
    renderOrders(els.ordersList, await api("/orders"));
  } catch (error) {
    els.ordersList.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

async function loadAdminOrders() {
  if (state.user?.role !== "admin") {
    els.adminOrdersList.innerHTML = `<div class="empty">Sign in as an admin to load orders.</div>`;
    return;
  }
  renderOrders(els.adminOrdersList, await api("/orders/admin/all"), true);
}

async function loadAdminProducts() {
  if (state.user?.role !== "admin") {
    els.adminProductsList.innerHTML = `<div class="empty">Sign in as an admin to manage products.</div>`;
    els.stockAlerts.innerHTML = `<div class="empty">Sign in as an admin to view stock reminders.</div>`;
    return;
  }
  state.adminProducts = await api("/products/admin/all");
  renderStockAlerts(state.adminProducts);
  renderAdminProducts();
}

async function refreshAll() {
  try {
    localStorage.setItem("superHardwareApiBase", state.apiBase);
    await loadCategories();
    await loadProducts();
    await loadCart();
    if (state.user?.role === "admin") {
      await loadAdminProducts();
    }
    renderAuth();
  } catch (error) {
    showToast(error.message, true);
  }
}

els.navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));

els.viewShortcuts.forEach((item) => item.addEventListener("click", () => setView(item.dataset.viewShortcut)));

els.adminTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAdminPage(tab.dataset.adminPage));
});

els.adminPageShortcuts.forEach((shortcut) => {
  shortcut.addEventListener("click", () => {
    setView("admin");
    setAdminPage(shortcut.dataset.adminPageShortcut);
  });
});

["input", "change"].forEach((eventName) => {
  els.adminProductSearch?.addEventListener(eventName, () => renderAdminProducts());
  els.adminCategoryFilter?.addEventListener(eventName, () => renderAdminProducts());
  els.adminStockFilter?.addEventListener(eventName, () => renderAdminProducts());
});

els.departmentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const category = state.categories.find((cat) => cat.name === button.dataset.dept);
    if (category) {
      els.categoryFilter.value = category.id;
      setView("shop");
      loadProducts();
    }
  });
});

els.refreshBtn.addEventListener("click", refreshAll);
els.apiBaseInput.addEventListener("change", () => {
  state.apiBase = els.apiBaseInput.value.replace(/\/$/, "");
  refreshAll();
});

els.applyFiltersBtn.addEventListener("click", loadProducts);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadProducts();
});

els.productsGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-product]");
  if (!button) return;
  try {
    await api("/cart/items", {
      method: "POST",
      body: JSON.stringify({ product_id: button.dataset.addProduct, quantity: 1 }),
    });
    await loadCart();
    showToast("Added to cart");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.cartItems.addEventListener("click", async (event) => {
  const inc = event.target.closest("[data-cart-inc]");
  const dec = event.target.closest("[data-cart-dec]");
  const id = inc?.dataset.cartInc || dec?.dataset.cartDec;
  if (!id) return;

  const current = state.cart.items.find((item) => item.id === id);
  const nextQty = Number(current.quantity) + (inc ? 1 : -1);

  try {
    if (nextQty <= 0) {
      await api(`/cart/items/${id}`, { method: "DELETE" });
    } else {
      await api(`/cart/items/${id}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: nextQty }),
      });
    }
    await loadCart();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.clearCartBtn.addEventListener("click", async () => {
  try {
    await api("/cart/clear", { method: "POST" });
    await loadCart();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.checkoutBtn.addEventListener("click", () => {
  if (!state.token) {
    showToast("Sign in before checkout.", true);
    return;
  }
  els.checkoutDialog.showModal();
});

els.checkoutForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const form = new FormData(els.checkoutForm);
  try {
    const order = await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        use_cart: true,
        payment_method: "cod",
        delivery_address: Object.fromEntries(form.entries()),
      }),
    });
    els.checkoutDialog.close();
    els.checkoutForm.reset();
    await loadCart();
    await loadProducts();
    showToast("Order placed");
    showBill(order);
  } catch (error) {
    showToast(error.message, true);
  }
});

els.printBillBtn.addEventListener("click", () => {
  window.print();
});

els.closeBillBtn.addEventListener("click", () => {
  els.billDialog.close();
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.loginForm).entries());
  try {
    const tokens = await api("/auth/login", { method: "POST", body: JSON.stringify(values) });
    state.token = tokens.access_token;
    const user = await api("/users/profile");
    persistAuth(tokens, user);
    await loadCart();
    showToast("Signed in");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.registerForm).entries());
  if (!values.phone) delete values.phone;
  try {
    await api("/auth/register", { method: "POST", body: JSON.stringify(values) });
    showToast("Account created. Sign in to continue.");
    els.registerForm.reset();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  clearAuth();
  await loadCart();
  showToast("Signed out");
});

els.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.productForm);
  const payload = Object.fromEntries(form.entries());
  payload.price = Number(payload.price);
  payload.stock = Number(payload.stock);
  if (!payload.category_id) payload.category_id = null;
  if (!payload.image_url) payload.image_url = null;

  try {
    await api("/products", { method: "POST", body: JSON.stringify(payload) });
    els.productForm.reset();
    await loadProducts();
    await loadAdminProducts();
    showToast("Product created");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.loadAdminProductsBtn.addEventListener("click", async () => {
  try {
    await loadAdminProducts();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.adminProductsList.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-product-edit]");
  if (!form) return;
  event.preventDefault();

  const values = Object.fromEntries(new FormData(form).entries());
  const productId = form.dataset.productEdit;
  const stock = Number(values.stock);
  const productPayload = {
    name: values.name,
    description: values.description || null,
    price: Number(values.price),
    category_id: values.category_id || null,
    image_url: values.image_url || null,
  };

  try {
    await api(`/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(productPayload),
    });
    await api(`/products/${productId}/inventory`, {
      method: "PUT",
      body: JSON.stringify({ stock }),
    });
    await loadProducts();
    await loadAdminProducts();
    showToast("Product updated");
  } catch (error) {
    showToast(error.message, true);
  }
});

els.adminProductsList.addEventListener("click", async (event) => {
  const selected = event.target.closest("[data-product-select]");
  if (selected) {
    state.selectedAdminProductId = state.selectedAdminProductId === selected.dataset.productSelect ? "" : selected.dataset.productSelect;
    renderAdminProducts();
    return;
  }

  const deactivate = event.target.closest("[data-product-deactivate]");
  const activate = event.target.closest("[data-product-activate]");
  const productId = deactivate?.dataset.productDeactivate || activate?.dataset.productActivate;
  if (!productId) return;

  try {
    if (deactivate) {
      await api(`/products/${productId}`, { method: "DELETE" });
      showToast("Product deactivated");
    } else {
      await api(`/products/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      });
      showToast("Product reactivated");
    }
    await loadProducts();
    await loadAdminProducts();
  } catch (error) {
    showToast(error.message, true);
  }
});

els.loadAdminOrdersBtn.addEventListener("click", async () => {
  try {
    await loadAdminOrders();
  } catch (error) {
    showToast(error.message, true);
  }
});

async function openOrderBill(orderId, isAdmin = false) {
  try {
    if (isAdmin) {
      const orders = await api("/orders/admin/all");
      const order = orders.find((item) => item.id === orderId);
      if (!order) throw new Error("Order not found");
      showBill(order);
      return;
    }
    showBill(await api(`/orders/${orderId}`));
  } catch (error) {
    showToast(error.message, true);
  }
}

els.ordersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view-bill]");
  if (!button) return;
  await openOrderBill(button.dataset.viewBill, false);
});

els.adminOrdersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view-bill]");
  if (!button) return;
  await openOrderBill(button.dataset.viewBill, true);
});

els.adminOrdersList.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-order-status]");
  if (!form) return;
  event.preventDefault();
  try {
    await api(`/orders/${form.dataset.orderStatus}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: new FormData(form).get("status") }),
    });
    await loadAdminOrders();
    showToast("Order status updated");
  } catch (error) {
    showToast(error.message, true);
  }
});

renderAuth();
refreshAll();
