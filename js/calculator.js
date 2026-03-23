// Pure calculation engine — no DOM, no side effects.
// Takes a plain inputs object, returns a plain results object.

import { getDealType } from './dealTypes.js';

// ============================================
// Core calculation
// ============================================

export function calculateScenario(inputs) {
  const dealType = getDealType(inputs.dealTypeId);
  if (!dealType) return null;

  const backend = dealType.calculateBackend
    ? dealType.calculateBackend(inputs.ticketPrice, inputs.guarantee, inputs.artistPct, inputs.expenses)
    : null;

  const withoutPromo = calculateSide(dealType, inputs, inputs.ticketsWithout);
  const withPromo = calculateSide(dealType, inputs, inputs.ticketsWith);

  const additionalNetPayout = withPromo.netPayout - withoutPromo.netPayout;
  const additionalMerch = withPromo.merchProfit - withoutPromo.merchProfit;
  const additionalIncome = withPromo.totalIncome - withoutPromo.totalIncome;
  const promoCost = inputs.marketingFee + inputs.adSpend;
  const netGainLoss = additionalIncome - promoCost;

  const marketingFeeBreakeven = inputs.marketingFee > 0
    ? calculateBreakeven(dealType, inputs, backend, inputs.marketingFee)
    : { extraTickets: 0, totalTickets: inputs.ticketsWithout, ticketsStillNeeded: 0, adSpendRemaining: 0 };
  const breakeven = calculateBreakeven(dealType, inputs, backend, promoCost);
  const equilibrium = calculateEquilibriumAdSpend(dealType, inputs, backend);
  const recommendation = generateRecommendation(inputs, dealType, backend, withoutPromo, withPromo, netGainLoss, promoCost, breakeven);

  const hasBonuses = inputs.bonusTiers && inputs.bonusTiers.some(t => t.amount > 0 && t.threshold > 0);

  // Payout at capacity levels (25%, 50%, 75%, 100%)
  const capacityLevels = [0.25, 0.50, 0.75, 1.0];
  const payoutLevels = capacityLevels.map(pct => {
    const tickets = Math.round(inputs.capacity * pct);
    const side = calculateSide(dealType, inputs, tickets);
    return {
      pct,
      tickets,
      payout: side.netPayout,
      totalIncome: side.totalIncome,
      atOrAboveBackend: backend !== null ? tickets >= backend : null,
    };
  });

  return {
    backend,
    promotabilityNote: dealType.promotabilityNote(backend, hasBonuses),
    payoutLevels,
    withoutPromo,
    withPromo,
    results: {
      additionalNetPayout,
      additionalMerch,
      additionalIncome,
      promoCost,
      netGainLoss,
    },
    marketingFeeBreakeven,
    breakeven,
    equilibrium,
    recommendation,
  };
}

// ============================================
// Single side calculation (without or with promo)
// ============================================

function calculateSide(dealType, inputs, tickets) {
  const gross = tickets * inputs.ticketPrice;
  const capacityPct = inputs.capacity > 0 ? tickets / inputs.capacity : 0;

  // Check for percentage-change bonus tiers
  const activePctTier = getActivePctChangeTier(inputs.bonusTiers, tickets, inputs.capacity);
  const effectiveArtistPct = activePctTier ? activePctTier.newPct : inputs.artistPct;

  const basePayout = dealType.calculatePayout(
    tickets, inputs.ticketPrice, inputs.guarantee, effectiveArtistPct, inputs.expenses
  );

  const bonusEarned = calculateBonuses(inputs.bonusTiers, tickets, inputs.capacity);
  const totalPayout = basePayout + bonusEarned;
  const agentFee = totalPayout * inputs.agentPct;
  const supportCost = inputs.supportCost;
  const netPayout = totalPayout - agentFee - supportCost;
  const merchProfit = tickets * inputs.merchSpend * inputs.merchMargin;
  const totalIncome = netPayout + merchProfit;

  return {
    tickets,
    capacityPct,
    gross,
    basePayout,
    bonusEarned,
    totalPayout,
    agentFee,
    supportCost,
    netPayout,
    merchProfit,
    totalIncome,
  };
}

// ============================================
// Bonus tier calculation
// ============================================

// Returns the highest active percentage-change tier (if any)
function getActivePctChangeTier(tiers, tickets, capacity) {
  if (!tiers || tiers.length === 0) return null;
  let active = null;
  for (const tier of tiers) {
    if (tier.bonusMode !== 'pct_change' || !tier.newPct || tier.newPct <= 0) continue;
    if (!tier.threshold || tier.threshold <= 0) continue;

    let triggered = false;
    if (tier.type === 'pct_capacity') {
      triggered = capacity > 0 && (tickets / capacity) >= (tier.threshold / 100);
    } else {
      triggered = tickets >= tier.threshold;
    }

    if (triggered) {
      // Use the highest new percentage if multiple tiers are active
      if (!active || tier.newPct > active.newPct) {
        active = tier;
      }
    }
  }
  return active;
}

