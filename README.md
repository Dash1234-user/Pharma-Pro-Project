# PharmaPro-Project #
  ### Academic minor project (On Development) ###
 #### - <i> Building a multi-user SaaS-style pharmacy system deployed on cloud (Render) </i> ####
#### - <i> Currently evolving from a working prototype toward a production-ready SaaS product </i> ####

# 💊 PharmaCare Pro

> **A full-stack pharmacy management web application** built for both Wholesale and Retail pharmacies — featuring billing, inventory, credit management, expiry tracking, sales analytics, and more.

---

## 🏗️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.3 | UI framework |
| **Vite** | 5.4 | Build tool & dev server |
| **React Router v6** | 6.26 | Client-side routing |
| **TanStack React Query** | 5.56 | Server state, caching (30s stale time) |
| **Zustand** | 5.0 | Client state (auth, settings) |
| **Axios** | 1.7 | HTTP client with JWT interceptor |
| **Recharts** | 3.8 | Charts — bar, line, pie |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Python / Flask** | 3.x | REST API server |
| **Flask-JWT-Extended** | — | JWT authentication & partition identity |
| **Flask-CORS** | — | Cross-origin requests |
| **psycopg2** | — | PostgreSQL driver with connection pooling |
| **Werkzeug** | — | Password hashing (bcrypt) |
| **Resend API** | — | Transactional email (credit bills, OTP) |
| **SMTP fallback** | — | Email fallback if Resend unavailable |

### Database & Infrastructure
| Service | Purpose |
|---|---|
| **PostgreSQL (Supabase)** | Primary database — Transaction Pooler port 6543 |
| **Render Web Service** | Flask backend hosting |
| **Render Static Site** | React frontend hosting |
| **GitHub** | Source control & auto-deploy trigger |

---

## ✨ Features

### 🔐 Authentication
- JWT-based login & registration
- Drug License No. as primary identifier
- OTP-based password reset via email
- OTP-based email change verification
- Welcome email on registration
- Auto-logout on token expiry (401 intercept)

### 🏢 Dual Pharmacy Type Support
The entire app is **partition-aware** — every feature, endpoint, and UI adapts to the active pharmacy type:
- **Wholesale Pharma** — Box/Strip pricing, retailer billing, GSTIN fields, supplier-side credit
- **Retail Pharmacy / Hospital / Medical Store / Ayurvedic Store** — Strip/Piece pricing, customer billing, doctor fields, patient-side credit

### 📊 Dashboard
- Today's revenue & bill count
- Total medicines & low stock alerts
- Expiry alerts (expired + upcoming)
- Revenue trend — last 7 days (bar chart)
- Weekly profit analysis — current month (4 weeks)
- Top selling medicines (horizontal bar chart)
- Expiring soon panel
- Recent bills list
- Per-pharmacy-type dashboard reset (hide old data without deleting)

### 💊 Inventory Management
- Add / Edit / Delete medicines
- Fields: Name, Brand, Category, SKU/Batch, Form (Tablet/Syrup/etc.), Unit, MRP, Selling Price, Purchase Price, GST%, Stock, Min Stock, Pieces/Strip, Strips/Box, Expiry Month
- Low stock threshold alerts
- Real-time stock deduction on billing
- Category-based filtering

### 🧾 Billing
**Wholesale billing:**
- Shop / Retailer name, Shopkeeper GSTIN, phone
- Box / Strip quantity types with automatic pack-size price calculation
- Bill No. format: `GSTIN-XXXX`
- Columns: Medicine, Form, Qty, MRP, Selling Price, Disc%, GST, Amt Before Tax, Total
- Bill preview modal with QR code (UPI payment)

**Retail billing:**
- Customer name, phone, doctor name
- Strip / Piece quantity types
- Bill No. format: `#XXXX`
- Columns: Medicine, Form, Qty, MRP, Disc%, GST, Amount
- TAX INVOICE layout with green header

**Both types:**
- Live GST + discount calculation
- Round-off to nearest rupee
- Print-ready PDF preview
- Low stock toast alert after bill generation
- Print Last Bill button

### 📋 Sales History
- All bills with search & date filter
- Bill detail expand / print
- Export as CSV
- Filter by payment mode

### 📦 Stock Details (Stock-In)
- Track every stock entry with supplier, quantity, purchase price, batch, expiry
- Per-pharmacy-type filtering
- Linked to Purchase Records

### 🛒 Purchase Records
- Supplier order tracking
- Delivery status management
- Linked to stock-in entries

### 💳 Credit Management
**Wholesale Credit:**
- Multi-item credit bills for retailers
- GST / discount toggles per item
- Email credit bill to shopkeeper via Resend API
- PDF print of credit bill
- Bulk delete

**Retail Credit (Shop Credits):**
- Track supplier / wholesaler payments
- Cumulative pending balance calculation
- Supplier History Modal — full payment timeline
- `MAX(ctid)` tiebreaker for accurate latest-record queries

