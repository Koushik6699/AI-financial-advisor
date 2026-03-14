/* ──────────────────────────────────────────
   AI Financial Advisor — script.js
   Currency: Indian Rupees (₹)
────────────────────────────────────────── */

const API = "https://ai-financial-advisor-vi9p.onrender.com/api";
let analysisData = null;
let financialContext = "";
let chatHistory = [];
let projChart = null;
let budgetChart = null;
let trackerData = {};

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));

  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add("active");

  const link = document.querySelector(`[data-page="${name}"]`);
  if (link) link.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "tracker" && analysisData) buildTracker();
  if (name === "tax" && analysisData) buildTaxPage();
}

function scrollToFeatures() {
  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
}

function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("open");
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  if (analysisData) {
    setTimeout(() => {
      renderProjectionChart(analysisData.future_projections);
      renderBudgetChart(analysisData.spending_breakdown);
    }, 150);
  }
}

// ══════════════════════════════════════════
// FORM LOGIC
// ══════════════════════════════════════════
function goStep(n) {
  const cur = parseInt(document.querySelector(".fstep-body.active").id.split("-")[1]);
  if (n > cur && !validateStep(cur)) return;

  document.querySelectorAll(".fstep-body").forEach(b => b.classList.remove("active"));
  document.getElementById(`fbody-${n}`).classList.add("active");

  document.querySelectorAll(".fstep").forEach((f, i) => {
    const s = i + 1;
    f.classList.remove("active", "done");
    if (s === n) f.classList.add("active");
    else if (s < n) f.classList.add("done");
  });

  if (n === 2) updateCashflowPreview();
}

function validateStep(n) {
  if (n === 1) {
    if (!v("f-name") || !v("f-age") || !v("f-employment") || !v("f-risk")) {
      alert("Please fill in all fields and select a risk tolerance."); return false;
    }
  }
  if (n === 2) {
    if (!v("f-income") || !v("f-expenses") || !v("f-savings")) {
      alert("Please fill in income, expenses and savings fields."); return false;
    }
  }
  if (n === 3) {
    if (!v("f-goals") || !v("f-timeline")) {
      alert("Please enter your goal and select an investment timeline."); return false;
    }
  }
  return true;
}

function v(id) { return document.getElementById(id)?.value?.trim(); }

function pickRisk(btn) {
  document.querySelectorAll(".risk-card").forEach(b => b.classList.remove("sel"));
  btn.classList.add("sel");
  document.getElementById("f-risk").value = btn.dataset.v;
}

function pickTimeline(btn) {
  document.querySelectorAll(".tl-btn").forEach(b => b.classList.remove("sel"));
  btn.classList.add("sel");
  document.getElementById("f-timeline").value = btn.dataset.v;
}

function updateCashflowPreview() {
  const income   = parseFloat(v("f-income"))   || 0;
  const expenses = parseFloat(v("f-expenses")) || 0;
  const savings  = parseFloat(v("f-savings"))  || 0;
  const surplus  = income - expenses - savings;
  const rate     = income > 0 ? ((savings / income) * 100).toFixed(1) : 0;

  const el = document.getElementById("cashflowPreview");
  if (!income) { el.classList.remove("show"); return; }

  el.classList.add("show");
  el.innerHTML = `
    <div class="cf-item"><div class="cf-val cf-positive">${rsFmt(income)}</div><div class="cf-key">Income</div></div>
    <div class="cf-item"><div class="cf-val cf-negative">${rsFmt(expenses)}</div><div class="cf-key">Expenses</div></div>
    <div class="cf-item"><div class="cf-val cf-neutral">${rsFmt(savings)}</div><div class="cf-key">Savings</div></div>
    <div class="cf-item"><div class="cf-val ${surplus >= 0 ? 'cf-positive' : 'cf-negative'}">${rsFmt(Math.abs(surplus))}</div><div class="cf-key">${surplus >= 0 ? 'Surplus' : 'Deficit'}</div></div>
    <div class="cf-item"><div class="cf-val cf-neutral">${rate}%</div><div class="cf-key">Savings Rate</div></div>
  `;
}

["f-income","f-expenses","f-savings"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", updateCashflowPreview);
});

