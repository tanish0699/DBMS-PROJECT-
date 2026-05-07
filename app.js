/* ============================================================
   SMART INVENTORY MANAGEMENT — APP LOGIC
   UCS310 | Group 2C71 | TIET Patiala
   Uses sql.js (WebAssembly SQLite) to run real SQL in browser
   ============================================================ */

"use strict";

let DB = null;
const TODAY = new Date().toISOString().split("T")[0];

/* ══════════════════════════════════════════════════════════
   INIT — load sql.js, build schema, seed data
   ══════════════════════════════════════════════════════════ */
async function initApp() {
  try {
    setLoader(10, "Loading WebAssembly SQL engine…");
    const SQL = await initSqlJs({
      locateFile: (f) =>
        `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`,
    });
    setLoader(35, "Creating database schema…");
    DB = new SQL.Database();
    buildSchema();
    setLoader(60, "Loading seed data…");
    seedData();
    setLoader(80, "Building views & indexes…");
    buildIndexes();
    setLoader(100, "Ready!");
    await sleep(300);
    document.getElementById("loader").classList.add("out");
    document.getElementById("app").style.display = "block";
    gotoPage("dashboard");
  } catch (e) {
    setLoader(0, "❌ Error: " + e.message);
    document.getElementById("ld-status").style.color = "var(--red)";
  }
}

