import { calculateScenario } from './calculator.js';
import { DEAL_TYPES } from './dealTypes.js';

// ============================================
// State
// ============================================

let tourShows = [];
let sortField = 'date';
let sortDir = 'asc';

// ============================================
// Parse deal sheet
// ============================================

export async function parseDealSheet(text) {
  const res = await fetch('/.netlify/functions/parse-tour', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealSheet: text })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Parse failed');
  }

  const data = await res.json();
  return data.shows;
}

// ============================================
// Calculate all shows
// ============================================

export function calculateAllShows(shows, globalSettings) {
  return shows.map(show => {
    if (show.dealType === 'unknown' || !show.dealType) {
      return { ...show, calculated: null, showType: 'skip', status: 'No deal info' };
    }

    const inputs = {
      dealTypeId: show.dealType,
      guarantee: show.guarantee || 0,
      artistPct: show.artistPct || 0,
      expenses: show.expenses || 0,
      ticketPrice: show.ticketPrice || 0,
      capacity: show.capacity || 0,
      agentPct: show.agentPct || 0.15,
      supportCost: show.supportCost || 0,
      merchSpend: globalSettings.merchSpend || 5,
      merchMargin: globalSettings.merchMargin || 0.60,
      marketingFee: globalSettings.marketingFee || 145,
      adSpend: show.allocatedAdSpend || 0,
      costPerTicket: globalSettings.costPerTicket || 6,
      ticketsWithout: show.currentTickets || show.baselineEstimate || 0,
      ticketsWith: (show.currentTickets || show.baselineEstimate || 0) + Math.floor((show.allocatedAdSpend || 0) / (globalSettings.costPerTicket || 6)),
      bonusTiers: show.bonusTiers || [],
      venueExpectation: show.venueExpectation || 0,
      targetTakeHome: show.targetTakeHome || 0,
    };

    const calculated = calculateScenario(inputs);

    // Determine show type
    let showType = 'build';
    if (calculated && calculated.backend !== null) {
      const baseline = show.currentTickets || show.baselineEstimate || 0;
      if (baseline >= calculated.backend * 0.8) {
        showType = 'money';
      }
    }
    if (show.dealType === 'flat_guarantee') {
      showType = 'money'; // Guarantee is locked in regardless
    }

    // Status
    let status = '';
    if (calculated) {
      const baseline = show.currentTickets || show.baselineEstimate || 0;
      if (calculated.backend && baseline >= calculated.backend) {
        status = 'Above backend';
      } else if (calculated.backend) {
        status = `${calculated.backend - baseline} tix to backend`;
      }
    }

    return {
      ...show,
      calculated,
      showType,
      status,
      inputs
    };
  });
}

// ============================================
// Budget allocation
// ============================================

export function allocateBudget(shows, totalBudget, minSpendHeavy, minSpendLight) {
  // Separate into promotable shows only
  const promotable = shows.filter(s => s.dealType && s.dealType !== 'unknown');

  if (promotable.length === 0) return shows;

  // Score each show by ROI potential
  const scored = promotable.map(show => {
    let score = 0;
    const calc = show.calculated;

    if (!calc) return { ...show, roiScore: 0 };

    // Higher score = more benefit from ad spend
    // Shows close to backend get priority (small push = big payoff)
    if (calc.backend) {
      const baseline = show.currentTickets || show.baselineEstimate || 0;
      const gapToBackend = calc.backend - baseline;
      if (gapToBackend > 0 && gapToBackend < 30) {
        score += 30 - gapToBackend; // Closer = higher score
      } else if (gapToBackend <= 0) {
        score += 15; // Already above backend, still good
      }
    }

    // Heavy priority shows get a boost
    if (show.priority === 'heavy') score += 20;
    if (show.priority === 'light') score += 5;

    // Shows with higher income per ticket above backend are better ROI
    if (calc.equilibrium && calc.equilibrium.feasible) {
      score += 10;
    }

    return { ...show, roiScore: score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.roiScore - a.roiScore);

  // Allocate: first pass — give everyone their minimum
  let remaining = totalBudget;
  scored.forEach(show => {
    const min = show.priority === 'heavy' ? minSpendHeavy : minSpendLight;
    show.allocatedAdSpend = Math.min(min, remaining);
    remaining -= show.allocatedAdSpend;
  });

  // Second pass — distribute remaining to highest-scoring shows
  if (remaining > 0) {
    const increment = 25; // Distribute in $25 chunks
    let i = 0;
    while (remaining >= increment && i < scored.length * 3) {
      const show = scored[i % scored.length];
      const max = show.priority === 'heavy' ? minSpendHeavy * 2 : minSpendLight * 1.5;
      if (show.allocatedAdSpend < max) {
        show.allocatedAdSpend += increment;
        remaining -= increment;
      }
      i++;
    }
  }

  // Merge back with non-promotable shows
  const allocatedMap = new Map(scored.map(s => [s.date + s.venue, s]));
  return shows.map(show => {
    const key = show.date + show.venue;
    return allocatedMap.has(key) ? allocatedMap.get(key) : { ...show, allocatedAdSpend: 0 };
  });
}

// ============================================
// Ad start date recommendation
// ============================================

export function recommendAdStart(showDate, gapToTarget) {
  const show = new Date(showDate);
  let daysOut = 14; // Default 2 weeks

  if (gapToTarget > 60) daysOut = 28;
  else if (gapToTarget > 30) daysOut = 21;
  else daysOut = 14;

  const start = new Date(show);
  start.setDate(start.getDate() - daysOut);
  return start.toISOString().split('T')[0];
}

// ============================================
// Sorting
// ============================================

export function sortShows(shows, field, direction) {
  return [...shows].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];

    // Handle nested calculated values
    if (field === 'backend') {
      aVal = a.calculated?.backend || 9999;
      bVal = b.calculated?.backend || 9999;
    }
    if (field === 'breakEvenAdSpend') {
      aVal = a.calculated?.equilibrium?.adSpend || 9999;
      bVal = b.calculated?.equilibrium?.adSpend || 9999;
    }
    if (field === 'showType') {
      const order = { money: 0, build: 1, skip: 2 };
      aVal = order[a.showType] ?? 2;
      bVal = order[b.showType] ?? 2;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// ============================================
// Format helpers
// ============================================

export function formatDollar(n) {
  if (n == null || isNaN(n)) return '-';
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toLocaleString('en-US');
  if (n < 0) return `($${formatted})`;
  return `$${formatted}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