// ══════════════════════════════════════════
// FORM SUBMIT
// ══════════════════════════════════════════
async function submitForm(e) {
  e.preventDefault();
  if (!validateStep(3)) return;

  const payload = {
    name:            v("f-name"),
    age:             v("f-age"),
    employment:      v("f-employment"),
    risk_tolerance:  v("f-risk"),
    income:          v("f-income"),
    expenses:        v("f-expenses"),
    savings:         v("f-savings"),
    current_savings: v("f-currentsavings") || 0,
    debt:            v("f-debt")           || 0,
    goals:           v("f-goals"),
    timeline:        v("f-timeline"),
  };

  financialContext = `
Name: ${payload.name} | Age: ${payload.age} | Employment: ${payload.employment}
Monthly Income: ${rsFmt(payload.income)} | Expenses: ${rsFmt(payload.expenses)} | Savings: ${rsFmt(payload.savings)}
Existing Savings: ${rsFmt(payload.current_savings)} | Total Debt: ${rsFmt(payload.debt)}
Risk: ${payload.risk_tolerance} | Timeline: ${payload.timeline} years
Goal: ${payload.goals}
  `.trim();

  document.getElementById("btn-text").classList.add("hidden");
  document.getElementById("btn-loader").classList.remove("hidden");
  document.getElementById("analyzeBtn").disabled = true;

  showLoading();
  animateLoadingSteps();

  try {
    // Step 1: Wake up Render server (free tier sleeps after inactivity)
    setLoadingMessage("Waking up server...");
    try {
      await fetch(`${API}/health`, { method: "GET", signal: AbortSignal.timeout(8000) });
    } catch (_) {
      // Server might still be waking — wait and continue anyway
      await new Promise(r => setTimeout(r, 3000));
    }

    // Step 2: Send actual analysis request (with longer timeout for Gemini)
    setLoadingMessage("Gemini AI is processing your profile...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout

    const res = await fetch(`${API}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const result = await res.json();

    if (result.success) {
      analysisData = result.data;
      trackerData = {};
      buildDashboard(analysisData);
      unlockNav();
      hideLoading();
      showPage("dashboard");
    } else {
      hideLoading();
      alert(`Analysis failed: ${result.error || "Unknown error"}\n\nPlease try again.`);
    }
  } catch (err) {
    hideLoading();
    console.error("Fetch error:", err);
    if (err.name === "AbortError") {
      alert("⏱️ Request timed out.\n\nGemini AI took too long to respond. Please try again — the server is now awake and the next attempt will be faster.");
    } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      alert("❌ Could not reach the backend.\n\nPossible reasons:\n• Render server is still waking up (wait 30 sec and retry)\n• Check: https://ai-financial-advisor-vi9p.onrender.com/api/health");
    } else {
      alert(`❌ Error: ${err.message}\n\nPlease try again.`);
    }
  } finally {
    document.getElementById("btn-text").classList.remove("hidden");
    document.getElementById("btn-loader").classList.add("hidden");
    document.getElementById("analyzeBtn").disabled = false;
  }
}

// ══════════════════════════════════════════
// LOADING
// ══════════════════════════════════════════
function showLoading() { document.getElementById("loadingOverlay").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loadingOverlay").classList.add("hidden"); }
function setLoadingMessage(msg) {
  const el = document.getElementById("loading-sub");
  if (el) el.textContent = msg;
}

function animateLoadingSteps() {
  ["lp1","lp2","lp3","lp4","lp5"].forEach((id, i) => {
    setTimeout(() => {
      document.getElementById(id)?.classList.add("done");
    }, (i + 1) * 900);
  });
}

function unlockNav() {
  ["navDashboard","navTracker","navTax","navChat"].forEach(id => {
    document.getElementById(id)?.classList.remove("disabled");
  });
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function buildDashboard(d) {
  document.getElementById("dashTitle").textContent = "Financial Dashboard";
  document.getElementById("dashSub").textContent =
    `Report for ${v("f-name") || "you"} · Generated ${new Date().toLocaleDateString("en-IN")}`;

  renderScoreRing(d.financial_fitness_score, d.score_grade, d.score_description);
  renderHealthMetrics(d.financial_health_metrics);
  renderMonthlySnap(d.monthly_analysis);
  renderProjectionChart(d.future_projections);
  renderBudgetChart(d.spending_breakdown);
  renderRoadmap(d.investment_roadmap);
  renderActions(d.immediate_action_items);
  renderInsights(d.ai_insights, d.positive_highlights, d.risk_warnings);
  renderGoal(d.goal_feasibility);
}

function renderScoreRing(score, grade, desc) {
  document.getElementById("bigScore").textContent = score;
  document.getElementById("bigGrade").textContent = grade;
  document.getElementById("scoreDesc").textContent = desc;
  const offset = 377 - (score / 100) * 377;
  setTimeout(() => {
    document.getElementById("ringFg").style.strokeDashoffset = offset;
  }, 300);
}

function renderHealthMetrics(metrics) {
  document.getElementById("scoreMetrics").innerHTML = metrics.map(m => `
    <div class="smetric">
      <div class="smetric-name">${m.metric}</div>
      <div class="smetric-status s-${m.status}">${m.status}${m.score !== undefined ? ` · ${m.score}/100` : ''}</div>
      <div class="smetric-detail">${m.detail}</div>
    </div>
  `).join("");
}

function renderMonthlySnap(ma) {
  const income = ma.income || 1;
  const bars = [
    { label: "Monthly Income",       val: ma.income,                                   pct: 100, color: "#3b82f6" },
    { label: "Expenses",              val: ma.expenses,                                  pct: (ma.expenses / income) * 100, color: "#ef4444" },
    { label: "Savings",               val: ma.savings,                                   pct: (ma.savings / income) * 100, color: "#22c55e" },
    { label: "Investment Capacity",   val: ma.investment_capacity || ma.disposable,       pct: ((ma.investment_capacity || ma.disposable) / income) * 100, color: "#a855f7" },
  ];
  document.getElementById("monthlySnap").innerHTML = `<div class="snap-row">` + bars.map(b => `
    <div class="snap-item">
      <div class="snap-meta">
        <span class="snap-label">${b.label}</span>
        <span class="snap-val" style="color:${b.color}">${rsFmt(b.val)}</span>
      </div>
      <div class="snap-track">
        <div class="snap-fill" style="background:${b.color}" data-w="${Math.min(Math.max(b.pct,0),100).toFixed(1)}"></div>
      </div>
    </div>
  `).join("") + `</div>`;
  setTimeout(() => {
    document.querySelectorAll(".snap-fill").forEach(el => { el.style.width = el.dataset.w + "%"; });
  }, 400);
}

function renderProjectionChart(proj) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gc = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const tc = isDark ? "#8a97ab" : "#6b7280";
  const ctx = document.getElementById("projChart").getContext("2d");
  if (projChart) projChart.destroy();
  projChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: proj.map(p => `Year ${p.year}`),
      datasets: [
        { label: "Savings", data: proj.map(p => p.projected_savings), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", fill: true, tension: 0.4, pointRadius: 4 },
        { label: "Investments", data: proj.map(p => p.projected_investment_value), borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.08)", fill: true, tension: 0.4, pointRadius: 4 },
        { label: "Net Worth", data: proj.map(p => p.net_worth || (p.projected_savings + p.projected_investment_value)), borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.06)", fill: true, tension: 0.4, pointRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: tc, font: { family: "'Geist'" }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => ` ${rsShort(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: tc }, grid: { color: gc } },
        y: { ticks: { color: tc, callback: v => rsShort(v) }, grid: { color: gc } }
      }
    }
  });
}

