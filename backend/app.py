from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import json
import traceback
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    "https://finance-advisor-ai.netlify.app",  # production frontend
    "http://localhost:5000",                    # local backend testing
    "http://127.0.0.1:5500",                   # VS Code Live Server
    "null",                                     # local file:// opening
])

# ── Configure Gemini (same pattern as working project) ──────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel("gemini-2.5-flash")
else:
    gemini_model = None
    print("WARNING: GEMINI_API_KEY not found in .env!")

@app.route("/")
def home():
    return jsonify({
        "status": "AI Financial Advisor API is running",
        "model": "gemini-2.5-flash",
        "currency": "INR (Rs. / ₹)",
        "endpoints": ["/api/analyze", "/api/chat", "/api/spending-advice", "/api/health"]
    })


# ── JSON extractor ───────────────────────────────────────────────────────────
def extract_json(text):
    """Robustly extract JSON from Gemini response."""
    text = text.strip()

    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$",        "", text, flags=re.MULTILINE)
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find first complete { ... } block
    start = text.find("{")
    if start == -1:
        start = text.find("[")
        if start == -1:
            raise ValueError("No JSON found in Gemini response")

    open_ch  = text[start]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    end = start
    in_string = False
    escape_next = False

    for i, ch in enumerate(text[start:], start):
        if escape_next:        escape_next = False; continue
        if ch == "\\" and in_string: escape_next = True; continue
        if ch == '"':          in_string = not in_string; continue
        if in_string:          continue
        if ch == open_ch:      depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:     end = i; break

    return json.loads(text[start:end + 1])


