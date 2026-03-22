// Entry point — wires inputs to calculator to UI

import { calculateScenario } from './calculator.js';
import { readInputs, populateInputs, renderResults, updateFieldVisibility, addBonusTierRow, renderSavedScenarios } from './ui.js';
import { saveScenario, loadScenarios, deleteScenario, getScenario } from './storage.js';
import { getApiKey, setApiKey, parseDealText } from './claude.js';

let lastResults = null;
let withPromoManuallyEdited = false;
let adSpendManuallyEdited = false;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Live recalculation on any input change
  const inputsPanel = document.getElementById('inputs-panel');
  let debounceTimer = null;

  inputsPanel.addEventListener('input', (e) => {
    // Don't recalculate when typing in the deal text area
    if (e.target.id === 'deal-text') return;

    // Track manual edits to auto-filled fields
    if (e.target.id === 'tickets-with') {
      withPromoManuallyEdited = true;
    }
    if (e.target.id === 'ad-spend') {
      adSpendManuallyEdited = true;
    }

    // Auto-fill ad spend from gap to target when relevant inputs change
    if (['deal-type', 'guarantee', 'expenses', 'ticket-price', 'capacity', 'artist-pct',
         'agent-pct', 'support-cost', 'target-take-home', 'tickets-without',
         'cost-per-ticket', 'merch-spend', 'merch-margin', 'marketing-fee'].includes(e.target.id)) {
      updateAdSpendFromTarget();
    }

    // Update estimated tickets hint and auto-fill "with promo"
    if (['ad-spend', 'cost-per-ticket', 'tickets-without'].includes(e.target.id)) {
      updateEstimatedTickets();
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recalculate, 80);
  });

  // Deal type change — update field visibility
  const dealTypeSelect = document.getElementById('deal-type');
  dealTypeSelect.addEventListener('change', () => {
    updateFieldVisibility(dealTypeSelect.value);
    recalculate();
  });

  // Add bonus tier button
  document.getElementById('add-bonus-tier').addEventListener('click', () => {
    addBonusTierRow();
  });

  // Save scenario button
  document.getElementById('save-scenario-btn').addEventListener('click', handleSave);

  // Toggle sidebar
  document.getElementById('sidebar-open')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
  });
  document.querySelector('.sidebar-close')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  // Select-all on focus for number inputs
  inputsPanel.addEventListener('focusin', (e) => {
    if (e.target.type === 'number') {
      e.target.select();
    }
  });

  // Parse deal button
  document.getElementById('parse-deal-btn')?.addEventListener('click', handleParseDeal);

  // Settings modal
  document.getElementById('settings-open')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    modal.style.display = 'flex';
    // Pre-fill if key exists
    const existing = getApiKey();
    document.getElementById('api-key-input').value = existing ? existing.substring(0, 10) + '...' : '';
    document.getElementById('api-key-status').textContent = existing ? 'Key is saved.' : '';
    document.getElementById('api-key-status').className = 'parse-status' + (existing ? ' info' : '');
  });
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.getElementById('save-api-key')?.addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    const val = input.value.trim();
    if (!val || val.endsWith('...')) {
      // Don't overwrite with the masked display value
      document.getElementById('api-key-status').textContent = 'Enter your full API key.';
      document.getElementById('api-key-status').className = 'parse-status error';
      return;
    }
    setApiKey(val);
    document.getElementById('api-key-status').textContent = 'Key saved.';
    document.getElementById('api-key-status').className = 'parse-status success';
    input.value = val.substring(0, 10) + '...';
  });
  document.getElementById('clear-api-key')?.addEventListener('click', () => {
    setApiKey('');
    document.getElementById('api-key-input').value = '';
    document.getElementById('api-key-status').textContent = 'Key cleared.';
    document.getElementById('api-key-status').className = 'parse-status info';
  });

  // Initial state
  updateFieldVisibility(dealTypeSelect.value);
  updateAdSpendFromTarget();
  updateEstimatedTickets();
  recalculate();
  refreshSidebar();
});

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

// ============================================
// Recalculate and render
// ============================================

function updateAdSpendFromTarget() {
  if (adSpendManuallyEdited) return;

  const costPerTicket = parseFloat(document.getElementById('cost-per-ticket')?.value) || 0;
  if (costPerTicket <= 0) return;

  // Run a quick calculation to get ticketsToTarget
  const inputs = readInputs();
  const results = calculateScenario(inputs);
  if (!results || !results.ticketsToTarget || results.ticketsToTarget <= 0) {
    // No target or already met — set ad spend to 0
    const adSpendEl = document.getElementById('ad-spend');
    if (adSpendEl) adSpendEl.value = 0;
    updateEstimatedTickets();
    return;
  }

  const baseline = parseFloat(document.getElementById('tickets-without')?.value) || 0;
  const gap = Math.max(0, results.ticketsToTarget - baseline);
  const adSpend = Math.ceil(gap * costPerTicket);

  const adSpendEl = document.getElementById('ad-spend');
  if (adSpendEl) adSpendEl.value = adSpend;
  updateEstimatedTickets();
}