function renderBudgetChart(breakdown) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const ctx = document.getElementById("budgetChart").getContext("2d");
  if (budgetChart) budgetChart.destroy();
  const colors = ["#3b82f6","#a855f7","#22c55e","#f59e0b","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"];
  budgetChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: breakdown.map(b => b.category),
      datasets: [{ data: breakdown.map(b => b.suggested_percent), backgroundColor: colors.slice(0, breakdown.length), borderWidth: 2, borderColor: isDark ? "#131820" : "#ffffff" }]
    },
    options: {
      cutout: "68%", responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed}% (${rsFmt(breakdown[c.dataIndex]?.suggested_amount || 0)})` } }
      }
    }
  });
  document.getElementById("budgetLegend").innerHTML = `<div class="budget-legend">` +
    breakdown.map((b, i) => `<div class="bl-item"><div class="bl-dot" style="background:${colors[i % colors.length]}"></div>${b.category} ${b.suggested_percent}%</div>`).join("") +
    `</div>`;
}

function renderRoadmap(roadmap) {
  document.getElementById("roadmapGrid").innerHTML = roadmap.map(r => {
    const prioClass = r.priority <= 3 ? `prio-${r.priority}` : "prio-other";
    return `
    <div class="rm-card">
      <div class="rm-prio ${prioClass}">Priority ${r.priority}</div>
      <div class="rm-cat">${r.category}</div>
      <div class="rm-action">${r.action}</div>
      <div class="rm-why">${r.why}</div>
      <div class="rm-stats">
        <div><div class="rm-stat-v text-accent">${rsFmt(r.monthly_amount)}/mo</div><div class="rm-stat-k">Monthly SIP</div></div>
        <div><div class="rm-stat-v text-green">${r.expected_return}</div><div class="rm-stat-k">Returns</div></div>
        <div><div class="rm-stat-v" style="color:var(--purple)">${r.allocation_percent}%</div><div class="rm-stat-k">Allocation</div></div>
      </div>
      <span class="risk-pill rp-${r.risk_level}">${r.risk_level} Risk · ${r.timeline}</span>
    </div>`;
  }).join("");
}

function renderActions(actions) {
  document.getElementById("actionPlan").innerHTML = `<div class="action-list">` + actions.map(a => `
    <div class="act-item">
      <div class="act-prio-dot apd-${a.priority}"></div>
      <div>
        <div class="act-title">${a.action}</div>
        <div class="act-impact">${a.impact}</div>
        <div class="act-meta">
          <span class="act-tag">⏱ ${a.timeframe}</span>
          <span class="act-tag">⚡ ${a.effort}</span>
          <span class="act-tag">${a.priority} Priority</span>
        </div>
      </div>
    </div>
  `).join("") + `</div>`;
}

function renderInsights(insights, highlights, warnings) {
  document.getElementById("insightBody").textContent = insights;
  document.getElementById("chipRow").innerHTML = [
    ...(highlights || []).map(h => `<span class="chip-good">✓ ${h}</span>`),
    ...(warnings  || []).map(w => `<span class="chip-warn">⚠ ${w}</span>`)
  ].join("");
}

function renderGoal(gf) {
  if (!gf) return;
  const emoji = { "Highly Feasible": "🎯", "Feasible": "✅", "Challenging": "⚡", "Difficult": "⚠️" }[gf.feasibility] || "📊";
  const gap = (gf.monthly_required || 0) - (gf.current_monthly_savings || 0);
  document.getElementById("goalBody").innerHTML = `
    <div class="goal-grid">
      <div>
        <div class="goal-feas-badge gf-${gf.feasibility.replace(/\s/g,'-')}">${emoji} ${gf.feasibility}</div>
        <p class="goal-text-block"><strong>Goal:</strong> ${gf.goal}</p>
        <p class="goal-text-block" style="margin-top:10px">${gf.gap_analysis}</p>
        <div class="goal-milestones">
          ${(gf.milestones || []).map(m => `<div class="milestone">${m}</div>`).join("")}
        </div>
      </div>
      <div>
        <div class="goal-stat-grid">
          <div class="gstat"><div class="gstat-v">${gf.estimated_achievement_date}</div><div class="gstat-k">Est. Achievement</div></div>
          <div class="gstat"><div class="gstat-v">${rsFmt(gf.monthly_required)}</div><div class="gstat-k">Monthly Required</div></div>
          <div class="gstat"><div class="gstat-v">${rsFmt(gf.current_monthly_savings)}</div><div class="gstat-k">Currently Saving</div></div>
          <div class="gstat"><div class="gstat-v ${gap > 0 ? 'text-red' : 'text-green'}">${gap > 0 ? '-' : '+'}${rsFmt(Math.abs(gap))}</div><div class="gstat-k">${gap > 0 ? 'Monthly Gap' : 'Surplus'}</div></div>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// SPENDING TRACKER