# ── /api/analyze ─────────────────────────────────────────────────────────────
@app.route("/api/analyze", methods=["POST"])
def analyze():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini API key not configured in .env"}), 500

    raw_text = ""
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"success": False, "error": "No JSON body received"}), 400

        name     = data.get("name", "User")
        age      = data.get("age", "N/A")
        emp      = data.get("employment", "N/A")
        income   = data.get("income", 0)
        expenses = data.get("expenses", 0)
        savings  = data.get("savings", 0)
        cur_sav  = data.get("current_savings", 0)
        debt     = data.get("debt", 0)
        risk     = data.get("risk_tolerance", "Moderate")
        goals    = data.get("goals", "N/A")
        timeline = data.get("timeline", 5)

        prompt = f"""You are a senior certified financial planner (CFP) with 20 years of experience in India.
Analyze this Indian financial profile and produce a comprehensive personalized financial report.
All monetary values must be in Indian Rupees (no dollar signs).
Use Indian investment options: PPF, ELSS, NPS, SIP, Nifty/Sensex index funds, FD, RD, mutual funds, gold bonds.
Reference Indian tax laws: Section 80C (1.5L limit), 80D, 80CCD(1B) for NPS, LTCG, STCG, new vs old tax regime.

PROFILE:
Name: {name}
Age: {age}
Employment: {emp}
Monthly Income (after tax): Rs.{income}
Monthly Expenses: Rs.{expenses}
Monthly Savings: Rs.{savings}
Existing Savings/Investments: Rs.{cur_sav}
Total Debt: Rs.{debt}
Risk Tolerance: {risk}
Financial Goals: {goals}
Investment Timeline: {timeline} years

YOU MUST respond with ONLY a valid JSON object. No markdown. No extra text. Start directly with {{ and end with }}.

{{
  "financial_fitness_score": <integer 0-100>,
  "score_grade": "<A+|A|A-|B+|B|B-|C+|C|D|F>",
  "score_description": "<2-3 sentence expert assessment>",
  "monthly_analysis": {{
    "income": <number>,
    "expenses": <number>,
    "savings": <number>,
    "disposable": <number>,
    "savings_rate": <number>,
    "expense_ratio": <number>,
    "investment_capacity": <number>
  }},
  "financial_health_metrics": [
    {{"metric": "Emergency Fund Status", "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}},
    {{"metric": "Debt-to-Income Ratio",  "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}},
    {{"metric": "Savings Rate",          "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}},
    {{"metric": "Investment Readiness",  "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}},
    {{"metric": "Cash Flow Health",      "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}},
    {{"metric": "Retirement Trajectory", "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<detail>"}}
  ],
  "future_projections": [
    {{"year": 1,  "projected_savings": <number>, "projected_investment_value": <number>, "net_worth": <number>}},
    {{"year": 3,  "projected_savings": <number>, "projected_investment_value": <number>, "net_worth": <number>}},
    {{"year": 5,  "projected_savings": <number>, "projected_investment_value": <number>, "net_worth": <number>}},
    {{"year": 10, "projected_savings": <number>, "projected_investment_value": <number>, "net_worth": <number>}},
    {{"year": 20, "projected_savings": <number>, "projected_investment_value": <number>, "net_worth": <number>}}
  ],
  "investment_roadmap": [
    {{
      "priority": <integer 1-6>,
      "category": "<e.g. Emergency Fund | ELSS SIP | PPF | NPS | Nifty Index Fund | FD>",
      "action": "<specific actionable step>",
      "allocation_percent": <number>,
      "monthly_amount": <number>,
      "expected_return": "<e.g. 11-13% CAGR>",
      "timeline": "<e.g. 3-5 years>",
      "risk_level": "<Low|Medium|High>",
      "why": "<why this fits their profile>"
    }}
  ],
  "spending_breakdown": [
    {{"category": "<category>", "suggested_percent": <number>, "suggested_amount": <number>, "current_status": "<On Track|Over Budget|Under Utilized>"}}
  ],
  "tax_optimization": {{
    "estimated_tax_bracket": "<e.g. 20% slab (Rs.10L-12L)>",
    "annual_tax_estimate": <number>,
    "strategies": [
      {{"strategy": "<e.g. Maximize Section 80C>", "potential_savings": "<e.g. Rs.46800/year>", "how": "<step-by-step>", "priority": "<High|Medium|Low>"}}
    ],
    "tax_advantaged_accounts": ["<e.g. PPF: 7.1% tax-free, Rs.1.5L limit under 80C>"],
    "summary": "<2 sentence Indian tax planning summary>"
  }},
  "spending_tracker_categories": [
    {{"category": "<name>", "recommended_monthly": <number>, "icon": "<emoji>", "tips": "<tip>"}}
  ],
  "immediate_action_items": [
    {{"priority": "<High|Medium|Low>", "action": "<action>", "impact": "<impact>", "timeframe": "<timeframe>", "effort": "<Easy|Medium|Hard>"}}
  ],
  "risk_warnings": ["<warning>"],
  "positive_highlights": ["<highlight>"],
  "ai_insights": "<4-5 paragraph personalized narrative using Indian investment context and their specific numbers>",
  "goal_feasibility": {{
    "goal": "<restate their goal>",
    "feasibility": "<Highly Feasible|Feasible|Challenging|Difficult>",
    "estimated_achievement_date": "<year or month/year>",
    "monthly_required": <number>,
    "current_monthly_savings": <number>,
    "gap": <number>,
    "gap_analysis": "<specific gap analysis>",
    "milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
  }}
}}"""

        print(f"\n{'='*55}")
        print(f"[analyze] User: {name} | Income: Rs.{income} | Risk: {risk}")

        response  = gemini_model.generate_content(prompt)
        raw_text  = response.text
        print(f"[analyze] Response: {len(raw_text)} chars | Preview: {raw_text[:200]}")

        analysis  = extract_json(raw_text)
        print(f"[analyze] OK — Score: {analysis.get('financial_fitness_score')}, Grade: {analysis.get('score_grade')}")
        return jsonify({"success": True, "data": analysis})

    except json.JSONDecodeError as e:
        print(f"[analyze] JSON ERROR: {e}\nRaw:\n{raw_text[:1500]}")
        return jsonify({"success": False, "error": f"AI returned malformed JSON. Please try again. ({e})"}), 500
    except Exception as e:
        print(f"[analyze] ERROR: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/chat ─────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini API key not configured"}), 500

    try:
        data         = request.get_json(force=True)
        user_message = data.get("message", "").strip()
        context      = data.get("context", "")
        history      = data.get("history", [])

        if not user_message:
            return jsonify({"success": False, "error": "No message provided"}), 400

        # Build chat history in Gemini format
        chat_history = []
        for msg in history[-6:]:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append({"role": role, "parts": [{"text": msg["content"]}]})

        system_prefix = (
            "You are a senior AI Financial Advisor specializing in Indian personal finance, "
            "SIP, mutual funds, PPF, NPS, ELSS, tax planning under Indian law, and wealth management.\n"
            f"Client financial profile:\n{context}\n\n"
            "Give precise, actionable advice using Indian financial instruments and tax laws. "
            "Reference their actual numbers. Keep responses concise (3-5 sentences) unless detail is needed.\n\n"
            "Client question: "
        )

        chat_session = gemini_model.start_chat(history=chat_history)
        response     = chat_session.send_message(system_prefix + user_message)
        return jsonify({"success": True, "response": response.text})

    except Exception as e:
        print(f"[chat] ERROR: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/spending-advice ──────────────────────────────────────────────────────
@app.route("/api/spending-advice", methods=["POST"])
def spending_advice():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini API key not configured"}), 500

    try:
        data     = request.get_json(force=True)
        category = data.get("category", "General")
        amount   = data.get("amount", 0)
        budget   = data.get("budget", 0)
        income   = data.get("income", 0)

        prompt = (
            f'As an Indian financial advisor, give 3 specific actionable tips for the "{category}" spending category.\n'
            f"Current spend: Rs.{amount}/month. Recommended budget: Rs.{budget}/month. Monthly income: Rs.{income}.\n"
            "Respond with ONLY a JSON array — no markdown, no extra text:\n"
            '[{"tip": "...", "potential_saving": "Rs.X/month", "difficulty": "Easy|Medium|Hard"}]'
        )

        response = gemini_model.generate_content(prompt)
        raw      = response.text.strip()

        # Strip markdown fences
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```\s*$",        "", raw, flags=re.MULTILINE)
            raw = raw.strip()

        tips = json.loads(raw)
        if not isinstance(tips, list):
            raise ValueError("Not a JSON array")

        return jsonify({"success": True, "tips": tips[:3]})

    except Exception as e:
        print(f"[spending-advice] ERROR: {e} — returning fallback tips")
        # Always return fallback so UI never breaks
        return jsonify({
            "success": True,
            "tips": [
                {"tip": "Track every expense daily using a free app like Walnut or ET Money", "potential_saving": "Rs.500-1000/month", "difficulty": "Easy"},
                {"tip": "Set a weekly cash limit for this category to avoid impulse spending",  "potential_saving": "Rs.300-800/month",  "difficulty": "Easy"},
                {"tip": "Compare 3 alternatives before any purchase above Rs.500",              "potential_saving": "Rs.200-600/month",  "difficulty": "Medium"}
            ]
        })


# ── /api/health ───────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "gemini-2.5-flash",
        "currency": "INR (Rs. / ₹)",
        "gemini_configured": gemini_model is not None
    })


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  AI Financial Advisor — Backend")
    print("  Model    : gemini-2.5-flash")
    print("  Port     : 5000")
    print("  Currency : Indian Rupees (Rs. / ₹)")
    print(f"  Gemini   : {'✓ Configured' if gemini_model else '✗ NOT configured — check .env'}")
    print("=" * 55 + "\n")
    app.run(debug=True, port=5000)