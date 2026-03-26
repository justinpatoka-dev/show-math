// DOM rendering — reads inputs, renders results, manages field visibility

import { DEAL_TYPES, getDealType } from './dealTypes.js';
import { calculateNetGainLossCurve } from './calculator.js';

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

  // Draw both charts
  if (hasAdsInputs) {
    const inputs = readInputs();
    drawNetGainLossChart(results, inputs, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee);
    drawTicketsChart(results, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee);
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
// Shared chart utilities
// ============================================

const CHART_COLORS = {
  curve: '#111111',
  curveGradientTop: 'rgba(17,17,17,0.12)',
  curveGradientBot: 'rgba(17,17,17,0.01)',
  grid: 'rgba(0,0,0,0.06)',
  axisLine: 'rgba(0,0,0,0.12)',
  axisLabel: '#888888',
  tickLabel: '#555555',
  breakeven: '#D4882E',
  breakevenBg: 'rgba(212,136,46,0.12)',
  current: '#b5221a',
  currentBg: 'rgba(181,34,26,0.08)',
  goal: '#1a7a3a',
  goalBg: 'rgba(26,122,58,0.08)',
  positive: '#1a7a3a',
  positiveFill: 'rgba(26,122,58,0.10)',
  negative: '#b5221a',
  negativeFill: 'rgba(181,34,26,0.08)',
  zeroLine: 'rgba(0,0,0,0.20)',
  inflection: '#D4882E',
  baseline: 'rgba(0,0,0,0.18)',
};

const CHART_MARGIN = { top: 20, right: 24, bottom: 38, left: 56 };

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W: rect.width, H: rect.height, dpr };
}

function chartArea(W, H) {
  const m = CHART_MARGIN;
  return { x: m.left, y: m.top, w: W - m.left - m.right, h: H - m.top - m.bottom };
}

function drawGrid(ctx, area, xMax, yMin, yMax, opts = {}) {
  const xTicks = opts.xTicks || 5;
  const yTicks = opts.yTicks || 5;

  // Horizontal grid lines
  ctx.strokeStyle = CHART_COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) {
    const y = area.y + (area.h / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = CHART_COLORS.tickLabel;
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= yTicks; i++) {
    const val = yMax - ((yMax - yMin) / yTicks) * i;
    const y = area.y + (area.h / yTicks) * i;
    const label = opts.yFormat ? opts.yFormat(val) : Math.round(val).toString();
    ctx.fillText(label, area.x - 8, y);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= xTicks; i++) {
    const val = (xMax / xTicks) * i;
    const x = area.x + (area.w / xTicks) * i;
    ctx.fillText('$' + Math.round(val).toLocaleString(), x, area.y + area.h + 8);
  }

  // Axis labels
  ctx.fillStyle = CHART_COLORS.axisLabel;
  ctx.font = '10px Jost, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Ad Spend', area.x + area.w / 2, area.y + area.h + 26);
  ctx.save();
  ctx.translate(14, area.y + area.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(opts.yAxisLabel || '', 0, 0);
  ctx.restore();
}

function drawHorizontalLine(ctx, area, y, color, opts = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.width || 1;
  if (opts.dash) ctx.setLineDash(opts.dash);
  ctx.beginPath();
  ctx.moveTo(area.x, y);
  ctx.lineTo(area.x + area.w, y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (opts.label) {
    ctx.fillStyle = color;
    ctx.font = opts.labelFont || '9px Jost, sans-serif';
    ctx.textAlign = opts.labelAlign || 'left';
    const lx = opts.labelAlign === 'right' ? area.x + area.w - 4 : area.x + 6;
    ctx.fillText(opts.label, lx, y + (opts.labelBelow ? 12 : -7));
  }
}

function drawMarkerDot(ctx, x, y, color, radius = 5) {
  // Glow
  ctx.beginPath();
  ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
  ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba');
  ctx.fill();
  // Dot
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Inner highlight
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
}

function drawMarkerLabel(ctx, text, x, y, color, opts = {}) {
  ctx.font = '10px Jost, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(text).width;
  const px = 5, py = 3;
  const lx = x, ly = y - 14;
  // Background pill
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  const r = 3;
  ctx.roundRect(lx - tw / 2 - px, ly - 7 - py, tw + px * 2, 14 + py * 2, r);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(lx - tw / 2 - px, ly - 7 - py, tw + px * 2, 14 + py * 2, r);
  ctx.stroke();
  // Text
  ctx.fillStyle = color;
  ctx.fillText(text, lx, ly + 1);
}

// Track AbortControllers per container so we can clean up old listeners
const _tooltipControllers = {};

function setupTooltip(containerId, canvasId, tooltipId, crosshairId, getDataAtX) {
  const container = document.getElementById(containerId);
  const canvas = document.getElementById(canvasId);
  const tooltip = document.getElementById(tooltipId);
  const crosshair = document.getElementById(crosshairId);
  if (!container || !canvas || !tooltip || !crosshair) return;

  // Abort previous listeners for this container
  if (_tooltipControllers[containerId]) {
    _tooltipControllers[containerId].abort();
  }
  const controller = new AbortController();
  _tooltipControllers[containerId] = controller;
  const signal = controller.signal;

  const handleMove = (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const area = chartArea(rect.width, rect.height);

    if (x < area.x || x > area.x + area.w || y < area.y || y > area.y + area.h) {
      tooltip.style.display = 'none';
      crosshair.style.display = 'none';
      return;
    }

    const data = getDataAtX(x, area);
    if (!data) return;

    crosshair.style.display = 'block';
    crosshair.style.left = x + 'px';

    tooltip.style.display = 'block';
    tooltip.innerHTML = data.html;

    // Position tooltip — flip if near right edge
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    let tx = x + 12;
    if (tx + tipW > rect.width - 8) tx = x - tipW - 12;
    let ty = y - tipH / 2;
    if (ty < 4) ty = 4;
    if (ty + tipH > rect.height - 4) ty = rect.height - tipH - 4;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  };

  const handleLeave = () => {
    tooltip.style.display = 'none';
    crosshair.style.display = 'none';
  };

  container.addEventListener('mousemove', handleMove, { signal });
  container.addEventListener('mouseleave', handleLeave, { signal });
  container.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false, signal });
  container.addEventListener('touchend', handleLeave, { signal });
}