### 📈 Sales Analysis
- Revenue by period (7 / 30 / 90 / 365 days)
- Category-wise revenue breakdown with progress bars
- Top selling medicines ranking
- GST collected summary
- Profit margin analysis
- Line chart & bar chart views

### 📅 Expiry Tracker
- Medicines grouped by: Expired / Within 30 / 60 / 90 days / Safe
- Color-coded badges (red / amber / green)
- Stat cards with counts per group
- Filter buttons to switch views instantly

### 🗂️ Categories
- Add / Edit / Delete medicine categories
- Medicine count per category
- Revenue contribution per category (from analysis data)
- Revenue progress bars

### ⚙️ Settings
- Store name, type, address, phone, email
- GSTIN, Drug License No.
- Owner name, Supplier name
- UPI QR code upload (separate for Wholesale & Retail)
- Currency symbol
- Low stock threshold
- Pharmacy type lock (prevents accidental type change)
- OTP-based email update

### 📤 Import / Export
- Excel import for medicines bulk upload
- Sales history import
- Credits import
- Full backup export (JSON)

---

## 🗂️ Project Structure

```
Pharma-Pro-Project/
│
├── app.py                  # Flask backend — 61 API routes, 4800+ lines
├── requirements.txt        # Python dependencies
├── Procfile                # Render start command
├── runtime.txt             # Python version
│
└── frontend/               # React + Vite SPA
    ├── public/
    │   ├── favicon.ico
    │   ├── logo.jpeg
    │   └── site.webmanifest
    ├── src/
    │   ├── api/
    │   │   └── client.js         # Axios instance with JWT interceptor
    │   ├── store/
    │   │   ├── authStore.js      # Zustand — token, user
    │   │   └── settingsStore.js  # Zustand — pharmacy settings, type
    │   ├── components/
    │   │   └── Layout.jsx        # Sidebar, topbar, bottom nav
    │   ├── pages/
    │   │   ├── AuthPage.jsx
    │   │   ├── DashboardPage.jsx
    │   │   ├── ProductsPage.jsx
    │   │   ├── BillingPage.jsx
    │   │   ├── HistoryPage.jsx
    │   │   ├── StockInPage.jsx
    │   │   ├── CreditPage.jsx
    │   │   ├── AnalysisPage.jsx
    │   │   ├── ExpiryPage.jsx
    │   │   ├── CategoriesPage.jsx
    │   │   ├── PurchasePage.jsx
    │   │   └── SettingsPage.jsx
    │   ├── App.jsx               # Routes + protected route wrapper
    │   ├── main.jsx              # React Query + BrowserRouter setup
    │   └── styles.css            # Global CSS with responsive utilities
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🔌 API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new pharmacy |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| GET/PUT | `/api/settings` | Get / update pharmacy settings |
| GET/POST | `/api/products` | List / add medicines |
| PUT/DELETE | `/api/products/:id` | Edit / delete medicine |
| GET/POST | `/api/categories` | List / add categories |
| GET/POST | `/api/bills` | List / create bills |
| GET | `/api/bills/next-number` | Next formatted bill number |
| GET/POST | `/api/stock-ins` | Stock entry records |
| GET/POST | `/api/credits` | Wholesale credit records |
| GET/POST | `/api/shop-credits` | Retail supplier credits |
| GET | `/api/dashboard` | Full dashboard aggregation |
| GET | `/api/analysis` | Sales analytics (7/30/90/365 days) |
| GET | `/api/expiry` | Medicines by expiry category |
| GET/POST | `/api/purchase-records` | Supplier purchase orders |
| POST | `/api/auth/forgot-password/send-otp` | Password reset OTP |
| GET | `/api/export/backup` | Full data backup (JSON) |
| POST | `/api/import/medicines` | Bulk medicine import (Excel) |

---

## 🚀 Local Development

### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://..."
export JWT_SECRET_KEY="your-secret"
export RESEND_API_KEY="re_..."

# Run Flask
python app.py
```

### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Run dev server (proxies /api to localhost:5000)
npm run dev

# Build for production
npm run build
```

---

## 🌐 Deployment (Render)

| Service | Type | Config |
|---|---|---|
| `Pharma-Pro-Project` | Web Service (Flask) | Root dir: `/`, Build: `pip install -r requirements.txt`, Start: `gunicorn app:app` |
| `Pharma-Pro-Project-1` | Static Site (React) | Root dir: `frontend`, Build: `npm install && npm run build`, Publish: `dist` |

**Environment variables on Static Site:**
```
VITE_API_URL = https://pharma-pro-project.onrender.com/api
```
---

**Credintials for Exploring Website:** 
--------------------------------------

***(Wholesaler Pharma) :***
GSTIN : 27ABCEF1234F1Z0

***(Retail Pharma) :***
GSTIN : 27ABCEF1234F2Z4

(***MAIL ME FOR PASSWORD***)

--------------------------------------

## 📄 License

Not licensed for commercial use.
