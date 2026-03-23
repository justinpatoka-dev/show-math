// Deal type configuration
// Each deal type defines: label, description, which fields are needed,
// how payout is calculated, and what the promotability note says.
//
// To modify a deal type: edit its calculatePayout function or properties.
// To add a new deal type: add a new object to the DEAL_TYPES array.

export const DEAL_TYPES = [
  {
    id: 'flat_guarantee',
    label: 'Flat Guarantee',
    description: 'Artist receives a fixed guarantee regardless of ticket sales.',
    definition: 'The venue pays a predetermined flat fee, negotiated in advance. The artist gets this amount no matter how many tickets sell. The venue takes all the financial risk — if the show flops, they still owe the full amount. If it sells out, the artist doesn\'t share in the upside (unless bonus tiers are added). Common for corporate events, festivals, and established acts.',
    example: 'Deal: $2,000 flat guarantee. Whether 10 people or 300 people show up, the artist gets $2,000.',
    fields: {
      guarantee: true,
      expenses: false,
      artistPercentage: false,
      promoterProfit: false,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      return guarantee;
    },
    calculateBackend() {
      return null;
    },
    promotabilityNote(backend, hasBonuses) {
      if (hasBonuses) {
        return 'Flat guarantee with bonuses — target bonus thresholds for extra payout.';
      }
      return 'Flat guarantee — extra tickets only add merch revenue.';
    },
  },

  {
    id: 'door_deal',
    label: 'Door Deal',
    description: 'Artist receives a percentage of ticket revenue. No guarantee.',
    definition: 'No guaranteed minimum. The artist gets a negotiated percentage of ticket revenue from the first dollar. Sell more, make more. Sell nothing, make nothing. The risk is shared — both sides earn more with better attendance. If the deal says "% of net gross," use the net ticket price (after facility fees) instead of the face value. Common splits: 80/20, 70/30, or 65/35 in favor of the artist.',
    example: 'Deal: 80% of door. 100 tickets at $20 = $2,000 gross. Artist gets 80% = $1,600.',
    fields: {
      guarantee: false,
      expenses: false,
      artistPercentage: true,
      promoterProfit: false,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      return artistPct * tickets * ticketPrice;
    },
    calculateBackend() {
      return null;
    },
    promotabilityNote() {
      return 'Door deal — every ticket directly increases payout.';
    },
  },

  {
    id: 'guarantee_vs_gross',
    label: 'Guarantee vs % of Gross',
    description: 'Artist receives whichever is higher: the guarantee or a percentage of gross revenue.',
    definition: 'The artist gets the HIGHER of two numbers: their guaranteed minimum OR their percentage of gross ticket revenue. It\'s one or the other, not both. Below the "backend" (the ticket count where the percentage exceeds the guarantee), the artist is on the guarantee. Above it, they get their percentage of ALL gross revenue — this creates a windfall effect because the percentage applies to every ticket, not just the ones above the threshold. Always try to negotiate this on gross, not net.',
    example: 'Deal: $500 vs 70% of gross. At 50 tickets x $15 = $750 gross, 70% = $525. Artist gets $525 (beats the $500 guarantee). At 30 tickets, 70% = $315 — artist gets the $500 guarantee instead.',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
      promoterProfit: false,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      const gross = tickets * ticketPrice;
      if (expenses > 0) {
        return Math.max(guarantee, gross >= expenses ? artistPct * gross : 0);
      }
      return Math.max(guarantee, artistPct * gross);
    },
    calculateBackend(ticketPrice, guarantee, artistPct, expenses) {
      if (artistPct <= 0 || ticketPrice <= 0) return null;
      const fromExpenses = expenses > 0 ? Math.ceil(expenses / ticketPrice) : 0;
      const fromGuarantee = Math.ceil(guarantee / (artistPct * ticketPrice));
      return Math.max(fromExpenses, fromGuarantee);
    },
    promotabilityNote(backend) {
      if (backend !== null) {
        return `Must cross backend (${backend} tix) for payout to exceed guarantee.`;
      }
      return '';
    },
  },

  {
    id: 'guarantee_vs_net',
    label: 'Guarantee vs % of Net',
    description: 'Artist receives whichever is higher: the guarantee or a percentage of net revenue (gross minus expenses).',
    definition: 'Same as "vs Gross" but expenses are deducted from gross revenue before calculating the artist\'s percentage. The artist gets the HIGHER of: their guarantee OR their percentage of (gross minus expenses). The backend is higher than a vs Gross deal because the pie is smaller after expenses. "Expenses" typically includes house nut, production costs, marketing, and sometimes the artist\'s own guarantee. Venues prefer this structure because they cover costs first.',
    example: 'Deal: $1,000 vs 80% of net, $955 in expenses. At 100 tickets x $25 = $2,500 gross. Net = $2,500 - $955 = $1,545. 80% = $1,236. Artist gets $1,236 (beats the guarantee).',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
      promoterProfit: false,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      const gross = tickets * ticketPrice;
      return Math.max(guarantee, artistPct * Math.max(0, gross - expenses));
    },
    calculateBackend(ticketPrice, guarantee, artistPct, expenses) {
      if (artistPct <= 0 || ticketPrice <= 0) return null;
      return Math.ceil((expenses + guarantee / artistPct) / ticketPrice);
    },
    promotabilityNote(backend) {
      if (backend !== null) {
        return `Must cross backend (${backend} tix) for payout to exceed guarantee.`;
      }
      return '';
    },
  },

  {
    id: 'guarantee_plus_after_expenses',
    label: 'Guarantee + % After Expenses',
    description: 'Artist receives their guarantee plus a percentage of revenue above the split point.',
    definition: 'The artist gets BOTH their guarantee AND a percentage of revenue above a "split point." The split point is the total of all show expenses (which may include the guarantee itself, house nut, production, marketing, and optionally a promoter profit margin). Once ticket revenue crosses the split point, the overage is split between artist and promoter at the negotiated percentage. This is the standard deal at mid-to-large venues. If the deal includes promoter profit (typically 15%), that gets added to expenses before calculating the split point. A $0 guarantee makes this a "percentage after costs" deal — highest risk for the artist.',
    example: 'Deal: $5,000 guarantee + 85% after expenses. Total expenses (including guarantee): $12,000. Promoter profit (15%): $1,800. Split point: $13,800. If gross is $22,000: overage = $8,200. Artist bonus = 85% x $8,200 = $6,970. Total pay: $5,000 + $6,970 = $11,970.',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
      promoterProfit: true,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      const gross = tickets * ticketPrice;
      const promoterProfit = (promoterProfitPct || 0) * expenses;
      const splitPoint = expenses + promoterProfit;
      return guarantee + artistPct * Math.max(0, gross - splitPoint);
    },
    calculateBackend(ticketPrice, guarantee, artistPct, expenses, promoterProfitPct) {
      if (ticketPrice <= 0) return null;
      const promoterProfit = (promoterProfitPct || 0) * expenses;
      const splitPoint = expenses + promoterProfit;
      return Math.ceil(splitPoint / ticketPrice);
    },
    promotabilityNote(backend) {
      if (backend !== null) {
        return `Earns percentage on every ticket above the split point (${backend} tix).`;
      }
      return '';
    },
  },
];

export function getDealType(id) {
  return DEAL_TYPES.find(dt => dt.id === id) || null;
}