function updateEstimatedTickets() {
  const adSpend = parseFloat(document.getElementById('ad-spend')?.value) || 0;
  const costPerTicket = parseFloat(document.getElementById('cost-per-ticket')?.value) || 0;
  const ticketsWithout = parseFloat(document.getElementById('tickets-without')?.value) || 0;

  const estimated = costPerTicket > 0 ? Math.floor(adSpend / costPerTicket) : 0;

  // Update the hint display
  const hintEl = document.getElementById('estimated-ad-tickets');
  if (hintEl) hintEl.textContent = estimated;

  // Auto-fill "With Promotion" unless user has manually overridden it
  if (!withPromoManuallyEdited) {
    const withEl = document.getElementById('tickets-with');
    if (withEl) withEl.value = ticketsWithout + estimated;
  }
}

function recalculate() {
  const inputs = readInputs();
  const results = calculateScenario(inputs);
  lastResults = results;
  renderResults(results);
}

// ============================================
// Parse deal with Claude
// ============================================

async function handleParseDeal() {
  const textarea = document.getElementById('deal-text');
  const btn = document.getElementById('parse-deal-btn');
  const status = document.getElementById('parse-status');
  const text = textarea.value.trim();

  if (!text) {
    status.textContent = 'Enter deal language to parse.';
    status.className = 'parse-status error';
    return;
  }

  if (!getApiKey()) {
    status.textContent = 'No API key set. Click the gear icon to add your Anthropic API key.';
    status.className = 'parse-status error';
    return;
  }

  // Loading state
  btn.textContent = 'Parsing...';
  btn.classList.add('loading');
  status.textContent = '';
  status.className = 'parse-status';

  try {
    const parsed = await parseDealText(text);

    // Map parsed fields to form inputs
    const formData = {
      scenarioName: parsed.scenarioName || '',
      showDate: '',
      dealTypeId: parsed.dealTypeId || 'door_deal',
      guarantee: parsed.guarantee || 0,
      expenses: parsed.expenses || 0,
      ticketPrice: parsed.ticketPrice || 20,
      capacity: parsed.capacity || 200,
      artistPct: (parsed.artistPct || 80) / 100,
      agentPct: 0.15, // keep default
      supportCost: parsed.supportCost || 0,
      venueExpectation: 0,
      bonusTiers: [],
      marketingFee: 0,
      adSpend: 0,
      costPerTicket: 7,
      ticketsWithout: 50,
      ticketsWith: 100,
      merchSpend: 10,
      merchMargin: 0.65,
    };

    withPromoManuallyEdited = false;
    adSpendManuallyEdited = false;
    populateInputs(formData);
    updateFieldVisibility(formData.dealTypeId);
    updateEstimatedTickets();
    recalculate();

    // Show notes from Claude
    const noteText = parsed.notes ? parsed.notes : 'Deal parsed successfully.';
    status.textContent = noteText;
    status.className = 'parse-status success';

  } catch (err) {
    status.textContent = err.message;
    status.className = 'parse-status error';
  } finally {
    btn.textContent = 'Parse Deal';
    btn.classList.remove('loading');
  }
}

// ============================================
// Save handling
// ============================================

function handleSave() {
  const inputs = readInputs();
  if (!lastResults) return;

  const defaultName = inputs.scenarioName
    ? (inputs.showDate ? `${inputs.scenarioName} - ${inputs.showDate}` : inputs.scenarioName)
    : 'Untitled Scenario';

  const name = prompt('Name this scenario:', defaultName);
  if (name === null) return; // cancelled

  saveScenario(name || defaultName, inputs, lastResults);
  refreshSidebar();

  // Save confirmation
  const btn = document.getElementById('save-scenario-btn');
  btn.textContent = 'Saved!';
  btn.classList.add('saved');
  setTimeout(() => {
    btn.textContent = 'Save Scenario';
    btn.classList.remove('saved');
  }, 1500);
}

// ============================================
// Sidebar management
// ============================================

function refreshSidebar() {
  const scenarios = loadScenarios();
  renderSavedScenarios(scenarios, handleLoad, handleDelete);

  // Update count badge in header
  const badge = document.getElementById('saved-count-header');
  if (badge) {
    badge.textContent = scenarios.length > 0 ? scenarios.length : '';
  }
}

function handleLoad(id) {
  const scenario = getScenario(id);
  if (!scenario) return;
  withPromoManuallyEdited = false;
  adSpendManuallyEdited = false;
  populateInputs(scenario.inputs);
  updateEstimatedTickets();
  recalculate();
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function handleDelete(id) {
  deleteScenario(id);
  refreshSidebar();
}
