# 🏏 Cricket Live Backend: Intelligence & Discovery Engine

The core engine responsible for discovering live cricket matches, prioritizing them, and scraping real-time data from various sources.

---

## 🚀 Key Modules

### 1. Intelligent Discovery Service
Automatically scans live listings (Cricbuzz, etc.) and uses a priority-based selection algorithm:
*   **Priority 1**: Indian National Team matches.
*   **Priority 2**: IPL (Indian Premier League).
*   **Priority 3**: Major ICC Tournaments (WC, Champions Trophy).
*   **Priority 4**: Other International / Domestic T20 leagues.

### 2. Match Intelligence Service
Maintains state continuity. If a match is selected, the engine "sticks" to it unless it ends or a significantly higher priority match starts.

### 3. Scraping Engine
Uses **Puppeteer** for heavy dynamic pages and **Cheerio** for lightweight data extraction. Optimized for performance and stealth.

---

## 📡 API Endpoints

| Route | Description |
| :--- | :--- |
| `GET /api/cricbuzz/live` | The "Smart" endpoint. Returns data for the best live match found. |
| `GET /api/cricbuzz/live/status` | Current engine state and selection metadata. |
| `GET /api/cricbuzz/live/discover` | List of all detected matches with priority scores. |
| `POST /api/cricbuzz/live/reset` | Clear engine state (useful for forcing new discovery). |

---

## 🛠️ Setup

1.  Install dependencies: `npm install`
2.  Set up `.env`:
    ```env
    PORT=9000
    # Add optional db config if using persistence
    ```
3.  Run Server: `npm start` (or `npm run dev` for development)

---

## ⚡ Integrated Technologies
*   **Express.js**: Web framework.
*   **Puppeteer/Cheerio**: Scraper tools.
*   **Axios**: HTTP client for external APIs.