// ══════════════════════════════════════════
function buildTracker() {
  if (!analysisData?.spending_tracker_categories) return;
  const cats = analysisData.spending_tracker_categories;
  const income = analysisData.monthly_analysis?.income || 50000;

  document.getElementById("trackerGrid").innerHTML = cats.map((cat, i) => {
    const spent = trackerData[cat.category] || 0;
    const budget = cat.recommended_monthly;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const barColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
    return `
    <div class="tracker-card" id="tc-${i}">
      <div class="tc-header">
        <span class="tc-icon">${cat.icon}</span>
        <div>
          <div class="tc-title">${cat.category}</div>
          <div class="tc-budget">Budget: ${rsFmt(budget)}/mo</div>
        </div>
      </div>
      <div class="tc-input-row">
        <input class="tc-input" type="number" placeholder="Enter amount spent (₹)" value="${spent || ''}"
          oninput="updateTracker(${i}, '${cat.category}', ${budget}, ${income}, this.value)"
          id="tinput-${i}"/>
        <button class="tc-tips-btn" onclick="fetchSpendingTips(${i}, '${cat.category}', ${budget}, ${income})">AI Tips</button>
      </div>
      <div class="tc-bar-wrap">
        <div class="tc-bar-label">
          <span id="tspent-${i}">${rsFmt(spent)} spent</span>
          <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="tc-bar-track"><div class="tc-bar-fill" id="tbar-${i}" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="tc-status ${spent > budget ? 'text-red' : 'text-green'}" id="tstatus-${i}">
          ${spent > budget ? `⚠ ${rsFmt(spent - budget)} over budget` : spent > 0 ? `✓ ${rsFmt(budget - spent)} remaining` : cat.tips}
        </div>
      </div>
      <div class="tc-tips-panel" id="ttips-${i}"></div>
    </div>`;
  }).join("");
  updateTrackerSummary(income);
}

