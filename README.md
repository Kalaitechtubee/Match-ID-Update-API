# 🏏 Cricket Live Backend v3.0: Intelligence & Discovery Engine

The high-performance core responsible for discovering live cricket matches, prioritizing them, and scraping real-time data. In v3.0, the engine is specifically optimized for the **ICC Men's T20 World Cup 2026**.

---

## 🚀 Key Modules (v3.0 Architecture)

### 1. Robust Discovery Engine (Layer 1)
Automatically scans live listings via the Cricbuzz Mobile API with a Puppeteer fallback. 
*   **Strict Filter**: Now includes a regex-based filter specifically for T20 World Cup matches.
*   **Intelligent Cache**: 60-second in-memory discovery cache to prevent API flooding.

### 2. Priority Intelligence (Layer 2)
Uses a weighted priority system to select the "Best Match":
1.  **T20 World Cup Finals/Semi-Finals** (Top Priority)
2.  **India T20 World Cup Matches**
3.  **Other T20 World Cup Fixtures**

### 3. Match Continuity Manager (Layer 3)
Prevents flickering or unnecessary jumping between matches. Once a T20 WC match is selected, the engine remains focused on it until completion or until a higher-stakes game begins.

### 4. Data Validation Layer (Layer 4)
*   **Strict Integrity Checks**: Ensures `matchHeader`, `miniscore`, and `commentary` are all present.
*   **Robust Retries**: Implements 3-tier fetch retries with exponential backoff to handle scraping timeouts gracefully.

---

## 📡 API Endpoints

| Route | Description |
| :--- | :--- |
| `GET /api/cricbuzz/live` | **The Intelligent Entry**. Returns the single best T20 WC match data. |
| `GET /api/cricbuzz/live/status` | Engine internal state, active match selection reason, and diagnostics. |
| `GET /api/cricbuzz/live/discover` | Full discovery list with calculated priority scores. |
| `POST /api/cricbuzz/live/reset` | Resets the in-memory state and clears selection cache. |

---

## 🛠️ Setup

1.  Navigate to `/cricket-backend`
2.  Install dependencies: `npm install`
3.  Set up `.env`:
    ```env
    PORT=9000
    ```
4.  Run Server: `npm run dev`

---

## ⚡ Core Technologies
*   **Express.js**: Modern Node.js web server.
*   **Puppeteer**: Headless browser for robust data scraping.
*   **Axios**: Fast HTTP client with global headers.
*   **Intelligence Services**: Custom-built logic layers for automated match resolution.