function setLoader(pct, msg) {
  document.getElementById("ld-fill").style.width = pct + "%";
  document.getElementById("ld-status").textContent = msg;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════
   SQL HELPERS
   ══════════════════════════════════════════════════════════ */
function dbRun(sql, params = []) {
  DB.run(sql, params);
}

function dbQuery(sql, params = []) {
  try {
    const r = DB.exec(sql, params);
    return r.length ? r[0] : { columns: [], values: [] };
  } catch (e) {
    throw e;
  }
}

function dbLastId() {
  return DB.exec("SELECT last_insert_rowid()")[0].values[0][0];
}

function dateAdd(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/* ══════════════════════════════════════════════════════════
   SCHEMA — mirrors database.sql exactly
   ══════════════════════════════════════════════════════════ */
function buildSchema() {
  const tables = [
    `CREATE TABLE Category (
      CategoryID   INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryName TEXT NOT NULL)`,

    `CREATE TABLE Supplier (
      SupplierID   INTEGER PRIMARY KEY AUTOINCREMENT,
      SupplierName TEXT,
      ContactInfo  TEXT,
      Rating       REAL DEFAULT 0)`,

    `CREATE TABLE Product (
      ProductID    INTEGER PRIMARY KEY AUTOINCREMENT,
      Name         TEXT,
      CategoryID   INTEGER,
      SupplierID   INTEGER,
      UnitPrice    REAL,
      ReorderLevel INTEGER,
      FOREIGN KEY(CategoryID) REFERENCES Category(CategoryID),
      FOREIGN KEY(SupplierID) REFERENCES Supplier(SupplierID))`,

    `CREATE TABLE Branch (
      BranchID   INTEGER PRIMARY KEY AUTOINCREMENT,
      BranchName TEXT,
      Location   TEXT)`,

    `CREATE TABLE Inventory (
      BranchID   INTEGER,
      ProductID  INTEGER,
      Quantity   INTEGER DEFAULT 0,
      ExpiryDate TEXT,
      PRIMARY KEY(BranchID, ProductID),
      FOREIGN KEY(BranchID)  REFERENCES Branch(BranchID),
      FOREIGN KEY(ProductID) REFERENCES Product(ProductID))`,

    `CREATE TABLE Sale (
      SaleID      INTEGER PRIMARY KEY AUTOINCREMENT,
      BranchID    INTEGER,
      SaleDate    TEXT DEFAULT CURRENT_TIMESTAMP,
      TotalAmount REAL,
      FOREIGN KEY(BranchID) REFERENCES Branch(BranchID))`,

    `CREATE TABLE Sale_Item (
      SaleID    INTEGER,
      ProductID INTEGER,
      Quantity  INTEGER,
      UnitPrice REAL,
      PRIMARY KEY(SaleID, ProductID),
      FOREIGN KEY(SaleID)    REFERENCES Sale(SaleID),
      FOREIGN KEY(ProductID) REFERENCES Product(ProductID))`,

    `CREATE TABLE Purchase_Order (
      OrderID    INTEGER PRIMARY KEY AUTOINCREMENT,
      SupplierID INTEGER,
      OrderDate  TEXT DEFAULT CURRENT_TIMESTAMP,
      Status     TEXT,
      FOREIGN KEY(SupplierID) REFERENCES Supplier(SupplierID))`,

    `CREATE TABLE Order_Item (
      OrderID   INTEGER,
      ProductID INTEGER,
      Quantity  INTEGER,
      UnitPrice REAL,
      PRIMARY KEY(OrderID, ProductID),
      FOREIGN KEY(OrderID)   REFERENCES Purchase_Order(OrderID),
      FOREIGN KEY(ProductID) REFERENCES Product(ProductID))`,

    `CREATE TABLE Inventory_Log (
      LogID       INTEGER PRIMARY KEY AUTOINCREMENT,
      BranchID    INTEGER,
      ProductID   INTEGER,
      OldQuantity INTEGER,
      NewQuantity INTEGER,
      ChangeDate  TEXT DEFAULT CURRENT_TIMESTAMP,
      ActionType  TEXT)`,
  ];
  tables.forEach((t) => dbRun(t));
}

function buildIndexes() {
  dbRun("CREATE INDEX IF NOT EXISTS idx_product_name ON Product(Name)");
  dbRun("CREATE INDEX IF NOT EXISTS idx_expiry ON Inventory(ExpiryDate)");
  dbRun("CREATE INDEX IF NOT EXISTS idx_sale_date ON Sale(SaleDate)");
  dbRun("CREATE INDEX IF NOT EXISTS idx_sup_rating ON Supplier(Rating)");
}

/* ══════════════════════════════════════════════════════════
   SEED DATA — matches database.sql sample data
   ══════════════════════════════════════════════════════════ */
function seedData() {
  ["Beverages", "Snacks", "Dairy", "Personal Care"].forEach((c) =>
    dbRun("INSERT INTO Category(CategoryName) VALUES(?)", [c])
  );

  [
    ["Nestle Supplies", "nestle@email.com", 4.5],
    ["Amul Distributor", "amul@email.com", 4.2],
    ["Hindustan Unilever", "hul@email.com", 4.7],
    ["Pepsi Supplier", "pepsi@email.com", 4.1],
  ].forEach((s) =>
    dbRun("INSERT INTO Supplier(SupplierName,ContactInfo,Rating) VALUES(?,?,?)", s)
  );

  [
    ["Patiala Branch", "Patiala"],
    ["Chandigarh Branch", "Chandigarh"],
    ["Delhi Branch", "Delhi"],
  ].forEach((b) =>
    dbRun("INSERT INTO Branch(BranchName,Location) VALUES(?,?)", b)
  );

  [
    ["Pepsi 500ml", 1, 4, 40.0, 20],
    ["Lays Chips", 2, 1, 20.0, 30],
    ["Amul Milk 1L", 3, 2, 60.0, 15],
    ["Shampoo Bottle", 4, 3, 150.0, 10],
  ].forEach((p) =>
    dbRun(
      "INSERT INTO Product(Name,CategoryID,SupplierID,UnitPrice,ReorderLevel) VALUES(?,?,?,?,?)",
      p
    )
  );

  const inv = [
    [1, 1, 50, dateAdd(TODAY, 18)],
    [1, 2, 80, dateAdd(TODAY, 101)],
    [1, 3, 25, dateAdd(TODAY, 6)],
    [1, 4, 15, null],
    [2, 1, 30, dateAdd(TODAY, 20)],
    [2, 2, 60, dateAdd(TODAY, 101)],
    [2, 3, 10, dateAdd(TODAY, 4)],
    [2, 4, 12, null],
    [3, 1, 20, dateAdd(TODAY, 20)],
    [3, 2, 45, dateAdd(TODAY, 101)],
    [3, 3, 8, dateAdd(TODAY, 2)],
    [3, 4, 18, null],
  ];
  inv.forEach((r) =>
    dbRun(
      "INSERT INTO Inventory(BranchID,ProductID,Quantity,ExpiryDate) VALUES(?,?,?,?)",
      r
    )
  );

  // One initial sale so dashboard isn't empty
  dbRun(
    `INSERT INTO Sale(BranchID,SaleDate,TotalAmount) VALUES(1,'${TODAY}T09:00:00',200.00)`
  );
  dbRun(
    "INSERT INTO Sale_Item(SaleID,ProductID,Quantity,UnitPrice) VALUES(1,1,5,40.00)"
  );
  dbRun(
    `INSERT INTO Inventory_Log(BranchID,ProductID,OldQuantity,NewQuantity,ChangeDate,ActionType)
     VALUES(1,1,55,50,'${TODAY}T09:00:00','Sale - ProcessSale()')`
  );
}

/* ══════════════════════════════════════════════════════════
   GetSupplierStatus() — mirrors the SQL FUNCTION
   ══════════════════════════════════════════════════════════ */
function getSupplierStatus(r) {
  if (r >= 4.5) return '<span class="pill pill-g">Excellent</span>';
  if (r >= 3.5) return '<span class="pill pill-b">Good</span>';
  return '<span class="pill pill-o">Average</span>';
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════ */
function gotoPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const pg = document.getElementById("page-" + id);
  if (pg) pg.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((n) => {
    if (n.dataset.page === id) n.classList.add("active");
  });
  clearAlert();
  refreshPage(id);
  closeSidebar();
}

const pageRefreshMap = {
  dashboard: refreshDashboard,
  products: refreshProducts,
  inventory: refreshInventory,
  sales: refreshSales,
  transfer: refreshTransfer,
  suppliers: refreshSuppliers,
  orders: refreshOrders,
  reports: refreshReports,
  alerts: refreshAlerts,
  auditlog: refreshAuditLog,
  sqleditor: () => {},
};

function refreshPage(id) {
  if (pageRefreshMap[id]) pageRefreshMap[id]();
}

/* ── sidebar toggle (mobile) ── */
function openSidebar() {
  document.querySelector(".sidebar").classList.add("open");
  document.querySelector(".sidebar-overlay").classList.add("active");
}
function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.querySelector(".sidebar-overlay").classList.remove("active");
}

/* ══════════════════════════════════════════════════════════
   SELECT POPULATORS
   ══════════════════════════════════════════════════════════ */
function fillSelect(id, sql, valCol, lblCol) {
  const el = document.getElementById(id);
  if (!el) return;
  const d = dbQuery(sql);
  const vi = d.columns.indexOf(valCol);
  const li = d.columns.indexOf(lblCol);
  el.innerHTML = d.values
    .map((r) => `<option value="${r[vi]}">${r[li]}</option>`)
    .join("");
}

function populateAllSelects() {
  fillSelect("p-cat", "SELECT CategoryID,CategoryName FROM Category", "CategoryID", "CategoryName");
  fillSelect("p-sup", "SELECT SupplierID,SupplierName FROM Supplier", "SupplierID", "SupplierName");
  fillSelect("inv-branch", "SELECT BranchID,BranchName FROM Branch", "BranchID", "BranchName");
  fillSelect("inv-product", "SELECT ProductID,Name FROM Product", "ProductID", "Name");
  fillSelect("s-branch", "SELECT BranchID,BranchName FROM Branch", "BranchID", "BranchName");
  fillSelect("s-product", "SELECT ProductID,Name FROM Product", "ProductID", "Name");
  fillSelect("t-from", "SELECT BranchID,BranchName FROM Branch", "BranchID", "BranchName");
  fillSelect("t-to", "SELECT BranchID,BranchName FROM Branch", "BranchID", "BranchName");
  fillSelect("t-product", "SELECT ProductID,Name FROM Product", "ProductID", "Name");
}

/* ══════════════════════════════════════════════════════════
   TABLE RENDERER
   ══════════════════════════════════════════════════════════ */
function renderTable(tableId, data, rowFn, emptyMsg = "No records yet") {
  const tbody = document.querySelector("#" + tableId + " tbody");
  if (!tbody) return;
  if (!data.values || !data.values.length) {
    tbody.innerHTML = `<tr><td colspan="20">
      <div class="empty"><div class="empty-icon">📭</div>
      <div class="empty-txt">${emptyMsg}</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.values.map((r, i) => rowFn(r, data.columns, i)).join("");
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
function refreshDashboard() {
  setText("d-products", dbQuery("SELECT COUNT(*) FROM Product").values[0][0]);
  setText("d-branches", dbQuery("SELECT COUNT(*) FROM Branch").values[0][0]);
  const revenue = dbQuery("SELECT COALESCE(SUM(TotalAmount),0) FROM Sale").values[0][0];
  setText("d-sales", "₹" + fmtMoney(revenue));
  const lowCount = dbQuery(
    "SELECT COUNT(*) FROM Inventory i JOIN Product p ON i.ProductID=p.ProductID WHERE i.Quantity<p.ReorderLevel"
  ).values[0][0];
  setText("d-lowstock", lowCount);
  if (lowCount > 0) setHTML("d-lowstock-badge", `<span class="nb">${lowCount}</span>`);

  // Inventory table
  const inv = dbQuery(
    `SELECT b.BranchName,p.Name,i.Quantity,p.ReorderLevel
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     ORDER BY b.BranchName,p.Name`
  );
  renderTable("dash-inv-table", inv, (r) => {
    const ok = r[2] >= r[3];
    return `<tr>
      <td>${r[0]}</td>
      <td class="td-name">${r[1]}</td>
      <td class="td-num">${r[2]}</td>
      <td>${ok ? '<span class="pill pill-g">OK</span>' : '<span class="pill pill-r">Low</span>'}</td>
    </tr>`;
  });

  // Recent sales
  const sales = dbQuery(
    `SELECT s.SaleID,b.BranchName,s.SaleDate,s.TotalAmount
     FROM Sale s JOIN Branch b ON s.BranchID=b.BranchID
     ORDER BY s.SaleID DESC LIMIT 8`
  );
  renderTable("dash-sales-table", sales, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td>${r[1]}</td>
    <td class="td-mono">${r[2].split("T")[0]}</td>
    <td class="td-num">₹${fmtMoney(r[3])}</td>
  </tr>`);

  // Low stock mini
  const ls = dbQuery(
    `SELECT b.BranchName,p.Name,i.Quantity,p.ReorderLevel
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     WHERE i.Quantity < p.ReorderLevel ORDER BY i.Quantity ASC`
  );
  const lsEl = document.getElementById("low-stock-dash");
  if (lsEl) {
    if (!ls.values.length) {
      lsEl.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-txt">All stock levels OK</div></div>';
    } else {
      lsEl.innerHTML = ls.values
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><strong style="font-size:13px">${r[1]}</strong> <span style="color:var(--text3);font-size:12px">${r[0]}</span></div>
          <span class="pill pill-r">${r[2]} / ${r[3]}</span>
        </div>`
        )
        .join("");
    }
  }

  // Expiry mini
  const ex = dbQuery(
    `SELECT b.BranchName,p.Name,i.ExpiryDate,
      CAST(julianday(i.ExpiryDate)-julianday('${TODAY}') AS INTEGER) AS days
     FROM Inventory i
     JOIN Branch b ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     WHERE i.ExpiryDate IS NOT NULL
       AND i.ExpiryDate <= date('${TODAY}','+7 days')
     ORDER BY i.ExpiryDate`
  );
  const exEl = document.getElementById("expiry-dash");
  if (exEl) {
    if (!ex.values.length) {
      exEl.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-txt">No expiring products</div></div>';
    } else {
      exEl.innerHTML = ex.values
        .map((r) => {
          const d = r[3];
          const cls = d <= 0 ? "pill-r" : d <= 3 ? "pill-r" : "pill-o";
          const lbl = d <= 0 ? "EXPIRED" : d + "d left";
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div><strong style="font-size:13px">${r[1]}</strong> <span style="color:var(--text3);font-size:12px">${r[0]}</span></div>
            <span class="pill ${cls}">${lbl}</span>
          </div>`;
        })
        .join("");
    }
  }
}