// Calculate dollar-amount bonuses only (percentage tiers are handled in calculateSide)
function calculateBonuses(tiers, tickets, capacity) {
  if (!tiers || tiers.length === 0) return 0;
  let total = 0;
  for (const tier of tiers) {
    // Skip percentage-change tiers — those modify the payout calculation directly
    if (tier.bonusMode === 'pct_change') continue;
    if (!tier.threshold || !tier.amount || tier.threshold <= 0 || tier.amount <= 0) continue;
    if (tier.type === 'pct_capacity') {
      if (capacity > 0 && (tickets / capacity) >= (tier.threshold / 100)) {
        total += tier.amount;
      }
    } else {
      if (tickets >= tier.threshold) {
        total += tier.amount;
      }
    }
  }
  return total;
}

// ============================================
// Break-even: extra tickets from baseline to cover promo cost
// ============================================

function calculateBreakeven(dealType, inputs, backend, promoCost) {
  if (promoCost <= 0) {
    return { extraTickets: 0, totalTickets: inputs.ticketsWithout, ticketsStillNeeded: 0, adSpendRemaining: 0 };
  }

  const M = inputs.merchSpend * inputs.merchMargin;
  const P = inputs.artistPct * inputs.ticketPrice * (1 - inputs.agentPct);
  const PM = P + M;
  const baseline = inputs.ticketsWithout;

  let extraTickets = null;

  if (dealType.id === 'flat_guarantee') {
    extraTickets = M > 0 ? Math.ceil(promoCost / M) : null;

  } else if (dealType.id === 'door_deal') {
    extraTickets = PM > 0 ? Math.ceil(promoCost / PM) : null;

  } else if (backend === null) {
    extraTickets = null;

  } else {
    const BT = Math.max(0, backend - baseline);

    if (BT === 0) {
      // Past backend — linear
      extraTickets = PM > 0 ? Math.ceil(promoCost / PM) : null;

    } else if (dealType.id === 'guarantee_vs_gross') {
      // Windfall logic for vs Gross
      const windfall = (inputs.artistPct * backend * inputs.ticketPrice - inputs.guarantee) * (1 - inputs.agentPct);
      const totalAtBackend = M * BT + windfall;

      if (totalAtBackend >= promoCost) {
        if (M > 0 && M * BT >= promoCost) {
          extraTickets = Math.ceil(promoCost / M);
        } else {
          extraTickets = BT;
        }
      } else {
        const remaining = promoCost - totalAtBackend;
        extraTickets = PM > 0 ? BT + Math.ceil(remaining / PM) : null;
      }

    } else {
      // vs Net and +After — no windfall
      if (M === 0 && P === 0) {
        extraTickets = null;
      } else if (M * BT >= promoCost) {
        extraTickets = Math.ceil(promoCost / M);
      } else {
        extraTickets = BT + (PM > 0 ? Math.ceil((promoCost - M * BT) / PM) : 0);
      }
    }
  }

  const totalTickets = extraTickets !== null ? extraTickets + baseline : null;
  const ticketsGained = inputs.ticketsWith - baseline;
  const ticketsStillNeeded = extraTickets !== null ? Math.max(0, extraTickets - ticketsGained) : null;
  const adSpendRemaining = ticketsStillNeeded !== null ? ticketsStillNeeded * inputs.costPerTicket : null;

  return { extraTickets, totalTickets, ticketsStillNeeded, adSpendRemaining };
}

// ============================================
// Equilibrium: total ad spend where income from extra tickets = total promo cost
// ============================================

