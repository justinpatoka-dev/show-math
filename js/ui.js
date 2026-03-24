// DOM rendering — reads inputs, renders results, manages field visibility

import { DEAL_TYPES, getDealType } from './dealTypes.js';

// ============================================
// Read all inputs from the form
// ============================================

export function readInputs() {
  const val = (id, fallback = 0) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    if (el.type === 'number') return parseFloat(el.value) || fallback;
    return el.value || fallback;
  };

  const bonusTiers = [];
  document.querySelectorAll('.bonus-tier-row').forEach(row => {
    const bonusMode = row.querySelector('.tier-bonus-mode')?.value || 'dollar';
    bonusTiers.push({
      type: row.querySelector('.tier-type')?.value || 'ticket_count',
      threshold: parseFloat(row.querySelector('.tier-threshold')?.value) || 0,
      amount: bonusMode === 'dollar' ? (parseFloat(row.querySelector('.tier-amount')?.value) || 0) : 0,
      bonusMode,
      newPct: bonusMode === 'pct_change' ? (parseFloat(row.querySelector('.tier-new-pct')?.value) || 0) / 100 : 0,
    });
  });

  return {
    scenarioName: val('scenario-name', ''),
    dealTypeId: val('deal-type', 'door_deal'),
    guarantee: val('guarantee'),
    expenses: val('expenses'),
    ticketPrice: val('ticket-price'),
    capacity: val('capacity'),
    artistPct: val('artist-pct') / 100,
    agentPct: val('agent-pct') / 100,
    supportCost: val('support-cost'),
    venueExpectation: val('venue-expectation'),
    bonusTiers,
    marketingFee: val('marketing-fee'),
    adSpend: val('ad-spend'),
    costPerTicket: val('cost-per-ticket'),
    ticketsWithout: val('tickets-without'),
    ticketsWith: val('tickets-with'),
    merchSpend: val('merch-spend'),
    merchMargin: val('merch-margin') / 100,
    promoterProfitPct: val('promoter-profit') / 100,
  };
}

// ============================================
// Populate form from saved inputs
// ============================================

export function populateInputs(inputs) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };

  set('scenario-name', inputs.scenarioName);
  set('deal-type', inputs.dealTypeId);
  set('guarantee', inputs.guarantee);
  set('expenses', inputs.expenses);
  set('ticket-price', inputs.ticketPrice);
  set('capacity', inputs.capacity);
  set('artist-pct', (inputs.artistPct * 100));
  set('agent-pct', (inputs.agentPct * 100));
  set('support-cost', inputs.supportCost);
  set('venue-expectation', inputs.venueExpectation);
  set('marketing-fee', inputs.marketingFee);
  set('ad-spend', inputs.adSpend);
  set('cost-per-ticket', inputs.costPerTicket);
  set('tickets-without', inputs.ticketsWithout);
  set('tickets-with', inputs.ticketsWith);
  set('merch-spend', inputs.merchSpend);
  set('merch-margin', (inputs.merchMargin * 100));
  set('promoter-profit', (inputs.promoterProfitPct || 0) * 100);

  // Rebuild bonus tiers
  const container = document.getElementById('bonus-tiers-container');
  container.innerHTML = '';
  if (inputs.bonusTiers && inputs.bonusTiers.length > 0) {
    inputs.bonusTiers.forEach(tier => addBonusTierRow(tier));
  }

  updateFieldVisibility(inputs.dealTypeId);
}

// ============================================
// Update field visibility based on deal type
// ============================================

export function updateFieldVisibility(dealTypeId) {
  const dt = getDealType(dealTypeId);
  if (!dt) return;

  const toggle = (id, show) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  };

  toggle('guarantee-group', dt.fields.guarantee);
  toggle('expenses-group', dt.fields.expenses);
  toggle('artist-pct-group', dt.fields.artistPercentage);
  toggle('promoter-profit-group', dt.fields.promoterProfit);
}

// ============================================
// Render results
// ============================================

