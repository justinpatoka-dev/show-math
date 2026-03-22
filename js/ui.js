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
    bonusTiers.push({
      type: row.querySelector('.tier-type')?.value || 'ticket_count',
      threshold: parseFloat(row.querySelector('.tier-threshold')?.value) || 0,
      amount: parseFloat(row.querySelector('.tier-amount')?.value) || 0,
    });
  });

  return {
    scenarioName: val('scenario-name', ''),
    showDate: val('show-date', ''),
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
    targetTakeHome: val('target-take-home'),
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
  set('show-date', inputs.showDate);
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
  set('target-take-home', inputs.targetTakeHome || '');

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

  // ======== YOUR TAKE-HOME ========
  const th = results.takeHome;
  if (th) {
    setCell('th-without', dollar(th.without));
    const thWithEl = document.getElementById('th-with');
    if (thWithEl) {
      thWithEl.textContent = dollar(th.with);
      thWithEl.className = 'take-home-value ' + (th.with >= th.without ? 'positive' : 'negative');
    }

    const targetRow = document.getElementById('th-target-row');
    const targetStatus = document.getElementById('th-target-status');
    if (targetRow && targetStatus) {
      if (th.target > 0) {
        targetRow.style.display = '';
        if (th.aboveTarget) {
          targetStatus.textContent = `${dollar(th.gap)} above your ${dollar(th.target)} target`;
          targetStatus.className = 'th-status positive';
        } else {
          targetStatus.textContent = `${dollar(Math.abs(th.gap))} below your ${dollar(th.target)} target`;
          targetStatus.className = 'th-status negative';
        }
      } else {
        targetRow.style.display = 'none';
      }
    }
  }

  // ======== PHASE 1: DEAL STRUCTURE ========

  // Backend milestone
  if (results.backend !== null) {
    setCell('ms-backend-tickets', fmt(results.backend));
    document.getElementById('ms-backend-row').style.display = '';
  } else {
    setCell('ms-backend-tickets', 'N/A');
    document.getElementById('ms-backend-row').style.display = '';
  }

  // Venue expectation milestone (removed from milestones, kept in promo section)

  // Target take-home milestone
  const targetRow = document.getElementById('ms-target-row');
  const targetTicketsEl = document.getElementById('ms-target-tickets');
  const targetHintEl = document.getElementById('ms-target-hint');
  if (targetRow && targetTicketsEl) {
    if (results.ticketsToTarget !== null && results.ticketsToTarget !== undefined) {
      targetRow.style.display = '';
      if (results.ticketsToTarget === 0) {
        targetTicketsEl.textContent = '0';
        if (targetHintEl) targetHintEl.textContent = 'Guaranteed income already meets your target';
      } else {
        targetTicketsEl.textContent = fmt(results.ticketsToTarget);
        const targetAmt = results.takeHome?.target || 0;
        if (targetHintEl) targetHintEl.textContent = `Tickets to hit ${dollar(targetAmt)} take-home`;
      }
    } else if (results.takeHome?.target > 0) {
      // Target set but can't be reached
      targetRow.style.display = '';
      targetTicketsEl.textContent = 'N/A';
      if (targetHintEl) targetHintEl.textContent = 'Target may not be reachable at this venue';
    } else {
      targetRow.style.display = 'none';
    }
  }

  // Promotability note
  setText('promotability-note', results.promotabilityNote || '');

  // Payout at capacity levels
  const tbody = document.getElementById('payout-levels-body');
  if (tbody && results.payoutLevels) {
    tbody.innerHTML = results.payoutLevels.map(level => {
      const isBackend = results.backend !== null && level.tickets >= results.backend
        && (level.tickets - Math.round(level.pct * 0.25 * (document.getElementById('capacity')?.value || 0))) < results.backend;
      // Highlight the row where we first cross backend
      const rowClass = results.backend !== null && level.tickets >= results.backend
        && results.payoutLevels.find(l => l.tickets >= results.backend) === level
        ? ' class="row-backend"' : '';
      return `<tr${rowClass}>
        <td>${Math.round(level.pct * 100)}%</td>
        <td>${fmt(level.tickets)}</td>
        <td>${dollar(level.payout)}</td>
        <td>${dollar(level.totalIncome)}</td>
      </tr>`;
    }).join('');
  }

  // ======== PHASE 2: PROMOTION ANALYSIS ========

  const hasPromo = r.promoCost > 0 || w.tickets !== p.tickets;
  const promoSection = document.getElementById('promo-results-section');
  const promoDivider = document.getElementById('promo-results-divider');
  if (promoSection) {
    promoSection.classList.toggle('inactive', !hasPromo);
  }
  if (promoDivider) {
    promoDivider.style.opacity = hasPromo ? '1' : '0.4';
  }

  // ---- LEFT COLUMN: Break even on promo ----
  const eqEl = document.getElementById('be-equilibrium');
  const eqHint = document.getElementById('be-hint');
  const beTicketsEl = document.getElementById('be-tickets');

  if (eqEl) {
    if (results.equilibrium !== null) {
      eqEl.textContent = dollar(results.equilibrium);
      const netGL = results.results?.netGainLoss ?? 0;
      const currentAdSpend = parseFloat(document.getElementById('ad-spend')?.value) || 0;
      if (eqHint) {
        if (currentAdSpend > 0 && netGL >= 0) {
          eqHint.textContent = 'Promotion is paying for itself.';
          eqHint.className = 'breakeven-col-hint positive';
        } else if (currentAdSpend > 0 && netGL < 0) {
          const gap = results.equilibrium - currentAdSpend;
          if (gap > 0) {
            eqHint.textContent = `Need ${dollar(gap)} more to break even.`;
          } else {
            eqHint.textContent = 'Not yet paying for itself.';
          }
          eqHint.className = 'breakeven-col-hint negative';
        } else {
          eqHint.textContent = '';
          eqHint.className = 'breakeven-col-hint neutral';
        }
      }
    } else {
      eqEl.textContent = 'N/A';
      if (eqHint) {
        const mf = parseFloat(document.getElementById('marketing-fee')?.value) || 0;
        const cpt = parseFloat(document.getElementById('cost-per-ticket')?.value) || 0;
        if (mf <= 0 && cpt <= 0) {
          eqHint.textContent = 'Enter marketing fee and cost per ticket.';
        } else {
          eqHint.textContent = 'Cost per ticket exceeds earnings. Promo does not break even.';
        }
        eqHint.className = 'breakeven-col-hint neutral';
      }
    }
  }

  if (beTicketsEl) {
    beTicketsEl.textContent = results.breakeven?.totalTickets != null
      ? fmt(results.breakeven.totalTickets) : '-';
  }

  // ---- RIGHT COLUMN: Venue expectation ----
  const venueExp2 = parseFloat(document.getElementById('venue-expectation')?.value) || 0;
  const venueCol = document.getElementById('venue-col');
  const beVenueAdspend = document.getElementById('be-venue-adspend');
  const beVenueTickets = document.getElementById('be-venue-tickets');
  const beVenueHint = document.getElementById('be-venue-hint');

  if (venueExp2 > 0) {
    if (venueCol) venueCol.style.display = '';

    const currentAdSpend = parseFloat(document.getElementById('ad-spend')?.value) || 0;
    const ticketsWithout = parseFloat(document.getElementById('tickets-without')?.value) || 0;
    const ticketsWith = parseFloat(document.getElementById('tickets-with')?.value) || 0;
    const costPerTicket = parseFloat(document.getElementById('cost-per-ticket')?.value) || 0;
    const ticketGap = Math.max(0, venueExp2 - ticketsWithout);
    const adSpendNeeded = ticketGap > 0 && costPerTicket > 0 ? ticketGap * costPerTicket : 0;

    if (beVenueTickets) beVenueTickets.textContent = fmt(venueExp2);
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
      const remainingFromPromo = Math.max(0, venueExp2 - ticketsWith);
      if (ticketGap <= 0) {
        beVenueHint.textContent = 'On track without promotion.';
        beVenueHint.className = 'breakeven-col-hint positive';
      } else if (remainingFromPromo <= 0) {
        beVenueHint.textContent = 'Current promo projection meets this.';
        beVenueHint.className = 'breakeven-col-hint positive';
      } else {
        const extraAdSpend = remainingFromPromo * costPerTicket;
        beVenueHint.textContent = `Need ${fmt(remainingFromPromo)} more tickets (${dollar(extraAdSpend)} more ad spend).`;
        beVenueHint.className = 'breakeven-col-hint negative';
      }
    }
  } else {
    if (venueCol) venueCol.style.display = 'none';
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

  // Net gain/loss
  const gainEl = document.getElementById('net-gain-loss');
  if (gainEl) {
    gainEl.textContent = dollar(r.netGainLoss);
    gainEl.className = 'result-value ' + (r.netGainLoss >= 0 ? 'positive' : 'negative');
  }

  // Promo cost
  setCell('promo-cost-display', dollar(r.promoCost));

  // Recommendation
  setText('rec-financial', results.recommendation.financial);
  setText('rec-strategic', results.recommendation.strategic);

  const warningEl = document.getElementById('rec-warning');
  if (warningEl) {
    warningEl.textContent = results.recommendation.warning || '';
    warningEl.style.display = results.recommendation.warning ? '' : 'none';
  }

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
// Bonus tier management
// ============================================

export function addBonusTierRow(data = {}) {
  const container = document.getElementById('bonus-tiers-container');
  const row = document.createElement('div');
  row.className = 'bonus-tier-row';
  row.innerHTML = `
    <select class="tier-type">
      <option value="pct_capacity" ${data.type === 'pct_capacity' ? 'selected' : ''}>% of Capacity</option>
      <option value="ticket_count" ${data.type === 'ticket_count' ? 'selected' : ''}>Ticket Count</option>
    </select>
    <input type="number" class="tier-threshold" placeholder="Threshold" value="${data.threshold || ''}" min="0">
    <input type="number" class="tier-amount" placeholder="Bonus $" value="${data.amount || ''}" min="0">
    <button class="remove-tier" type="button" title="Remove tier">&times;</button>
  `;
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

function setStatus(id, statusClass, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'ms-status ' + statusClass;
}