/* ══════════════════════════════════════════════════════════
   PRODUCTS PAGE
   ══════════════════════════════════════════════════════════ */
function refreshProducts() {
  populateAllSelects();
  const d = dbQuery(
    `SELECT p.ProductID,p.Name,c.CategoryName,s.SupplierName,p.UnitPrice,p.ReorderLevel
     FROM Product p
     JOIN Category c ON p.CategoryID=c.CategoryID
     JOIN Supplier s ON p.SupplierID=s.SupplierID
     ORDER BY p.ProductID`
  );
  renderTable("products-table", d, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td class="td-name">${r[1]}</td>
    <td><span class="pill pill-b">${r[2]}</span></td>
    <td>${r[3]}</td>
    <td class="td-num">₹${r[4].toFixed(2)}</td>
    <td class="td-num">${r[5]}</td>
  </tr>`);
}

function addProduct() {
  const name = val("p-name"),
    cat = val("p-cat"),
    sup = val("p-sup"),
    price = parseFloat(val("p-price")),
    reorder = parseInt(val("p-reorder"));
  if (!name.trim()) return showAlert("error", "Product name is required");
  if (!price || price <= 0)
    return showAlert("error", "Unit price must be > 0 (CHECK constraint enforced)");
  if (isNaN(reorder) || reorder < 0)
    return showAlert("error", "Reorder level must be ≥ 0 (CHECK constraint enforced)");
  try {
    dbRun(
      "INSERT INTO Product(Name,CategoryID,SupplierID,UnitPrice,ReorderLevel) VALUES(?,?,?,?,?)",
      [name.trim(), cat, sup, price, reorder]
    );
    const id = dbLastId();
    showAlert("success", `✅ Product "${name}" added (ProductID: ${id})`);
    clearVals(["p-name", "p-price", "p-reorder"]);
    refreshProducts();
    populateAllSelects();
  } catch (e) {
    showAlert("error", e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   INVENTORY PAGE
   ══════════════════════════════════════════════════════════ */
function refreshInventory() {
  const d = dbQuery(
    `SELECT b.BranchName,p.Name,c.CategoryName,i.Quantity,p.ReorderLevel,i.ExpiryDate
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     JOIN Category c ON p.CategoryID=c.CategoryID
     ORDER BY b.BranchName,p.Name`
  );
  renderTable("inventory-table", d, (r) => {
    const ok = r[3] >= r[4];
    let expHtml = '<span style="color:var(--text3)">—</span>';
    if (r[5]) {
      const days = Math.round(
        (new Date(r[5]) - new Date(TODAY)) / 86400000
      );
      const cls = days <= 0 ? "pill-r" : days <= 7 ? "pill-o" : "pill-g";
      expHtml = `<span class="pill ${cls}">${r[5]}</span>`;
    }
    return `<tr>
      <td>${r[0]}</td>
      <td class="td-name">${r[1]}</td>
      <td><span class="pill pill-b">${r[2]}</span></td>
      <td class="td-num">${r[3]}</td>
      <td class="td-num">${r[4]}</td>
      <td>${ok ? '<span class="pill pill-g">OK</span>' : '<span class="pill pill-r">Low</span>'}</td>
      <td>${expHtml}</td>
    </tr>`;
  });
}

function saveInventory() {
  const branch = val("inv-branch"),
    product = val("inv-product"),
    qty = parseInt(val("inv-qty")),
    expiry = val("inv-expiry") || null;
  if (isNaN(qty) || qty < 0)
    return showAlert("error", "Quantity must be ≥ 0 (CHECK constraint enforced)");
  try {
    const existing = dbQuery(
      "SELECT Quantity FROM Inventory WHERE BranchID=? AND ProductID=?",
      [branch, product]
    );
    if (existing.values.length) {
      const old = existing.values[0][0];
      dbRun(
        "UPDATE Inventory SET Quantity=?,ExpiryDate=? WHERE BranchID=? AND ProductID=?",
        [qty, expiry, branch, product]
      );
      logInventory(branch, product, old, qty, "Manual Update");
      showAlert("success", `✅ Stock updated: ${old} → ${qty}`);
    } else {
      dbRun(
        "INSERT INTO Inventory(BranchID,ProductID,Quantity,ExpiryDate) VALUES(?,?,?,?)",
        [branch, product, qty, expiry]
      );
      showAlert("success", "✅ New inventory record created");
    }
    clearVals(["inv-qty", "inv-expiry"]);
    refreshInventory();
    refreshDashboard();
  } catch (e) {
    showAlert("error", e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   PROCESS SALE PAGE — mirrors ProcessSale() stored procedure
   ══════════════════════════════════════════════════════════ */
function refreshSales() {
  populateAllSelects();
  const d = dbQuery(
    `SELECT s.SaleID,b.BranchName,p.Name,si.Quantity,s.TotalAmount,s.SaleDate
     FROM Sale s
     JOIN Branch b    ON s.BranchID=b.BranchID
     JOIN Sale_Item si ON s.SaleID=si.SaleID
     JOIN Product p   ON si.ProductID=p.ProductID
     ORDER BY s.SaleID DESC`
  );
  renderTable("sales-table", d, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td>${r[1]}</td>
    <td class="td-name">${r[2]}</td>
    <td class="td-num">${r[3]}</td>
    <td class="td-num">₹${fmtMoney(r[4])}</td>
    <td class="td-mono">${r[5].split("T")[0]}</td>
  </tr>`);
}