export function renderResults(results) {
  if (!results) {
    document.getElementById('results-panel').classList.add('empty');
    return;
  }
  document.getElementById('results-panel').classList.remove('empty');

  const w = results.withoutPromo;
  const p = results.withPromo;
  const r = results.results;

  // ======== PHASE 1: DEAL STRUCTURE ========

  // Backend milestone
  if (results.backend !== null) {
    setCell('ms-backend-tickets', fmt(results.backend));
    document.getElementById('ms-backend-row').style.display = '';
  } else {
    setCell('ms-backend-tickets', 'N/A');
    document.getElementById('ms-backend-row').style.display = '';
  }

  // Ticket goal milestone
  const veInput = document.getElementById('venue-expectation');
  const ticketGoal = veInput ? parseFloat(veInput.value) || 0 : 0;
  if (ticketGoal > 0) {
    setCell('ms-goal-tickets', fmt(ticketGoal));
    document.getElementById('ms-goal-row').style.display = '';
  } else {
    setCell('ms-goal-tickets', '-');
    document.getElementById('ms-goal-row').style.display = 'none';
  }

  // Promotability note
  setText('promotability-note', results.promotabilityNote || '');

  // Payout at capacity levels
  const tbody = document.getElementById('payout-levels-body');
  if (tbody && results.payoutLevels) {
    tbody.innerHTML = results.payoutLevels.map(level => {
      return `<tr>
        <td>${Math.round(level.pct * 100)}%</td>
        <td>${fmt(level.tickets)}</td>
        <td>${dollar(level.payout)}</td>
        <td>${dollar(level.totalIncome)}</td>
      </tr>`;
    }).join('');
  }

  // ======== PHASE 2: AD SPEND ANALYSIS ========

  const baseline = parseFloat(document.getElementById('tickets-without')?.value) || 0;
  const costPerTicket = parseFloat(document.getElementById('cost-per-ticket')?.value) || 0;
  const currentAdSpend = parseFloat(document.getElementById('ad-spend')?.value) || 0;
  const marketingFee = parseFloat(document.getElementById('marketing-fee')?.value) || 0;
  const hasAdsInputs = baseline > 0 && costPerTicket > 0;

  const adsSection = document.getElementById('ads-results-section');
  const adsDivider = document.getElementById('ads-results-divider');
  if (adsSection) {
    adsSection.classList.toggle('inactive', !hasAdsInputs);
  }
  if (adsDivider) {
    adsDivider.style.opacity = hasAdsInputs ? '1' : '0.4';
  }

  // Draw the ad spend curve
  if (hasAdsInputs) {
    drawAdSpendCurve(results, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee);
  }

  // ---- LEFT COLUMN: Break even on ads ----
  const eqEl = document.getElementById('be-equilibrium');
  const eqHint = document.getElementById('be-hint');
  const beTicketsEl = document.getElementById('be-tickets');

  if (eqEl) {
    if (results.equilibrium !== null) {
      eqEl.textContent = dollar(results.equilibrium);
      const netGL = results.results?.netGainLoss ?? 0;
      if (eqHint) {
        if (currentAdSpend > 0 && netGL >= 0) {
          eqHint.textContent = `Ads are paying for themselves. Net gain: ${dollar(netGL)}.`;
          eqHint.className = 'breakeven-col-hint positive';
        } else if (currentAdSpend > 0 && netGL < 0) {
          eqHint.textContent = `Increase ad spend to ${dollar(results.equilibrium)} to break even.`;
          eqHint.className = 'breakeven-col-hint negative';
        } else {
          eqHint.textContent = '';
          eqHint.className = 'breakeven-col-hint neutral';
        }
      }
    } else {
      eqEl.textContent = 'N/A';
      if (eqHint) {
        if (marketingFee <= 0 && costPerTicket <= 0) {
          eqHint.textContent = 'Enter marketing fee and cost per ticket.';
        } else {
          eqHint.textContent = 'Cost per ticket exceeds earnings. Ads do not break even.';
        }
        eqHint.className = 'breakeven-col-hint neutral';
      }
    }
  }

  if (beTicketsEl) {
    if (results.equilibrium !== null && costPerTicket > 0) {
      const equilibriumTickets = baseline + Math.floor(results.equilibrium / costPerTicket);
      beTicketsEl.textContent = fmt(equilibriumTickets);
    } else {
      beTicketsEl.textContent = '-';
    }
  }

  // ---- RIGHT COLUMN: Ticket goal ----
  const beVenueAdspend = document.getElementById('be-venue-adspend');
  const beVenueTickets = document.getElementById('be-venue-tickets');
  const beVenueHint = document.getElementById('be-venue-hint');

  if (ticketGoal > 0) {
    const ticketGap = Math.max(0, ticketGoal - baseline);
    const adSpendNeeded = ticketGap > 0 && costPerTicket > 0 ? ticketGap * costPerTicket : 0;

    if (beVenueTickets) beVenueTickets.textContent = fmt(ticketGoal);
    if (beVenueAdspend) {
      if (ticketGap <= 0) {
        beVenueAdspend.textContent = 'Already met';
      } else if (costPerTicket > 0) {
        beVenueAdspend.textContent = dollar(adSpendNeeded);
      } else {
        beVenueAdspend.textContent = '-';
      }
    }

    if (beVenueHint) {
      if (ticketGap <= 0) {
        beVenueHint.textContent = 'Baseline estimate already meets your ticket goal.';
        beVenueHint.className = 'breakeven-col-hint positive';
      } else if (currentAdSpend >= adSpendNeeded) {
        beVenueHint.textContent = 'Current ad spend meets your ticket goal.';
        beVenueHint.className = 'breakeven-col-hint positive';
      } else {
        beVenueHint.textContent = `Increase ad spend to ${dollar(adSpendNeeded)} to hit your goal.`;
        beVenueHint.className = 'breakeven-col-hint negative';
      }
    }
  } else {
    if (beVenueAdspend) beVenueAdspend.textContent = '-';
    if (beVenueTickets) beVenueTickets.textContent = '-';
    if (beVenueHint) {
      beVenueHint.textContent = 'Enter a ticket goal to see this.';
      beVenueHint.className = 'breakeven-col-hint neutral';
    }
  }

  // Scenario comparison
  setCell('sc-tickets-without', fmt(w.tickets));
  setCell('sc-tickets-with', fmt(p.tickets));
  setCell('sc-capacity-without', pct(w.capacityPct));
  setCell('sc-capacity-with', pct(p.capacityPct));
  setCell('sc-gross-without', dollar(w.gross));
  setCell('sc-gross-with', dollar(p.gross));
  setCell('sc-payout-without', dollar(w.netPayout));
  setCell('sc-payout-with', dollar(p.netPayout));
  setCell('sc-merch-without', dollar(w.merchProfit));
  setCell('sc-merch-with', dollar(p.merchProfit));
  setCell('sc-total-without', dollar(w.totalIncome));
  setCell('sc-total-with', dollar(p.totalIncome));

  // Promo cost and take-home rows
  setCell('sc-promo-without', dollar(0));
  setCell('sc-promo-with', r.promoCost > 0 ? dollar(-r.promoCost) : dollar(0));
  const takehomeWithout = w.totalIncome;
  const takehomeWith = p.totalIncome - r.promoCost;
  setCell('sc-takehome-without', dollar(takehomeWithout));
  setCell('sc-takehome-with', dollar(takehomeWith));

  // Net gain/loss
  const gainEl = document.getElementById('net-gain-loss');
  if (gainEl) {
    gainEl.textContent = dollar(r.netGainLoss);
    gainEl.className = 'result-value ' + (r.netGainLoss >= 0 ? 'positive' : 'negative');
  }

  // Recommendation
  setText('rec-financial', results.recommendation.financial);
  setText('rec-strategic', results.recommendation.strategic);

  // Full payout detail
  setCell('detail-base-without', dollar(w.basePayout));
  setCell('detail-base-with', dollar(p.basePayout));
  setCell('detail-bonus-without', dollar(w.bonusEarned));
  setCell('detail-bonus-with', dollar(p.bonusEarned));
  setCell('detail-total-payout-without', dollar(w.totalPayout));
  setCell('detail-total-payout-with', dollar(p.totalPayout));
  setCell('detail-agent-without', dollar(w.agentFee));
  setCell('detail-agent-with', dollar(p.agentFee));
  setCell('detail-support-without', dollar(w.supportCost));
  setCell('detail-support-with', dollar(p.supportCost));
  setCell('detail-net-without', dollar(w.netPayout));
  setCell('detail-net-with', dollar(p.netPayout));
  setCell('detail-merch-without', dollar(w.merchProfit));
  setCell('detail-merch-with', dollar(p.merchProfit));
  setCell('detail-income-without', dollar(w.totalIncome));
  setCell('detail-income-with', dollar(p.totalIncome));

  // Additional income detail
  setCell('detail-add-payout', dollar(r.additionalNetPayout));
  setCell('detail-add-merch', dollar(r.additionalMerch));
  setCell('detail-add-income', dollar(r.additionalIncome));
}

