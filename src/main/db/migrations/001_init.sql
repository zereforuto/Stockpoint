-- StockPoint initial schema.
--
-- Rules for migration files:
--   * one file per numbered migration (001_, 002_, ...)
--   * never wrap statements in BEGIN/COMMIT; the runner owns the transaction
--   * money is always an INTEGER number of minor units (centavos)

CREATE TABLE users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT    NOT NULL,
  full_name             TEXT    NOT NULL DEFAULT '',
  role                  TEXT    NOT NULL CHECK (role IN ('owner', 'cashier')),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL,
  last_login_at         TEXT
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE TABLE products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  sku                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  barcode            TEXT    UNIQUE,
  category_id        INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  cost_price_cent    INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_cent >= 0),
  selling_price_cent INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_cent >= 0),
  stock_qty          INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level      INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  image_path         TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE INDEX idx_products_name     ON products (name);
CREATE INDEX idx_products_sku      ON products (sku);
CREATE INDEX idx_products_barcode  ON products (barcode);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_stock    ON products (stock_qty, reorder_level);

CREATE TABLE stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('sale', 'void', 'restock', 'damaged', 'correction', 'adjustment', 'import')),
  reason     TEXT,
  ref_type   TEXT,
  ref_id     INTEGER,
  user_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_stock_movements_product ON stock_movements (product_id, created_at);
CREATE INDEX idx_stock_movements_ref     ON stock_movements (ref_type, ref_id);
CREATE INDEX idx_stock_movements_created ON stock_movements (created_at);

CREATE TABLE sales (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no           TEXT    NOT NULL UNIQUE,
  cashier_id           INTEGER NOT NULL REFERENCES users (id),
  subtotal_cent        INTEGER NOT NULL CHECK (subtotal_cent >= 0),
  discount_type        TEXT    NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'percent', 'fixed')),
  discount_value_cent  INTEGER NOT NULL DEFAULT 0 CHECK (discount_value_cent >= 0),
  discount_cent        INTEGER NOT NULL DEFAULT 0 CHECK (discount_cent >= 0),
  tax_cent             INTEGER NOT NULL DEFAULT 0 CHECK (tax_cent >= 0),
  total_cent           INTEGER NOT NULL CHECK (total_cent >= 0),
  payment_method       TEXT    NOT NULL CHECK (payment_method IN ('cash', 'card', 'e_wallet')),
  amount_tendered_cent INTEGER NOT NULL CHECK (amount_tendered_cent >= total_cent),
  change_cent          INTEGER NOT NULL DEFAULT 0 CHECK (change_cent >= 0),
  status               TEXT    NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  void_reason          TEXT,
  voided_by            INTEGER REFERENCES users (id),
  voided_at            TEXT,
  created_at           TEXT    NOT NULL
);

CREATE INDEX idx_sales_created        ON sales (created_at);
CREATE INDEX idx_sales_status_created ON sales (status, created_at);
CREATE INDEX idx_sales_cashier        ON sales (cashier_id, created_at);

CREATE TABLE sale_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id          INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products (id),
  product_name     TEXT    NOT NULL,
  sku              TEXT    NOT NULL,
  cost_price_cent  INTEGER NOT NULL CHECK (cost_price_cent >= 0),
  unit_price_cent  INTEGER NOT NULL CHECK (unit_price_cent >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cent  INTEGER NOT NULL CHECK (line_total_cent >= 0)
);

CREATE INDEX idx_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);

CREATE TABLE payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  method     TEXT    NOT NULL CHECK (method IN ('cash', 'card', 'e_wallet')),
  amount_cent INTEGER NOT NULL CHECK (amount_cent >= 0),
  reference  TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_payments_sale ON payments (sale_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
