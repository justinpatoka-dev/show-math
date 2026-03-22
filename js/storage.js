// Save/load scenarios to localStorage

const STORAGE_KEY = 'showDealCalc_scenarios';

export function saveScenario(name, inputs, results) {
  const scenarios = loadScenarios();
  const scenario = {
    id: crypto.randomUUID(),
    name: name || generateName(inputs),
    timestamp: new Date().toISOString(),
    inputs: { ...inputs },
    summary: {
      dealType: inputs.dealTypeId,
      ticketsWith: inputs.ticketsWith,
      netGainLoss: results.results.netGainLoss,
      totalIncomeWith: results.withPromo.totalIncome,
      promoCost: results.results.promoCost,
    },
  };
  scenarios.unshift(scenario);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  return scenario;
}

export function loadScenarios() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function deleteScenario(id) {
  const scenarios = loadScenarios().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function getScenario(id) {
  return loadScenarios().find(s => s.id === id) || null;
}

function generateName(inputs) {
  return inputs.scenarioName || 'Untitled';
}