// ============================================
// Ad Spend Curve Chart
// ============================================

function drawAdSpendCurve(results, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee) {
  const canvas = document.getElementById('ad-curve-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  // Chart margins
  const ml = 50, mr = 20, mt = 15, mb = 35;
  const cw = W - ml - mr;
  const ch = H - mt - mb;

  // Determine x-axis range (ad spend) — go up to 2x equilibrium or 2x goal ad spend or $2000, whichever is higher
  const goalAdSpend = ticketGoal > 0 && costPerTicket > 0 ? Math.max(0, ticketGoal - baseline) * costPerTicket : 0;
  const eqSpend = results.equilibrium || 0;
  const maxAdSpend = Math.max(500, eqSpend * 1.5, goalAdSpend * 1.5, currentAdSpend * 1.5);

  // Y-axis: tickets
  const maxTickets = baseline + Math.ceil(maxAdSpend / costPerTicket);
  const yMax = Math.max(maxTickets, ticketGoal > 0 ? ticketGoal * 1.2 : maxTickets);

  // Helper: data to pixel
  const xPx = (spend) => ml + (spend / maxAdSpend) * cw;
  const yPx = (tickets) => mt + ch - (tickets / yMax) * ch;

  // Grid lines
  ctx.strokeStyle = '#d5d5d5';
  ctx.lineWidth = 1;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = mt + (ch / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(ml, y);
    ctx.lineTo(ml + cw, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#555';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((yMax / yTicks) * (yTicks - i));
    const y = mt + (ch / yTicks) * i;
    ctx.fillText(val, ml - 6, y);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const val = Math.round((maxAdSpend / xTicks) * i);
    const x = ml + (cw / xTicks) * i;
    ctx.fillText('$' + val, x, mt + ch + 6);
  }

  // Axis labels
  ctx.fillStyle = '#888';
  ctx.font = '10px Jost, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Ad Spend', ml + cw / 2, H - 3);
  ctx.save();
  ctx.translate(12, mt + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Tickets', 0, 0);
  ctx.restore();

  // Baseline horizontal line
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ml, yPx(baseline));
  ctx.lineTo(ml + cw, yPx(baseline));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#888';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('baseline: ' + baseline, ml + 4, yPx(baseline) - 8);

  // Ticket goal horizontal line
  if (ticketGoal > 0) {
    ctx.strokeStyle = '#1a7a3a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(ml, yPx(ticketGoal));
    ctx.lineTo(ml + cw, yPx(ticketGoal));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1a7a3a';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('goal: ' + ticketGoal, ml + 4, yPx(ticketGoal) - 8);
  }

  // Draw the curve: total tickets = baseline + adSpend/costPerTicket
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const spend = (maxAdSpend / steps) * i;
    const tickets = baseline + Math.floor(spend / costPerTicket);
    const x = xPx(spend);
    const y = yPx(tickets);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Break-even marker
  if (results.equilibrium !== null && results.equilibrium <= maxAdSpend) {
    const beTickets = baseline + Math.floor(results.equilibrium / costPerTicket);
    const bx = xPx(results.equilibrium);
    const by = yPx(beTickets);
    ctx.fillStyle = '#D4882E';
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#D4882E';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('break even', bx, by - 10);
  }

  // Current ad spend marker
  if (currentAdSpend > 0 && currentAdSpend <= maxAdSpend) {
    const curTickets = baseline + Math.floor(currentAdSpend / costPerTicket);
    const cx = xPx(currentAdSpend);
    const cy = yPx(curTickets);
    ctx.strokeStyle = '#b5221a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, mt);
    ctx.lineTo(cx, mt + ch);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#b5221a';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b5221a';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('current: $' + currentAdSpend, cx, mt + ch + 20);
  }

  // Hint text
  const hintEl = document.getElementById('ad-curve-hint');
  if (hintEl) {
    if (ticketGoal > 0 && goalAdSpend > 0) {
      hintEl.textContent = `To reach your goal of ${ticketGoal} tickets from a baseline of ${baseline}, you need ~$${Math.round(goalAdSpend)} in ad spend.`;
    } else if (results.equilibrium !== null) {
      const beTickets = baseline + Math.floor(results.equilibrium / costPerTicket);
      hintEl.textContent = `Break-even at $${results.equilibrium} ad spend (${beTickets} tickets).`;
    } else {
      hintEl.textContent = '';
    }
  }
}

// ============================================
// Bonus tier management
// ============================================

export function addBonusTierRow(data = {}) {
  const container = document.getElementById('bonus-tiers-container');
  const row = document.createElement('div');
  row.className = 'bonus-tier-row';
  const bonusMode = data.bonusMode || 'dollar';
  const showDollar = bonusMode === 'dollar' ? '' : 'style="display:none"';
  const showPct = bonusMode === 'pct_change' ? '' : 'style="display:none"';
  row.innerHTML = `
    <div class="tier-line-1">
      <label class="tier-label">Trigger</label>
      <select class="tier-type">
        <option value="pct_capacity" ${data.type === 'pct_capacity' ? 'selected' : ''}>% of Capacity</option>
        <option value="ticket_count" ${data.type === 'ticket_count' ? 'selected' : ''}>Ticket Count</option>
      </select>
      <label class="tier-label">At</label>
      <input type="number" class="tier-threshold" placeholder="e.g. 100" value="${data.threshold || ''}" min="0">
      <button class="remove-tier" type="button" title="Remove tier">&times;</button>
    </div>
    <div class="tier-line-2">
      <label class="tier-label">Bonus</label>
      <select class="tier-bonus-mode">
        <option value="dollar" ${bonusMode === 'dollar' ? 'selected' : ''}>Dollar Bonus</option>
        <option value="pct_change" ${bonusMode === 'pct_change' ? 'selected' : ''}>% Changes To</option>
      </select>
      <div class="tier-value-dollar" ${showDollar}>
        <span class="tier-prefix">$</span>
        <input type="number" class="tier-amount" placeholder="500" value="${data.amount || ''}" min="0">
      </div>
      <div class="tier-value-pct" ${showPct}>
        <input type="number" class="tier-new-pct" placeholder="70" value="${data.newPct ? Math.round(data.newPct * 100) : ''}" min="0" max="100">
        <span class="tier-suffix">%</span>
      </div>
    </div>
  `;

  // Toggle dollar vs percentage fields
  const modeSelect = row.querySelector('.tier-bonus-mode');
  const dollarDiv = row.querySelector('.tier-value-dollar');
  const pctDiv = row.querySelector('.tier-value-pct');
  modeSelect.addEventListener('change', () => {
    if (modeSelect.value === 'dollar') {
      dollarDiv.style.display = '';
      pctDiv.style.display = 'none';
    } else {
      dollarDiv.style.display = 'none';
      pctDiv.style.display = '';
    }
    document.getElementById('inputs-panel').dispatchEvent(new Event('input', { bubbles: true }));
  });

  row.querySelector('.remove-tier').addEventListener('click', () => {
    row.remove();
    document.getElementById('inputs-panel').dispatchEvent(new Event('input', { bubbles: true }));
  });
  container.appendChild(row);
}

// ============================================
// Saved scenarios sidebar
// ============================================

export function renderSavedScenarios(scenarios, onLoad, onDelete) {
  const list = document.getElementById('saved-list');
  if (!list) return;

  if (scenarios.length === 0) {
    list.innerHTML = '<p class="empty-state">No saved scenarios yet.</p>';
    return;
  }

  list.innerHTML = scenarios.map(s => {
    const gain = s.summary?.netGainLoss ?? 0;
    const gainClass = gain >= 0 ? 'positive' : 'negative';
    const gainStr = gain >= 0 ? `+$${Math.round(gain).toLocaleString()}` : `-$${Math.round(Math.abs(gain)).toLocaleString()}`;
    return `
      <div class="saved-card" data-id="${s.id}">
        <div class="saved-card-header">
          <span class="saved-name">${escapeHtml(s.name)}</span>
          <span class="saved-gain ${gainClass}">${gainStr}</span>
        </div>
        <div class="saved-card-actions">
          <button class="load-btn" data-id="${s.id}">Load</button>
          <button class="delete-btn" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.load-btn').forEach(btn => {
    btn.addEventListener('click', () => onLoad(btn.dataset.id));
  });
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id));
  });
}

// ============================================
// Helpers
// ============================================

function setCell(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function dollar(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const abs = Math.abs(Math.round(n));
  const formatted = '$' + abs.toLocaleString();
  return n < 0 ? `(${formatted})` : formatted;
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Math.round(n).toLocaleString();
}

function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Math.round(n * 100) + '%';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
