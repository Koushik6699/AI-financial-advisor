from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import json
import traceback
import threading
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# ── Configure Gemini ──────────────────────────────────────────────────────────
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
        "endpoints": ["/api/analyze-quick", "/api/analyze-deep", "/api/chat", "/api/spending-advice", "/api/health"]
    })


# ── JSON extractor ────────────────────────────────────────────────────────────
def extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$",        "", text, flags=re.MULTILINE)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start == -1:
        start = text.find("[")
        if start == -1:
            raise ValueError("No JSON found in response")
    open_ch  = text[start]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0; end = start; in_string = False; escape_next = False
    for i, ch in enumerate(text[start:], start):
        if escape_next:              escape_next = False; continue
        if ch == "\\" and in_string: escape_next = True;  continue
        if ch == '"':                in_string = not in_string; continue
        if in_string:                continue
        if ch == open_ch:            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:           end = i; break
    return json.loads(text[start:end + 1])


def build_profile(data):
    return (
        f"Name:{data.get('name','User')} | Age:{data.get('age')} | Employment:{data.get('employment')}\n"
        f"Income:Rs.{data.get('income',0)}/mo | Expenses:Rs.{data.get('expenses',0)}/mo | "
        f"Savings:Rs.{data.get('savings',0)}/mo\n"
        f"Existing Savings:Rs.{data.get('current_savings',0)} | Debt:Rs.{data.get('debt',0)}\n"
        f"Risk:{data.get('risk_tolerance','Moderate')} | Timeline:{data.get('timeline',5)}yrs\n"
        f"Goal:{data.get('goals','N/A')}"
    )


# ── /api/analyze-quick  (Phase 1 — returns in ~15 seconds) ───────────────────
# Score, grade, 6 metrics, monthly snapshot, immediate actions, highlights
@app.route("/api/analyze-quick", methods=["POST"])
def analyze_quick():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini not configured"}), 500
    raw_text = ""
    try:
        data = request.get_json(force=True)
        profile = build_profile(data)

        prompt = f"""Indian CFP expert. Analyze this profile. Return ONLY compact JSON, no markdown.

PROFILE:
{profile}

Return ONLY this JSON (start with {{, end with }}):
{{
  "financial_fitness_score": <0-100>,
  "score_grade": "<A+|A|A-|B+|B|B-|C+|C|D|F>",
  "score_description": "<2 sentences max>",
  "monthly_analysis": {{
    "income": <n>, "expenses": <n>, "savings": <n>,
    "disposable": <n>, "savings_rate": <n>,
    "expense_ratio": <n>, "investment_capacity": <n>
  }},
  "financial_health_metrics": [
    {{"metric": "Emergency Fund Status", "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}},
    {{"metric": "Debt-to-Income Ratio",  "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}},
    {{"metric": "Savings Rate",          "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}},
    {{"metric": "Investment Readiness",  "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}},
    {{"metric": "Cash Flow Health",      "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}},
    {{"metric": "Retirement Trajectory", "status": "<Good|Fair|Poor>", "score": <0-100>, "detail": "<1 sentence>"}}
  ],
  "immediate_action_items": [
    {{"priority": "<High|Medium|Low>", "action": "<action under 10 words>", "impact": "<impact under 10 words>", "timeframe": "<timeframe>", "effort": "<Easy|Medium|Hard>"}}
  ],
  "risk_warnings":       ["<warning under 10 words>"],
  "positive_highlights": ["<highlight under 10 words>"],
  "goal_feasibility": {{
    "goal": "<restate in 1 sentence>",
    "feasibility": "<Highly Feasible|Feasible|Challenging|Difficult>",
    "estimated_achievement_date": "<year>",
    "monthly_required": <n>,
    "current_monthly_savings": <n>,
    "gap": <n>,
    "gap_analysis": "<2 sentences>",
    "milestones": ["<milestone>", "<milestone>", "<milestone>"]
  }}
}}"""

        print(f"[quick] {data.get('name')} — sending phase 1")
        response = gemini_model.generate_content(prompt)
        raw_text = response.text
        result   = extract_json(raw_text)
        print(f"[quick] done — score:{result.get('financial_fitness_score')}")
        return jsonify({"success": True, "data": result})

    except json.JSONDecodeError as e:
        print(f"[quick] JSON error: {e}\n{raw_text[:800]}")
        return jsonify({"success": False, "error": f"JSON parse failed: {e}"}), 500
    except Exception as e:
        print(f"[quick] error: {e}"); traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/analyze-deep  (Phase 2 — roadmap, projections, tax, insights) ───────
