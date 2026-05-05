# AI Financial Advisor

A full-stack AI-powered personal finance application that analyzes a user's financial profile and generates a comprehensive investment roadmap, tax optimization strategies, and a professional PDF report — all in Indian Rupees (₹).

Built as a college capstone project by **Koushik M**, B.Tech CSE (AIML), Amity University Bengaluru.

---

## LIVE DEMO : https://finance-advisor-ai.netlify.app/

---

## Features

- **Financial Fitness Score** — AI-generated 0–100 score with grade (A+ to F) across 6 health metrics
- **Personalized Investment Roadmap** — Priority-ordered SIP/PPF/NPS/ELSS/index fund recommendations
- **20-Year Wealth Projection** — Savings, investment, and net worth forecasts with interactive charts
- **Tax Optimization Center** — Indian tax slab detection, Section 80C/80D strategies, tax-advantaged instruments
- **Interactive Spending Tracker** — Track monthly spending by category vs AI-recommended budgets; get live AI tips when over budget
- **AI Advisor Chat** — Multi-turn conversational AI that knows your full financial profile
- **PDF Report Export** — Professional 6-page downloadable report with all analysis
- **Dark / Light Theme** — Full theme toggle with persistent UI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Python, Flask, Flask-CORS |
| AI Model | Google Gemini 2.5 Flash (via `google-generativeai`) |
| Charts | Chart.js |
| PDF Export | jsPDF (client-side) |
| Environment | python-dotenv |

---

## Project Structure

```
ai-financial-advisor/
├── backend/
│   ├── app.py              # Flask API server
│   ├── requirements.txt    # Python dependencies
│   └── .env                # API key (not committed)
├── frontend/
│   ├── index.html          # Main application UI
│   ├── style.css           # Styling with dark/light theme
│   └── script.js           # App logic, charts, PDF generation
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.8+
- A [Google AI Studio](https://aistudio.google.com/) API key (free)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/ai-financial-advisor.git
cd ai-financial-advisor
```

### 2. Set up the backend

```bash
cd backend
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file inside the `backend/` folder:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Start the Flask server

```bash
python app.py
```

You should see:

```
  AI Financial Advisor — Backend
  Model    : gemini-2.5-flash
  Port     : 5000
  Currency : Indian Rupees (Rs. / ₹)
  Gemini   : ✓ Configured
```

### 5. Open the frontend

Open `frontend/index.html` directly in your browser. No build step required.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze` | Full financial analysis from user profile |
| `POST` | `/api/chat` | Multi-turn AI advisor conversation |
| `POST` | `/api/spending-advice` | Category-specific spending tips |
| `GET` | `/api/health` | Server health check |

### Example request — `/api/analyze`

```json
{
  "name": "Koushik M",
  "age": 21,
  "employment": "Student",
  "income": 30000,
  "expenses": 18000,
  "savings": 8000,
  "current_savings": 50000,
  "debt": 0,
  "risk_tolerance": "Moderate",
  "goals": "Build Rs.50L corpus in 10 years and start SIP investing",
  "timeline": 10
}
```

### Example response (partial)

```json
{
  "success": true,
  "data": {
    "financial_fitness_score": 78,
    "score_grade": "B+",
    "score_description": "Strong savings discipline with good investment potential...",
    "monthly_analysis": {
      "income": 30000,
      "expenses": 18000,
      "savings": 8000,
      "savings_rate": 26.7
    },
    "investment_roadmap": [
      {
        "priority": 1,
        "category": "Emergency Fund",
        "monthly_amount": 3000,
        "expected_return": "6-7%",
        "risk_level": "Low"
      }
    ]
  }
}
```

---

## How It Works

1. User fills a 3-step form (Personal → Finances → Goals)
2. Frontend sends the profile to the Flask backend via REST API
3. Backend constructs a structured prompt and calls Gemini 2.5 Flash
4. Gemini returns a detailed JSON analysis with scores, projections, and recommendations
5. Frontend renders the dashboard — charts, roadmap, metrics, and goal analysis
6. User can chat with the AI advisor or download a PDF report

---

## Screenshots

> Dashboard · Spending Tracker · Tax Center · AI Chat · PDF Export

*(Add screenshots of your running app here)*

---

## Limitations

- Analysis is AI-generated and for **educational purposes only** — not professional financial advice
- Requires an active internet connection for Gemini API calls
- Free Gemini API has rate limits (60 requests/minute on free tier)

---

## Contact

**Koushik M**
B.Tech CSE (AIML) — Amity University, Bengaluru
📧 koushik.m.official@gmail.com