function updateTracker(i, category, budget, income, rawVal) {
  const val = parseFloat(rawVal) || 0;
  trackerData[category] = val;
  const pct = budget > 0 ? Math.min((val / budget) * 100, 100) : 0;
  const over = val > budget;
  const barColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";

  const bar = document.getElementById(`tbar-${i}`);
  const status = document.getElementById(`tstatus-${i}`);
  const spentEl = document.getElementById(`tspent-${i}`);
  if (bar) { bar.style.width = pct + "%"; bar.style.background = barColor; }
  if (status) {
    status.className = `tc-status ${over ? "text-red" : "text-green"}`;
    status.textContent = over ? `⚠ ${rsFmt(val - budget)} over budget` : val > 0 ? `✓ ${rsFmt(budget - val)} remaining` : "";
  }
  if (spentEl) spentEl.textContent = `${rsFmt(val)} spent`;
  updateTrackerSummary(income);
}

function updateTrackerSummary(income) {
  const totalSpent  = Object.values(trackerData).reduce((a, b) => a + b, 0);
  const totalBudget = (analysisData?.spending_tracker_categories || []).reduce((a, c) => a + c.recommended_monthly, 0);
  const remaining   = totalBudget - totalSpent;
  const pct         = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;

  document.getElementById("trackerSummary").innerHTML = `
    <div class="card-top" style="margin-bottom:20px"><h3>Month Summary</h3></div>
    <div class="ts-grid">
      <div class="ts-item"><div class="ts-val text-accent">${rsFmt(totalSpent)}</div><div class="ts-key">Total Spent</div></div>
      <div class="ts-item"><div class="ts-val">${pct}%</div><div class="ts-key">Budget Used</div></div>
      <div class="ts-item"><div class="ts-val ${remaining < 0 ? "text-red" : "text-green"}">${rsFmt(Math.abs(remaining))}</div><div class="ts-key">${remaining < 0 ? "Over Budget" : "Remaining"}</div></div>
      <div class="ts-item"><div class="ts-val">${Object.keys(trackerData).length}</div><div class="ts-key">Tracked</div></div>
    </div>`;
}