@app.route("/api/analyze-deep", methods=["POST"])
def analyze_deep():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini not configured"}), 500
    raw_text = ""
    try:
        data = request.get_json(force=True)
        profile = build_profile(data)

        prompt = f"""Indian CFP expert. Generate investment plan for this profile. Return ONLY compact JSON, no markdown.

PROFILE:
{profile}

Use Indian instruments: PPF, ELSS, NPS, SIP, Nifty index funds, FD.
Use Indian tax laws: 80C (Rs.1.5L), 80D, 80CCD(1B).
Keep all text fields SHORT (under 15 words each).

Return ONLY this JSON (start with {{, end with }}):
{{
  "future_projections": [
    {{"year":1,  "projected_savings":<n>, "projected_investment_value":<n>, "net_worth":<n>}},
    {{"year":3,  "projected_savings":<n>, "projected_investment_value":<n>, "net_worth":<n>}},
    {{"year":5,  "projected_savings":<n>, "projected_investment_value":<n>, "net_worth":<n>}},
    {{"year":10, "projected_savings":<n>, "projected_investment_value":<n>, "net_worth":<n>}},
    {{"year":20, "projected_savings":<n>, "projected_investment_value":<n>, "net_worth":<n>}}
  ],
  "investment_roadmap": [
    {{
      "priority": <1-5>,
      "category": "<PPF|ELSS|NPS|Emergency Fund|Index Fund|FD>",
      "action": "<under 12 words>",
      "allocation_percent": <n>,
      "monthly_amount": <n>,
      "expected_return": "<e.g. 11-13% CAGR>",
      "timeline": "<e.g. 5 years>",
      "risk_level": "<Low|Medium|High>",
      "why": "<under 12 words>"
    }}
  ],
  "spending_breakdown": [
    {{"category":"<n>","suggested_percent":<n>,"suggested_amount":<n>,"current_status":"<On Track|Over Budget|Under Utilized>"}}
  ],
  "spending_tracker_categories": [
    {{"category":"<n>","recommended_monthly":<n>,"icon":"<emoji>","tips":"<under 10 words>"}}
  ],
  "tax_optimization": {{
    "estimated_tax_bracket": "<slab>",
    "annual_tax_estimate": <n>,
    "strategies": [
      {{"strategy":"<name>","potential_savings":"<Rs.X/yr>","how":"<under 15 words>","priority":"<High|Medium|Low>"}}
    ],
    "tax_advantaged_accounts": ["<account: 1 line>"],
    "summary": "<2 sentences>"
  }},
  "ai_insights": "<3 short paragraphs, each under 50 words, Indian context, use their actual numbers>"
}}"""

        print(f"[deep] {data.get('name')} — sending phase 2")
        response = gemini_model.generate_content(prompt)
        raw_text = response.text
        result   = extract_json(raw_text)
        print(f"[deep] done — roadmap items:{len(result.get('investment_roadmap', []))}")
        return jsonify({"success": True, "data": result})

    except json.JSONDecodeError as e:
        print(f"[deep] JSON error: {e}\n{raw_text[:800]}")
        return jsonify({"success": False, "error": f"JSON parse failed: {e}"}), 500
    except Exception as e:
        print(f"[deep] error: {e}"); traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/chat ─────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini not configured"}), 500
    try:
        data         = request.get_json(force=True)
        user_message = data.get("message", "").strip()
        context      = data.get("context", "")
        history      = data.get("history", [])
        if not user_message:
            return jsonify({"success": False, "error": "No message"}), 400

        chat_history = []
        for msg in history[-6:]:
            role = "user" if msg["role"] == "user" else "model"
            chat_history.append({"role": role, "parts": [{"text": msg["content"]}]})

        system_prefix = (
            "You are an Indian financial advisor. Client profile:\n"
            f"{context}\n\n"
            "Give concise advice (3-4 sentences max) using Indian instruments (SIP/PPF/NPS/ELSS) and tax laws.\n"
            "Client question: "
        )
        chat_session = gemini_model.start_chat(history=chat_history)
        response     = chat_session.send_message(system_prefix + user_message)
        return jsonify({"success": True, "response": response.text})

    except Exception as e:
        print(f"[chat] error: {e}"); traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/spending-advice ──────────────────────────────────────────────────────
@app.route("/api/spending-advice", methods=["POST"])
def spending_advice():
    if not gemini_model:
        return jsonify({"success": False, "error": "Gemini not configured"}), 500
    try:
        data     = request.get_json(force=True)
        category = data.get("category", "General")
        amount   = data.get("amount", 0)
        budget   = data.get("budget", 0)
        income   = data.get("income", 0)

        prompt = (
            f'3 tips for "{category}" spending. Spend:Rs.{amount} Budget:Rs.{budget} Income:Rs.{income}.\n'
            "JSON array only: "
            '[{"tip":"<under 12 words>","potential_saving":"Rs.X/month","difficulty":"Easy|Medium|Hard"}]'
        )
        response = gemini_model.generate_content(prompt)
        raw      = response.text.strip()
        raw      = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw      = re.sub(r"\s*```\s*$",        "", raw, flags=re.MULTILINE)
        tips     = json.loads(raw.strip())
        if not isinstance(tips, list):
            raise ValueError("Not array")
        return jsonify({"success": True, "tips": tips[:3]})

    except Exception as e:
        print(f"[spending] error: {e}")
        return jsonify({"success": True, "tips": [
            {"tip": "Track daily expenses using Walnut or ET Money", "potential_saving": "Rs.500-1000/month", "difficulty": "Easy"},
            {"tip": "Set weekly cash limit for this category",        "potential_saving": "Rs.300-800/month",  "difficulty": "Easy"},
            {"tip": "Compare 3 options before any purchase over Rs.500","potential_saving":"Rs.200-600/month", "difficulty": "Medium"}
        ]})


# ── /api/health ───────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "gemini-2.5-flash",
        "currency": "INR",
        "gemini_configured": gemini_model is not None
    })


if __name__ == "__main__":
    print("\n" + "="*55)
    print("  AI Financial Advisor — 2-Phase Backend")
    print("  Phase 1 /api/analyze-quick  → ~15s")
    print("  Phase 2 /api/analyze-deep   → ~20s (parallel)")
    print(f"  Gemini: {'✓ Ready' if gemini_model else '✗ Check .env'}")
    print("="*55 + "\n")
    app.run(debug=True, port=5000)