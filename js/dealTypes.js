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
    fields: {
      guarantee: true,
      expenses: false,
      artistPercentage: false,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses) {
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
    description: 'Artist receives a percentage of all ticket revenue from the first dollar.',
    fields: {
      guarantee: false,
      expenses: false,
      artistPercentage: true,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses) {
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
    description: 'Artist receives the greater of the guarantee or a percentage of gross revenue (once gross hits the expense threshold).',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses) {
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
    description: 'Artist receives the greater of the guarantee or a percentage of net revenue (gross minus expenses).',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses) {
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
    description: 'Artist receives the guarantee plus a percentage of all revenue above the expense threshold.',
    fields: {
      guarantee: true,
      expenses: true,
      artistPercentage: true,
    },
    calculatePayout(tickets, ticketPrice, guarantee, artistPct, expenses) {
      const gross = tickets * ticketPrice;
      return guarantee + artistPct * Math.max(0, gross - expenses);
    },
    calculateBackend(ticketPrice, guarantee, artistPct, expenses) {
      if (ticketPrice <= 0) return null;
      return Math.ceil(expenses / ticketPrice);
    },
    promotabilityNote(backend) {
      if (backend !== null) {
        return `Earns percentage on every ticket above expense threshold (${backend} tix).`;
      }
      return '';
    },
  },
];

export function getDealType(id) {
  return DEAL_TYPES.find(dt => dt.id === id) || null;
}