async function fetchSpendingTips(i, category, budget, income) {
  const spent = parseFloat(document.getElementById(`tinput-${i}`)?.value) || budget;
  const panel = document.getElementById(`ttips-${i}`);
  panel.classList.add("open");
  panel.innerHTML = `<div class="tc-tip"><strong>Fetching AI tips...</strong></div>`;

  try {
    const res = await fetch(`${API}/spending-advice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, amount: spent, budget, income })
    });
    const result = await res.json();
    panel.innerHTML = (result.tips || []).map(t => `
      <div class="tc-tip">
        <strong>${t.tip}</strong>
        Save ${t.potential_saving} · ${t.difficulty}
      </div>`).join("");
  } catch {
    panel.innerHTML = `<div class="tc-tip"><strong>Tip:</strong> Track expenses daily and review weekly to stay on budget.</div>`;
  }
}

// ══════════════════════════════════════════
// TAX PAGE
// ══════════════════════════════════════════
function buildTaxPage() {
  if (!analysisData?.tax_optimization) return;
  const tax = analysisData.tax_optimization;
  document.getElementById("taxContent").innerHTML = `
    <div class="tax-summary-banner">
      <div>
        <div class="tax-bracket-label">Your Tax Slab</div>
        <div class="tax-bracket-value">${tax.estimated_tax_bracket}</div>
        <div style="margin-top:8px;font-size:0.85rem;color:var(--text2)">Est. Annual Tax: <strong>${rsFmt(tax.annual_tax_estimate)}</strong></div>
      </div>
      <div class="tax-summary-text">${tax.summary}</div>
    </div>

    <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px">Tax-Saving Strategies</h3>
    <div class="tax-strategies">
      ${(tax.strategies || []).map(s => `
        <div class="strat-card">
          <div class="strat-header">
            <div>
              <div class="strat-name">${s.strategy}</div>
              <div class="strat-saving">Save ${s.potential_savings}</div>
            </div>
            <span class="strat-prio sp-${s.priority}">${s.priority}</span>
          </div>
          <div class="strat-how">${s.how}</div>
        </div>`).join("")}
    </div>

    <div class="tax-accounts" style="margin-top:28px">
      <h3>Recommended Tax-Advantaged Instruments</h3>
      <div class="tax-acc-list">
        ${(tax.tax_advantaged_accounts || []).map(acc => `<div class="tax-acc-item">🏦 ${acc}</div>`).join("")}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// AI CHAT
// ══════════════════════════════════════════
async function sendMsg() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  appendMsg("user", text);
  chatHistory.push({ role: "user", content: text });
  showTyping();

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context: financialContext, history: chatHistory })
    });
    const result = await res.json();
    removeTyping();
    const reply = result.response || "Sorry, I couldn't generate a response.";
    appendMsg("ai", reply);
    chatHistory.push({ role: "assistant", content: reply });
  } catch {
    removeTyping();
    appendMsg("ai", "⚠️ Backend connection failed. Make sure Flask is running: python app.py");
  }
}

function askQ(text) { document.getElementById("chatInput").value = text; sendMsg(); }