// ============================================
// Net Gain/Loss Chart
// ============================================

function drawNetGainLossChart(results, inputs, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee) {
  const canvas = document.getElementById('net-gl-canvas');
  if (!canvas) return;

  const { ctx, W, H } = setupCanvas(canvas);
  const area = chartArea(W, H);
  ctx.clearRect(0, 0, W, H);

  // Calculate curve data
  const goalAdSpend = ticketGoal > 0 && costPerTicket > 0 ? Math.max(0, ticketGoal - baseline) * costPerTicket : 0;
  const eqSpend = results.equilibrium || 0;
  const maxAdSpend = Math.max(500, eqSpend * 1.8, goalAdSpend * 1.5, currentAdSpend * 1.5);

  const curveData = calculateNetGainLossCurve(inputs, maxAdSpend, 150);
  if (curveData.length === 0) return;

  // Y range
  const allY = curveData.map(d => d.netGainLoss);
  const dataMin = Math.min(...allY);
  const dataMax = Math.max(...allY);
  const yPad = Math.max(Math.abs(dataMax - dataMin) * 0.15, 50);
  const yMin = Math.min(dataMin - yPad, -20);
  const yMax = Math.max(dataMax + yPad, 20);

  // Coordinate helpers
  const xPx = (spend) => area.x + (spend / maxAdSpend) * area.w;
  const yPx = (val) => area.y + area.h - ((val - yMin) / (yMax - yMin)) * area.h;

  // Draw grid
  drawGrid(ctx, area, maxAdSpend, yMin, yMax, {
    yAxisLabel: 'Net Gain / Loss',
    yFormat: (v) => (v >= 0 ? '$' : '-$') + Math.abs(Math.round(v)).toLocaleString(),
  });

  // Zero line
  if (yMin < 0 && yMax > 0) {
    const zeroY = yPx(0);
    drawHorizontalLine(ctx, area, zeroY, CHART_COLORS.zeroLine, {
      width: 1.5,
      label: 'BREAK EVEN',
      labelFont: '9px Jost, sans-serif',
      labelAlign: 'right',
    });
  }

  // Colored fill zones
  const zeroY = yPx(0);
  const clampedZeroY = Math.max(area.y, Math.min(area.y + area.h, zeroY));

  // Loss zone (red tint below zero)
  if (yMin < 0) {
    const grad = ctx.createLinearGradient(0, clampedZeroY, 0, area.y + area.h);
    grad.addColorStop(0, 'rgba(181,34,26,0.00)');
    grad.addColorStop(1, 'rgba(181,34,26,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(area.x, clampedZeroY, area.w, area.y + area.h - clampedZeroY);
  }

  // Gain zone (green tint above zero)
  if (yMax > 0) {
    const grad = ctx.createLinearGradient(0, area.y, 0, clampedZeroY);
    grad.addColorStop(0, 'rgba(26,122,58,0.06)');
    grad.addColorStop(1, 'rgba(26,122,58,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(area.x, area.y, area.w, clampedZeroY - area.y);
  }

  // Draw curve fill (gradient under/over curve to zero line)
  ctx.beginPath();
  ctx.moveTo(xPx(curveData[0].adSpend), clampedZeroY);
  for (const pt of curveData) {
    ctx.lineTo(xPx(pt.adSpend), yPx(pt.netGainLoss));
  }
  ctx.lineTo(xPx(curveData[curveData.length - 1].adSpend), clampedZeroY);
  ctx.closePath();
  // Split fill: use a single semi-transparent fill since canvas can't easily split
  const fillGrad = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
  fillGrad.addColorStop(0, 'rgba(26,122,58,0.12)');
  const zeroRatio = (clampedZeroY - area.y) / area.h;
  fillGrad.addColorStop(Math.max(0, Math.min(1, zeroRatio)), 'rgba(0,0,0,0.02)');
  fillGrad.addColorStop(1, 'rgba(181,34,26,0.10)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Draw curve line
  ctx.beginPath();
  for (let i = 0; i < curveData.length; i++) {
    const x = xPx(curveData[i].adSpend);
    const y = yPx(curveData[i].netGainLoss);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = CHART_COLORS.curve;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Find inflection point (minimum of the curve = worst net loss)
  let minIdx = 0;
  for (let i = 1; i < curveData.length; i++) {
    if (curveData[i].netGainLoss < curveData[minIdx].netGainLoss) minIdx = i;
  }
  const inflPt = curveData[minIdx];
  // Only show inflection if it's meaningfully different from endpoints (i.e., a valley exists)
  const isValley = minIdx > 0 && minIdx < curveData.length - 1 && inflPt.netGainLoss < curveData[0].netGainLoss - 10;

  if (isValley) {
    const ix = xPx(inflPt.adSpend);
    const iy = yPx(inflPt.netGainLoss);
    drawMarkerDot(ctx, ix, iy, CHART_COLORS.inflection, 4);
    drawMarkerLabel(ctx, 'Worst loss: -$' + Math.abs(Math.round(inflPt.netGainLoss)).toLocaleString(), ix, iy, CHART_COLORS.inflection);
  }

  // Break-even marker
  if (results.equilibrium !== null && results.equilibrium <= maxAdSpend) {
    // Find the curve point closest to break-even
    let beIdx = 0;
    for (let i = 1; i < curveData.length; i++) {
      if (Math.abs(curveData[i].adSpend - results.equilibrium) < Math.abs(curveData[beIdx].adSpend - results.equilibrium)) beIdx = i;
    }
    const bx = xPx(results.equilibrium);
    const by = yPx(curveData[beIdx].netGainLoss);
    drawMarkerDot(ctx, bx, by, CHART_COLORS.breakeven, 5);
    const beLabel = 'Break even: $' + Math.round(results.equilibrium).toLocaleString();
    // Position label above if at bottom, below if at top
    drawMarkerLabel(ctx, beLabel, bx, by, CHART_COLORS.breakeven);
  }

  // Current ad spend marker
  if (currentAdSpend > 0 && currentAdSpend <= maxAdSpend) {
    let curIdx = 0;
    for (let i = 1; i < curveData.length; i++) {
      if (Math.abs(curveData[i].adSpend - currentAdSpend) < Math.abs(curveData[curIdx].adSpend - currentAdSpend)) curIdx = i;
    }
    const cx = xPx(currentAdSpend);
    const cy = yPx(curveData[curIdx].netGainLoss);

    // Vertical line
    ctx.strokeStyle = CHART_COLORS.current;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, area.y);
    ctx.lineTo(cx, area.y + area.h);
    ctx.stroke();
    ctx.setLineDash([]);

    drawMarkerDot(ctx, cx, cy, CHART_COLORS.current, 5);
  }

  // Interactive tooltip
  setupTooltip('net-gl-container', 'net-gl-canvas', 'net-gl-tooltip', 'net-gl-crosshair', (mouseX, chartArea) => {
    const pct = (mouseX - chartArea.x) / chartArea.w;
    const adSpend = pct * maxAdSpend;
    // Find closest data point
    let closest = curveData[0];
    for (const pt of curveData) {
      if (Math.abs(pt.adSpend - adSpend) < Math.abs(closest.adSpend - adSpend)) closest = pt;
    }
    const glClass = closest.netGainLoss >= 0 ? 'tt-positive' : 'tt-negative';
    const glSign = closest.netGainLoss >= 0 ? '+' : '-';
    return {
      html: `
        <div><span class="tt-label">Ad Spend</span></div>
        <div class="tt-value">$${Math.round(closest.adSpend).toLocaleString()}</div>
        <div style="margin-top:4px"><span class="tt-label">Net Gain/Loss</span></div>
        <div class="tt-value ${glClass}">${glSign}$${Math.abs(Math.round(closest.netGainLoss)).toLocaleString()}</div>
        <div style="margin-top:4px"><span class="tt-label">Total Tickets</span></div>
        <div class="tt-value">${closest.tickets}</div>
      `
    };
  });
}

// ============================================
// Tickets vs Ad Spend Chart
// ============================================

function drawTicketsChart(results, baseline, costPerTicket, ticketGoal, currentAdSpend, marketingFee) {
  const canvas = document.getElementById('ad-curve-canvas');
  if (!canvas) return;

  const { ctx, W, H } = setupCanvas(canvas);
  const area = chartArea(W, H);
  ctx.clearRect(0, 0, W, H);

  const goalAdSpend = ticketGoal > 0 && costPerTicket > 0 ? Math.max(0, ticketGoal - baseline) * costPerTicket : 0;
  const eqSpend = results.equilibrium || 0;
  const maxAdSpend = Math.max(500, eqSpend * 1.5, goalAdSpend * 1.5, currentAdSpend * 1.5);

  const maxTickets = baseline + Math.ceil(maxAdSpend / costPerTicket);
  const yMax = Math.max(maxTickets, ticketGoal > 0 ? ticketGoal * 1.2 : maxTickets);
  const yMin = 0;

  const xPx = (spend) => area.x + (spend / maxAdSpend) * area.w;
  const yPx = (tickets) => area.y + area.h - ((tickets - yMin) / (yMax - yMin)) * area.h;

  // Grid
  drawGrid(ctx, area, maxAdSpend, yMin, yMax, { yAxisLabel: 'Tickets' });

  // Baseline horizontal line
  drawHorizontalLine(ctx, area, yPx(baseline), CHART_COLORS.baseline, {
    dash: [5, 4],
    label: 'Baseline: ' + baseline,
    labelFont: '9px Jost, sans-serif',
  });

  // Ticket goal horizontal line
  if (ticketGoal > 0) {
    drawHorizontalLine(ctx, area, yPx(ticketGoal), CHART_COLORS.goal, {
      dash: [6, 3],
      width: 1.5,
      label: 'Goal: ' + ticketGoal,
      labelFont: '9px Jost, sans-serif',
    });
  }

  // Build curve points
  const steps = 150;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const spend = (maxAdSpend / steps) * i;
    const tickets = baseline + Math.floor(spend / costPerTicket);
    points.push({ spend, tickets });
  }

  // Gradient fill under curve
  ctx.beginPath();
  ctx.moveTo(xPx(0), yPx(0));
  for (const pt of points) {
    ctx.lineTo(xPx(pt.spend), yPx(pt.tickets));
  }
  ctx.lineTo(xPx(maxAdSpend), yPx(0));
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
  grad.addColorStop(0, CHART_COLORS.curveGradientTop);
  grad.addColorStop(1, CHART_COLORS.curveGradientBot);
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve line
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const x = xPx(points[i].spend);
    const y = yPx(points[i].tickets);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = CHART_COLORS.curve;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Break-even marker
  if (results.equilibrium !== null && results.equilibrium <= maxAdSpend) {
    const beTickets = baseline + Math.floor(results.equilibrium / costPerTicket);
    const bx = xPx(results.equilibrium);
    const by = yPx(beTickets);
    drawMarkerDot(ctx, bx, by, CHART_COLORS.breakeven, 5);
    drawMarkerLabel(ctx, 'Break even', bx, by, CHART_COLORS.breakeven);
  }

  // Current ad spend marker
  if (currentAdSpend > 0 && currentAdSpend <= maxAdSpend) {
    const curTickets = baseline + Math.floor(currentAdSpend / costPerTicket);
    const cx = xPx(currentAdSpend);
    const cy = yPx(curTickets);

    ctx.strokeStyle = CHART_COLORS.current;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, area.y);
    ctx.lineTo(cx, area.y + area.h);
    ctx.stroke();
    ctx.setLineDash([]);

    drawMarkerDot(ctx, cx, cy, CHART_COLORS.current, 5);
  }

  // Interactive tooltip
  setupTooltip('ad-curve-container', 'ad-curve-canvas', 'ad-curve-tooltip', 'ad-curve-crosshair', (mouseX, chartArea) => {
    const pct = (mouseX - chartArea.x) / chartArea.w;
    const adSpend = pct * maxAdSpend;
    const tickets = baseline + Math.floor(adSpend / costPerTicket);
    const adTickets = tickets - baseline;
    return {
      html: `
        <div><span class="tt-label">Ad Spend</span></div>
        <div class="tt-value">$${Math.round(adSpend).toLocaleString()}</div>
        <div style="margin-top:4px"><span class="tt-label">Total Tickets</span></div>
        <div class="tt-value">${tickets}</div>
        <div style="margin-top:4px"><span class="tt-label">Tickets from Ads</span></div>
        <div class="tt-value">${adTickets}</div>
      `
    };
  });
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