function onSaleBranchChange() { loadStockInfo(); }
function onSaleProductChange() { loadStockInfo(); }

function loadStockInfo() {
  const branch = val("s-branch"), product = val("s-product");
  if (!branch || !product) return;
  const inv = dbQuery(
    "SELECT Quantity FROM Inventory WHERE BranchID=? AND ProductID=?",
    [branch, product]
  );
  const pr = dbQuery("SELECT UnitPrice FROM Product WHERE ProductID=?", [product]);
  const infoBox = document.getElementById("stock-info");
  if (inv.values.length && pr.values.length) {
    setHTML("stock-qty-val", inv.values[0][0]);
    setHTML("stock-price-val", "₹" + pr.values[0][0].toFixed(2));
    if (infoBox) infoBox.style.display = "flex";
    calcTotal();
  } else {
    if (infoBox) infoBox.style.display = "none";
  }
}

function calcTotal() {
  const product = val("s-product"), qty = parseInt(val("s-qty"));
  const totalBox = document.getElementById("total-box");
  if (!product || isNaN(qty) || qty <= 0) {
    if (totalBox) totalBox.style.display = "none";
    return;
  }
  const pr = dbQuery("SELECT UnitPrice FROM Product WHERE ProductID=?", [product]);
  if (pr.values.length) {
    const total = (pr.values[0][0] * qty).toFixed(2);
    setHTML("total-val", "₹" + total);
    if (totalBox) totalBox.style.display = "flex";
  }
}