function appendMsg(role, text) {
  const body = document.getElementById("chatBody");
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-bubble">${esc(text)}</div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function showTyping() {
  const body = document.getElementById("chatBody");
  const div = document.createElement("div");
  div.id = "typingIndicator"; div.className = "msg ai";
  div.innerHTML = `<div class="typing"><div class="td"></div><div class="td"></div><div class="td"></div></div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function removeTyping() { document.getElementById("typingIndicator")?.remove(); }

function clearChat() {
  chatHistory = [];
  document.getElementById("chatBody").innerHTML = `
    <div class="msg ai"><div class="msg-bubble">Chat cleared. How can I help with your finances?</div></div>`;
}

// ══════════════════════════════════════════
// PDF REPORT (₹ throughout)
// ══════════════════════════════════════════
async function downloadPDF() {
  if (!analysisData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const d = analysisData;
  const W = 210, M = 20;
  let y = 0;
  const dateStr = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  function newPage() {
    doc.addPage(); y = 20;
    doc.setFillColor(8,11,18); doc.rect(0,0,W,12,"F");
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,120,150);
    doc.text("AI Financial Advisor — Confidential Report", M, 8);
    doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, W-M, 8, {align:"right"});
    y = 22;
  }
  function chk(n=25) { if (y+n > 270) newPage(); }
  function secHead(title, r=37,g=130,b=246) {
    chk(18);
    doc.setFillColor(r,g,b); doc.rect(M,y,4,8,"F");
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(20,28,40);
    doc.text(title, M+8, y+6); y+=13;
    doc.setDrawColor(220,228,240); doc.line(M,y,W-M,y); y+=5;
  }
  function lv(label, val, vr,vg,vb) {
    chk(9);
    doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(100,115,135);
    doc.text(label+":", M, y);
    doc.setFont("helvetica","bold");
    if(vr!==undefined) doc.setTextColor(vr,vg,vb); else doc.setTextColor(20,30,50);
    doc.text(String(val), M+58, y); y+=7;
  }
  function body(text, ind=0) {
    const lines = doc.splitTextToSize(String(text), W-M*2-ind);
    chk(lines.length*5+3);
    doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(55,70,90);
    doc.text(lines, M+ind, y); y+=lines.length*5+3;
  }

  // COVER
  doc.setFillColor(8,11,18); doc.rect(0,0,W,297,"F");
  doc.setFillColor(37,99,235); doc.rect(0,0,W/2,5,"F");
  doc.setFillColor(124,58,237); doc.rect(W/2,0,W/2,5,"F");
  doc.setFontSize(36); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  doc.text("AI Financial", W/2, 95, {align:"center"});
  doc.text("Advisor", W/2, 112, {align:"center"});
  doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(96,165,250);
  doc.text("Personalized Financial Health & Investment Report (INR)", W/2, 125, {align:"center"});
  doc.setDrawColor(59,130,246); doc.setLineWidth(4); doc.circle(W/2,163,30);
  doc.setFillColor(20,30,50); doc.circle(W/2,163,27,"F");
  doc.setFontSize(28); doc.setFont("helvetica","bold"); doc.setTextColor(96,165,250);
  doc.text(String(d.financial_fitness_score), W/2, 169, {align:"center"});
  doc.setFontSize(9); doc.setTextColor(168,85,247);
  doc.text(`Grade ${d.score_grade} · Financial Fitness Score`, W/2, 182, {align:"center"});
  doc.setFontSize(8); doc.setTextColor(80,100,130);
  doc.text(`Prepared for: ${v("f-name")||"Client"} · ${dateStr}`, W/2, 238, {align:"center"});
  doc.text("Powered by Gemini 2.5 Flash · AI Financial Advisor", W/2, 246, {align:"center"});
  doc.setFontSize(7); doc.setTextColor(50,65,85);
  doc.text("For educational purposes only. Not professional financial advice.", W/2, 282, {align:"center"});

  // PAGE 2: SUMMARY
  newPage();
  secHead("Financial Summary");
  lv("Fitness Score", `${d.financial_fitness_score}/100 — ${d.score_grade}`, 59,130,246);
  body(d.score_description); y+=3;
  secHead("Monthly Snapshot (₹)", 16,163,74);
  const ma = d.monthly_analysis;
  lv("Income", rsFmt(ma.income)); lv("Expenses", rsFmt(ma.expenses));
  lv("Savings", rsFmt(ma.savings)); lv("Savings Rate", ma.savings_rate+"%");
  lv("Investment Capacity", rsFmt(ma.investment_capacity||ma.disposable)); y+=3;
  secHead("Health Metrics", 245,158,11);
  d.financial_health_metrics.forEach(m => {
    chk(14);
    const c = m.status==="Good"?[16,185,129]:m.status==="Fair"?[245,158,11]:[239,68,68];
    doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...c);
    doc.text(`• ${m.metric}: ${m.status}${m.score!==undefined?` (${m.score}/100)`:""}`, M, y); y+=5;
    body(m.detail, 4);
  });

  // PAGE 3: ROADMAP
  newPage();
  secHead("Personalized Investment Roadmap");
  d.investment_roadmap.forEach((r,i2) => {
    chk(44);
    doc.setFillColor(235,241,252); doc.rect(M,y,W-M*2,7,"F");
    doc.setFontSize(9.5); doc.setFont("helvetica","bold"); doc.setTextColor(20,35,65);
    doc.text(`${i2+1}. ${r.category}`, M+4, y+5);
    doc.setFontSize(7.5); doc.setFont("helvetica","normal"); doc.setTextColor(59,130,246);
    doc.text(`Priority ${r.priority} · ${r.risk_level} Risk · ${r.expected_return}`, W-M-4, y+5, {align:"right"});
    y+=10; body(r.action,4); body(r.why,4);
    doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(40,60,100);
    doc.text(`${rsFmt(r.monthly_amount)}/mo · ${r.allocation_percent}% allocation · ${r.timeline}`, M+4, y); y+=10;
    doc.setDrawColor(220,230,245); doc.line(M,y,W-M,y); y+=5;
  });

  // PAGE 4: PROJECTIONS
  newPage();
  secHead("20-Year Wealth Projections (₹)", 124,58,237);
  const cols=(W-M*2)/4;
  doc.setFillColor(59,130,246); doc.rect(M,y,W-M*2,8,"F");
  doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  ["Year","Savings","Investments","Net Worth"].forEach((h,i2)=>{
    doc.text(h, M+i2*cols+cols/2, y+5.5, {align:"center"});
  });
  y+=8;
  d.future_projections.forEach((p,i2)=>{
    doc.setFillColor(...(i2%2===0?[248,250,255]:[240,244,253]));
    doc.rect(M,y,W-M*2,8,"F");
    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(35,50,75);
    doc.text(`Year ${p.year}`, M+cols/2, y+5.5, {align:"center"});
    doc.text(rsShort(p.projected_savings), M+cols+cols/2, y+5.5, {align:"center"});
    doc.text(rsShort(p.projected_investment_value), M+cols*2+cols/2, y+5.5, {align:"center"});
    doc.setFont("helvetica","bold"); doc.setTextColor(37,99,235);
    doc.text(rsShort(p.net_worth||p.projected_savings+p.projected_investment_value), M+cols*3+cols/2, y+5.5, {align:"center"});
    y+=8;
  });
  y+=6;
  secHead("Priority Action Plan", 239,68,68);
  d.immediate_action_items.forEach(a=>{
    chk(20);
    const c=a.priority==="High"?[239,68,68]:a.priority==="Medium"?[245,158,11]:[34,197,94];
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...c);
    doc.text(`[${a.priority}] ${a.action}`, M, y); y+=5;
    body(a.impact, 4);
    doc.setFontSize(7.5); doc.setFont("helvetica","italic"); doc.setTextColor(120,140,165);
    doc.text(`Timeframe: ${a.timeframe} · Effort: ${a.effort}`, M+4, y); y+=8;
  });

  // PAGE 5: TAX
  newPage();
  const tax = d.tax_optimization;
  secHead("Tax Optimization — Indian Context", 16,163,74);
  lv("Tax Slab", tax.estimated_tax_bracket);
  lv("Annual Tax Estimate", rsFmt(tax.annual_tax_estimate));
  body(tax.summary); y+=4;
  (tax.strategies||[]).forEach(s=>{
    chk(24);
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(20,35,65);
    doc.text(`${s.strategy}  —  Save ${s.potential_savings}`, M, y); y+=5;
    body(s.how,4); y+=2;
  });
  y+=4; doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(20,35,65);
  doc.text("Tax-Advantaged Instruments:", M, y); y+=7;
  (tax.tax_advantaged_accounts||[]).forEach(acc=>{ body("• "+acc,4); });

  // PAGE 6: INSIGHTS + GOAL
  newPage();
  secHead("AI Financial Insights", 124,58,237);
  body(d.ai_insights); y+=4;
  secHead("Highlights & Warnings");
  (d.positive_highlights||[]).forEach(h=>{ chk(8); doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(16,185,129); doc.text("✓ "+h, M, y); y+=6; });
  (d.risk_warnings||[]).forEach(w=>{ chk(8); doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(245,158,11); doc.text("⚠ "+w, M, y); y+=6; });
  y+=4;
  secHead("Goal Feasibility Analysis");
  const gf=d.goal_feasibility;
  lv("Goal", gf.goal); lv("Feasibility", gf.feasibility);
  lv("Est. Achievement", gf.estimated_achievement_date);
  lv("Monthly Required", rsFmt(gf.monthly_required));
  lv("Currently Saving", rsFmt(gf.current_monthly_savings));
  body(gf.gap_analysis);
  (gf.milestones||[]).forEach(m=>{ body("→ "+m,4); });

  // Footers
  const totalPg=doc.internal.getNumberOfPages();
  for(let pg=2;pg<=totalPg;pg++){
    doc.setPage(pg);
    doc.setDrawColor(200,215,235); doc.line(M,284,W-M,284);
    doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(140,160,190);
    doc.text("AI Financial Advisor — For educational purposes only. Not professional financial advice.", M, 289);
    doc.text(`Page ${pg} of ${totalPg}`, W-M, 289, {align:"right"});
  }

  const fname = `AI_Financial_Report_${(v("f-name")||"Report").replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fname);
}

// ══════════════════════════════════════════
// CURRENCY UTILS — All in ₹
// ══════════════════════════════════════════

/** Format number as ₹1,23,456 (Indian system) */
function rsFmt(n) {
  if (n == null || isNaN(n)) return "₹0";
  const num = Math.round(Number(n));
  return "₹" + num.toLocaleString("en-IN");
}

/** Compact form: ₹1.2L, ₹45K, ₹2.3Cr */
function rsShort(n) {
  if (n == null || isNaN(n)) return "₹0";
  const num = Number(n);
  if (Math.abs(num) >= 1e7)  return "₹" + (num / 1e7).toFixed(1) + "Cr";
  if (Math.abs(num) >= 1e5)  return "₹" + (num / 1e5).toFixed(1) + "L";
  if (Math.abs(num) >= 1000) return "₹" + (num / 1000).toFixed(0) + "K";
  return "₹" + Math.round(num).toLocaleString("en-IN");
}

function esc(t) {
  return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
}