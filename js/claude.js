// Claude API integration via serverless proxy — no API key needed client-side

export async function parseDealText(text) {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return await response.json();
}

export async function generateArtistSummary(showName, results, inputs) {
  const context = {
    showName: showName || 'This show',
    dealType: inputs.dealTypeId,
    guarantee: inputs.guarantee,
    expenses: inputs.expenses,
    ticketPrice: inputs.ticketPrice,
    capacity: inputs.capacity,
    artistPct: inputs.artistPct * 100,
    agentPct: inputs.agentPct * 100,
    supportCost: inputs.supportCost,
    venueExpectation: inputs.venueExpectation,
    backend: results.backend,
    ticketsWithout: inputs.ticketsWithout,
    ticketsWith: inputs.ticketsWith,
    marketingFee: inputs.marketingFee,
    adSpend: inputs.adSpend,
    costPerTicket: inputs.costPerTicket,
    takeHomeWithout: results.withoutPromo.totalIncome,
    takeHomeWith: results.withPromo.totalIncome - results.results.promoCost,
    promoCost: results.results.promoCost,
    netGainLoss: results.results.netGainLoss,
    equilibrium: results.equilibrium,
    recommendation: results.recommendation,
  };

  const response = await fetch('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showName, context }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Server error (${response.status})`);
  }

  const data = await response.json();
  return data.summary;
}