function processSale() {
  const branch = parseInt(val("s-branch")),
    product = parseInt(val("s-product")),
    qty = parseInt(val("s-qty"));
  if (!branch || !product || isNaN(qty) || qty < 1)
    return showAlert("error", "Please fill all fields correctly");

  // — SIMULATE ProcessSale() START TRANSACTION —
  const inv = dbQuery(
    "SELECT Quantity FROM Inventory WHERE BranchID=? AND ProductID=?",
    [branch, product]
  );
  if (!inv.values.length)
    return showAlert("error", "❌ SIGNAL 45000: Product not stocked at this branch");

  const stock = inv.values[0][0];
  // CHECK: sufficient stock
  if (stock < qty)
    return showAlert(
      "error",
      `❌ SIGNAL 45000: Insufficient Stock — Available: ${stock}, Requested: ${qty}`
    );

  try {
    const prRow = dbQuery("SELECT UnitPrice,ReorderLevel,SupplierID FROM Product WHERE ProductID=?", [product]).values[0];
    const price = prRow[0], reorderLvl = prRow[1], supplierId = prRow[2];
    const total = price * qty;
    const ts = new Date().toISOString();

    // INSERT Sale
    dbRun("INSERT INTO Sale(BranchID,SaleDate,TotalAmount) VALUES(?,?,?)", [branch, ts, total]);
    const saleId = dbLastId();

    // INSERT Sale_Item
    dbRun("INSERT INTO Sale_Item(SaleID,ProductID,Quantity,UnitPrice) VALUES(?,?,?,?)", [saleId, product, qty, price]);

    // UPDATE Inventory
    const newQty = stock - qty;
    dbRun("UPDATE Inventory SET Quantity=? WHERE BranchID=? AND ProductID=?", [newQty, branch, product]);

    // TRIGGER: LogInventoryChanges
    logInventory(branch, product, stock, newQty, "Sale - ProcessSale()");

    // TRIGGER: AutoReorder — if qty < reorderLevel, create Purchase Order
    let autoMsg = "";
    if (newQty < reorderLvl) {
      dbRun("INSERT INTO Purchase_Order(SupplierID,OrderDate,Status) VALUES(?,?,'Pending')", [supplierId, ts]);
      const orderId = dbLastId();
      dbRun("INSERT INTO Order_Item(OrderID,ProductID,Quantity,UnitPrice) VALUES(?,?,?,?)", [orderId, product, reorderLvl * 2, price]);
      autoMsg = ` | ⚡ AutoReorder triggered! PO #${orderId} created (qty ${newQty} < reorder ${reorderLvl})`;
    }

    // COMMIT
    showAlert("success", `✅ COMMIT — Sale #${saleId} processed! ₹${total.toFixed(2)}${autoMsg}`);
    clearVals(["s-qty"]);
    document.getElementById("stock-info").style.display = "none";
    document.getElementById("total-box").style.display = "none";
    refreshSales(); refreshDashboard(); refreshOrders(); refreshAuditLog(); refreshAlerts();
  } catch (e) {
    showAlert("error", "❌ ROLLBACK — " + e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   STOCK TRANSFER — mirrors TransferStock() procedure
   ══════════════════════════════════════════════════════════ */
function refreshTransfer() {
  populateAllSelects();
  const d = dbQuery(
    `SELECT b.BranchName,p.Name,i.Quantity,p.ReorderLevel
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     ORDER BY p.Name,b.BranchName`
  );
  renderTable("transfer-table", d, (r) => {
    const ok = r[2] >= r[3];
    return `<tr>
      <td>${r[0]}</td>
      <td class="td-name">${r[1]}</td>
      <td class="td-num">${r[2]}</td>
      <td>${ok ? '<span class="pill pill-g">OK</span>' : '<span class="pill pill-r">Low</span>'}</td>
    </tr>`;
  });
}

function transferStock() {
  const from = parseInt(val("t-from")),
    to = parseInt(val("t-to")),
    product = parseInt(val("t-product")),
    qty = parseInt(val("t-qty"));
  if (from === to)
    return showAlert("error", "Source and destination branch must be different");
  if (isNaN(qty) || qty < 1)
    return showAlert("error", "Enter a valid quantity (≥ 1)");

  const src = dbQuery(
    "SELECT Quantity FROM Inventory WHERE BranchID=? AND ProductID=?",
    [from, product]
  );
  if (!src.values.length)
    return showAlert("error", "❌ SIGNAL 45000: Product not found in source branch");

  const avail = src.values[0][0];
  if (avail < qty)
    return showAlert("error", `❌ SIGNAL 45000: Not enough stock — Available: ${avail}, Requested: ${qty}`);

  const dest = dbQuery(
    "SELECT Quantity FROM Inventory WHERE BranchID=? AND ProductID=?",
    [to, product]
  );
  if (!dest.values.length)
    return showAlert("error", "Destination branch does not stock this product");

  try {
    // START TRANSACTION — both updates atomic
    const srcOld = avail, dstOld = dest.values[0][0];
    dbRun("UPDATE Inventory SET Quantity=Quantity-? WHERE BranchID=? AND ProductID=?", [qty, from, product]);
    dbRun("UPDATE Inventory SET Quantity=Quantity+? WHERE BranchID=? AND ProductID=?", [qty, to, product]);

    // Log both changes
    logInventory(from, product, srcOld, srcOld - qty, "Transfer Out");
    logInventory(to, product, dstOld, dstOld + qty, "Transfer In");

    const pName = dbQuery("SELECT Name FROM Product WHERE ProductID=?", [product]).values[0][0];
    const bFrom = dbQuery("SELECT BranchName FROM Branch WHERE BranchID=?", [from]).values[0][0];
    const bTo   = dbQuery("SELECT BranchName FROM Branch WHERE BranchID=?", [to]).values[0][0];
    showAlert("success", `✅ COMMIT — ${qty}× "${pName}" transferred: ${bFrom} → ${bTo}`);
    clearVals(["t-qty"]);
    refreshTransfer(); refreshDashboard(); refreshAuditLog(); refreshAlerts();
  } catch (e) {
    showAlert("error", "❌ ROLLBACK — " + e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   SUPPLIERS — GetSupplierStatus() function shown live
   ══════════════════════════════════════════════════════════ */
function refreshSuppliers() {
  const d = dbQuery(
    "SELECT SupplierID,SupplierName,ContactInfo,Rating FROM Supplier ORDER BY Rating DESC"
  );
  renderTable("suppliers-table", d, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td class="td-name">${r[1]}</td>
    <td style="color:var(--text2)">${r[2]}</td>
    <td class="td-num">${Number(r[3]).toFixed(1)} ⭐</td>
    <td>${getSupplierStatus(r[3])}</td>
  </tr>`);
}

function addSupplier() {
  const name = val("sup-name"),
    contact = val("sup-contact"),
    rating = parseFloat(val("sup-rating"));
  if (!name.trim()) return showAlert("error", "Supplier name is required");
  if (isNaN(rating) || rating < 0 || rating > 5)
    return showAlert("error", "Rating must be between 0 and 5 (CHECK constraint enforced)");
  dbRun("INSERT INTO Supplier(SupplierName,ContactInfo,Rating) VALUES(?,?,?)", [name.trim(), contact || "", rating]);
  showAlert("success", `✅ Supplier "${name}" added — ${getSupplierStatus(rating).replace(/<[^>]+>/g, "")}`);
  clearVals(["sup-name", "sup-contact", "sup-rating"]);
  refreshSuppliers();
  populateAllSelects();
}

/* ══════════════════════════════════════════════════════════
   PURCHASE ORDERS
   ══════════════════════════════════════════════════════════ */
function refreshOrders() {
  const orders = dbQuery(
    `SELECT po.OrderID,s.SupplierName,po.OrderDate,po.Status
     FROM Purchase_Order po
     JOIN Supplier s ON po.SupplierID=s.SupplierID
     ORDER BY po.OrderID DESC`
  );
  renderTable("orders-table", orders, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td class="td-name">${r[1]}</td>
    <td class="td-mono">${r[2].split("T")[0]}</td>
    <td><span class="pill ${r[3] === "Pending" ? "pill-o" : "pill-g"}">${r[3]}</span></td>
  </tr>`);

  const items = dbQuery(
    `SELECT oi.OrderID,p.Name,oi.Quantity,oi.UnitPrice
     FROM Order_Item oi
     JOIN Product p ON oi.ProductID=p.ProductID
     ORDER BY oi.OrderID DESC`
  );
  renderTable("order-items-table", items, (r) => `<tr>
    <td class="td-pk">#${r[0]}</td>
    <td class="td-name">${r[1]}</td>
    <td class="td-num">${r[2]}</td>
    <td class="td-num">₹${r[3].toFixed(2)}</td>
  </tr>`);
}

/* ══════════════════════════════════════════════════════════
   REPORTS / ANALYTICS
   ══════════════════════════════════════════════════════════ */
function refreshReports() {
  const topProducts = dbQuery(
    `SELECT p.Name, SUM(si.Quantity) AS Sold, SUM(si.Quantity*si.UnitPrice) AS Rev
     FROM Sale_Item si JOIN Product p ON si.ProductID=p.ProductID
     GROUP BY p.Name ORDER BY Sold DESC`
  );
  renderTable("top-products-table", topProducts, (r) => `<tr>
    <td class="td-name">${r[0]}</td>
    <td class="td-num">${r[1]}</td>
    <td class="td-num">₹${fmtMoney(r[2])}</td>
  </tr>`, "No sales yet");

  const branchSales = dbQuery(
    `SELECT b.BranchName, COUNT(s.SaleID) AS Txn, COALESCE(SUM(s.TotalAmount),0) AS Rev
     FROM Branch b LEFT JOIN Sale s ON s.BranchID=b.BranchID
     GROUP BY b.BranchName ORDER BY Rev DESC`
  );
  renderTable("branch-sales-table", branchSales, (r) => `<tr>
    <td class="td-name">${r[0]}</td>
    <td class="td-num">${r[1]}</td>
    <td class="td-num">₹${fmtMoney(r[2])}</td>
  </tr>`);

  const branchInv = dbQuery(
    `SELECT b.BranchName,b.Location,COALESCE(SUM(i.Quantity),0) AS Total,COUNT(DISTINCT i.ProductID) AS Prods
     FROM Branch b LEFT JOIN Inventory i ON b.BranchID=i.BranchID
     GROUP BY b.BranchName,b.Location ORDER BY Total DESC`
  );
  renderTable("branch-inv-table", branchInv, (r) => `<tr>
    <td class="td-name">${r[0]}</td>
    <td>${r[1]}</td>
    <td class="td-num">${r[2]}</td>
    <td class="td-num">${r[3]}</td>
  </tr>`);

  const supPerf = dbQuery(
    `SELECT s.SupplierName,s.Rating,COUNT(p.ProductID) AS Prods
     FROM Supplier s LEFT JOIN Product p ON p.SupplierID=s.SupplierID
     GROUP BY s.SupplierName,s.Rating ORDER BY s.Rating DESC`
  );
  renderTable("sup-perf-table", supPerf, (r) => `<tr>
    <td class="td-name">${r[0]}</td>
    <td class="td-num">${Number(r[1]).toFixed(1)} ⭐</td>
    <td>${getSupplierStatus(r[1])}</td>
    <td class="td-num">${r[2]}</td>
  </tr>`);
}

/* ══════════════════════════════════════════════════════════
   ALERTS — LowStockProducts & ExpiringProducts VIEWS
   ══════════════════════════════════════════════════════════ */
function refreshAlerts() {
  // LowStockProducts VIEW query
  const ls = dbQuery(
    `SELECT b.BranchName,p.Name,i.Quantity,p.ReorderLevel,(p.ReorderLevel-i.Quantity) AS ShortBy
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     WHERE i.Quantity < p.ReorderLevel
     ORDER BY ShortBy DESC`
  );
  renderTable("low-stock-table", ls, (r) => `<tr>
    <td>${r[0]}</td>
    <td class="td-name">${r[1]}</td>
    <td class="td-num">${r[2]}</td>
    <td class="td-num">${r[3]}</td>
    <td><span class="pill pill-r">-${r[4]}</span></td>
  </tr>`, "✅ All products are adequately stocked");

  // ExpiringProducts VIEW query
  const ex = dbQuery(
    `SELECT b.BranchName,p.Name,i.Quantity,i.ExpiryDate,
      CAST(julianday(i.ExpiryDate)-julianday('${TODAY}') AS INTEGER) AS Days
     FROM Inventory i
     JOIN Branch b  ON i.BranchID=b.BranchID
     JOIN Product p ON i.ProductID=p.ProductID
     WHERE i.ExpiryDate IS NOT NULL
       AND i.ExpiryDate <= date('${TODAY}','+7 days')
     ORDER BY i.ExpiryDate`
  );
  renderTable("expiry-table", ex, (r) => {
    const d = r[4];
    const cls = d <= 0 ? "pill-r" : d <= 3 ? "pill-r" : "pill-o";
    return `<tr>
      <td>${r[0]}</td>
      <td class="td-name">${r[1]}</td>
      <td class="td-num">${r[2]}</td>
      <td class="td-mono">${r[3]}</td>
      <td><span class="pill ${cls}">${d <= 0 ? "EXPIRED" : d + "d left"}</span></td>
    </tr>`;
  }, "✅ No products expiring within 7 days");
}

/* ══════════════════════════════════════════════════════════
   AUDIT LOG — LogInventoryChanges trigger output
   ══════════════════════════════════════════════════════════ */
function refreshAuditLog() {
  const branches = {};
  dbQuery("SELECT BranchID,BranchName FROM Branch").values.forEach((r) => (branches[r[0]] = r[1]));
  const products = {};
  dbQuery("SELECT ProductID,Name FROM Product").values.forEach((r) => (products[r[0]] = r[1]));

  const d = dbQuery(
    "SELECT LogID,BranchID,ProductID,OldQuantity,NewQuantity,ChangeDate,ActionType FROM Inventory_Log ORDER BY LogID DESC"
  );
  renderTable("audit-table", d, (r, cols, i) => {
    const diff = r[4] - r[3];
    const diffCls = diff < 0 ? "pill-r" : "pill-g";
    const typMap = {
      "Sale - ProcessSale()": "pill-r",
      "Transfer Out": "pill-o",
      "Transfer In": "pill-b",
      "Manual Update": "pill-p",
    };
    const tCls = typMap[r[6]] || "pill-p";
    return `<tr class="${i === 0 ? "td-hi" : ""}">
      <td class="td-pk">#${r[0]}</td>
      <td>${branches[r[1]] || r[1]}</td>
      <td>${products[r[2]] || r[2]}</td>
      <td class="td-num">${r[3]}</td>
      <td class="td-num">${r[4]}</td>
      <td><span class="pill ${diffCls}">${diff >= 0 ? "+" : ""}${diff}</span></td>
      <td><span class="pill ${tCls}">${r[6]}</span></td>
      <td class="td-mono" style="font-size:11px">${r[5].replace("T", " ").split(".")[0]}</td>
    </tr>`;
  }, "No inventory changes logged yet");
}

/* ══════════════════════════════════════════════════════════
   SQL EDITOR — raw query runner
   ══════════════════════════════════════════════════════════ */
function runSQL() {
  const sql = document.getElementById("sql-input").value.trim();
  if (!sql) return;
  const outEl = document.getElementById("sql-output");
  const panel = document.getElementById("sql-result-panel");
  const wrap = document.getElementById("sql-result-wrap");
  try {
    const results = DB.exec(sql);
    if (!results.length) {
      outEl.className = "term-out to-ok";
      outEl.textContent = "✅ Query executed successfully — no rows returned";
      panel.style.display = "none";
      refreshDashboard();
      return;
    }
    const r = results[0];
    outEl.className = "term-out to-ok";
    outEl.textContent = `✅ ${r.values.length} row(s) returned`;
    const thead = r.columns.map((c) => `<th>${c}</th>`).join("");
    const tbody = r.values
      .map(
        (row) =>
          `<tr>${row
            .map(
              (cell) =>
                `<td>${cell === null ? '<span style="color:var(--text3)">NULL</span>' : cell}</td>`
            )
            .join("")}</tr>`
      )
      .join("");
    wrap.innerHTML = `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
    panel.style.display = "block";
  } catch (e) {
    outEl.className = "term-out to-err";
    outEl.textContent = "❌ ERROR: " + e.message;
    panel.style.display = "none";
  }
}

function loadPreset(el) {
  const v = el.value;
  if (v) document.getElementById("sql-input").value = v;
  el.value = "";
}

/* ══════════════════════════════════════════════════════════
   INTERNAL HELPERS
   ══════════════════════════════════════════════════════════ */
function logInventory(branchId, productId, oldQty, newQty, action) {
  dbRun(
    "INSERT INTO Inventory_Log(BranchID,ProductID,OldQuantity,NewQuantity,ChangeDate,ActionType) VALUES(?,?,?,?,?,?)",
    [branchId, productId, oldQty, newQty, new Date().toISOString(), action]
  );
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function clearVals(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}
function fmtMoney(n) {
  return Number(n || 0).toFixed(2);
}

/* ── ALERT ── */
let alertTimer = null;
function showAlert(type, msg) {
  clearTimeout(alertTimer);
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const wrap = document.getElementById("alert-wrap");
  wrap.innerHTML = `
    <div class="alert al-${type}">
      <span class="alert-icon">${icons[type]}</span>
      <span class="alert-text">${msg}</span>
      <button class="alert-close" onclick="clearAlert()">✕</button>
    </div>`;
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (type !== "error") alertTimer = setTimeout(clearAlert, 7000);
}
function clearAlert() {
  const wrap = document.getElementById("alert-wrap");
  if (wrap) wrap.innerHTML = "";
}

/* ── START ── */
window.addEventListener("DOMContentLoaded", () => {
  initApp().catch((e) => {
    document.getElementById("ld-status").textContent = "Error: " + e.message;
  });
});