function calculateEquilibriumAdSpend(dealType, inputs, backend) {
  const M = inputs.merchSpend * inputs.merchMargin;
  const P = inputs.artistPct * inputs.ticketPrice * (1 - inputs.agentPct);
  const PM = P + M;
  const C = inputs.costPerTicket;
  const F = inputs.marketingFee;
  const baseline = inputs.ticketsWithout;

  if (C <= 0) return null;

  let rawResult = null;

  if (dealType.id === 'flat_guarantee') {
    rawResult = M > C ? Math.ceil(F / (M / C - 1)) : null;
  } else if (dealType.id === 'door_deal') {
    rawResult = PM > C ? Math.ceil(F / (PM / C - 1)) : null;
  } else if (backend === null) {
    rawResult = null;
  } else {
    const BT = Math.max(0, backend - baseline);

    if (BT === 0) {
      rawResult = PM > C ? Math.ceil(F / (PM / C - 1)) : null;
    } else if (PM <= C) {
      rawResult = null;
    } else if (dealType.id === 'guarantee_vs_gross') {
      const windfall = (inputs.artistPct * backend * inputs.ticketPrice - inputs.guarantee) * (1 - inputs.agentPct);
      const adSpendToBackend = BT * C;
      const incomeAtBackend = M * BT + windfall;
      const costAtBackend = F + adSpendToBackend;

      if (incomeAtBackend >= costAtBackend) {
        if (M > C) {
          const A = F / (M / C - 1);
          if (A / C <= BT) { rawResult = Math.ceil(A); }
          else { rawResult = Math.ceil(adSpendToBackend); }
        } else {
          rawResult = Math.ceil(adSpendToBackend);
        }
      } else {
        const shortfall = costAtBackend - incomeAtBackend;
        const extraAd = shortfall / (PM / C - 1);
        rawResult = Math.ceil(adSpendToBackend + extraAd);
      }
    } else {
      // vs Net and +After — no windfall
      if (M > C) {
        const A = F / (M / C - 1);
        if (A / C <= BT) { rawResult = Math.ceil(A); }
        else { rawResult = Math.ceil((F + BT * P) / (PM / C - 1)); }
      } else {
        rawResult = Math.ceil((F + BT * P) / (PM / C - 1));
      }
    }
  }

  if (rawResult === null) return null;

  // Verify with discrete ticket rounding — bump up if needed
  return verifyEquilibrium(rawResult, dealType, inputs, baseline, C, F);
}

function verifyEquilibrium(adSpend, dealType, inputs, baseline, costPerTicket, marketingFee) {
  // Simulate the actual scenario at this ad spend to check net gain/loss
  // Bump up in cost-per-ticket increments until it actually breaks even
  const maxBumps = 20; // safety limit
  for (let i = 0; i <= maxBumps; i++) {
    const testAdSpend = adSpend + (i * costPerTicket);
    const extraTickets = Math.floor(testAdSpend / costPerTicket);
    const ticketsWith = baseline + extraTickets;

    const withoutSide = simulateSide(dealType, inputs, baseline);
    const withSide = simulateSide(dealType, inputs, ticketsWith);

    const additionalIncome = withSide.totalIncome - withoutSide.totalIncome;
    const promoCost = marketingFee + testAdSpend;
    const netGainLoss = additionalIncome - promoCost;

    if (netGainLoss >= 0) {
      return Math.ceil(testAdSpend);
    }
  }
  return Math.ceil(adSpend); // fallback
}

function simulateSide(dealType, inputs, tickets) {
  const gross = tickets * inputs.ticketPrice;
  const basePayout = dealType.calculatePayout(
    tickets, inputs.ticketPrice, inputs.guarantee, inputs.artistPct, inputs.expenses
  );
  const bonusEarned = calculateBonuses(inputs.bonusTiers, tickets, inputs.capacity);
  const totalPayout = basePayout + bonusEarned;
  const agentFee = totalPayout * inputs.agentPct;
  const netPayout = totalPayout - agentFee - inputs.supportCost;
  const merchProfit = tickets * inputs.merchSpend * inputs.merchMargin;
  const totalIncome = netPayout + merchProfit;
  return { totalIncome };
}

// ============================================
// Recommendation generator
// ============================================

function generateRecommendation(inputs, dealType, backend, withoutPromo, withPromo, netGainLoss, promoCost, breakeven) {
  let financial = '';
  let strategic = '';
  let warning = '';

  // Financial assessment
  if (promoCost <= 0) {
    financial = 'No promotion costs entered.';
  } else if (netGainLoss >= 0) {
    financial = 'Promotion pays for itself at current projections.';
  } else if (netGainLoss >= -(promoCost * 0.15)) {
    financial = 'Close to break-even. A small increase in tickets or decrease in spend could tip it.';
  } else {
    const extraPeople = inputs.ticketsWith - inputs.ticketsWithout;
    financial = `Promotion costs more than it earns at these numbers, but gets the artist in front of ${extraPeople} more people.`;
  }

  // Strategic assessment
  if (inputs.venueExpectation && inputs.venueExpectation > 0) {
    const gap = Math.max(0, inputs.venueExpectation - inputs.ticketsWith);
    if (gap <= 0) {
      strategic = 'On track to meet venue expectation.';
    } else {
      const adCost = gap * inputs.costPerTicket;
      strategic = `Need ${gap} more tickets ($${adCost.toLocaleString()} in ad spend) to meet venue expectation of ${inputs.venueExpectation}.`;
    }
  } else {
    strategic = 'Enter venue expectation to see strategic assessment.';
  }

  return { financial, strategic };
}
