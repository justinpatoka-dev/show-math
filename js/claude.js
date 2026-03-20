// Claude API integration — parses deal language into calculator inputs

const STORAGE_KEY_API = 'showDealCalc_apiKey';

const SYSTEM_PROMPT = `You are a music industry deal parser. You receive raw deal language from booking agents and extract structured data for a show deal calculator.

The calculator supports 5 deal types:
1. "flat_guarantee" — Artist gets a fixed dollar amount regardless of ticket sales.
2. "door_deal" — Artist gets a percentage of all ticket revenue from dollar one. No guarantee, no expenses.
3. "guarantee_vs_gross" — Artist gets the GREATER of a guarantee OR a percentage of gross ticket revenue. Expenses may be a threshold that gross must exceed before the percentage kicks in, but the percentage applies to ALL gross (not net).
4. "guarantee_vs_net" — Artist gets the GREATER of a guarantee OR a percentage of net revenue (gross minus expenses).
5. "guarantee_plus_after_expenses" — Artist gets the guarantee PLUS a percentage of revenue above the expense threshold.

Key distinctions:
- "vs" means the artist gets whichever is higher (guarantee or percentage)
- "plus after" or "+" means the artist gets BOTH the guarantee AND the percentage above expenses
- "from dollar 1" or "of door" means door_deal (no guarantee, no expenses)
- "flat" with no percentage mentioned means flat_guarantee
- When expenses "include" the guarantee, support, hospitality, etc., the expense number is the total nut
- When support is "included in expenses," set supportCost to 0 to avoid double-counting
- "After" or "over" followed by a dollar amount typically means expenses/threshold

Return a JSON object with these fields (use null for anything you can't determine):
{
  "dealTypeId": "one of the 5 IDs above",
  "scenarioName": "venue name and city if available",
  "guarantee": number or 0,
  "expenses": number or 0,
  "ticketPrice": number (use advance price if both advance and day-of are given),
  "capacity": number or null,
  "artistPct": number from 0-100 (e.g. 80 for 80%),
  "supportCost": number or 0,
  "notes": "brief explanation of how you interpreted the deal, especially any ambiguities"
}

Important rules:
- Only return valid JSON, no markdown formatting, no code fences
- If the deal language is ambiguous, pick the most likely interpretation and explain in notes
- If support is explicitly included in expenses, set supportCost to 0
- Ticket price should be the advance price if two prices are listed (adv/dos)
- artistPct should be a whole number (80 not 0.80)
- If you see "retro at sellout" or percentage changes at certain thresholds, note it but map to the base deal type`;

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

export function setApiKey(key) {
  if (key) {
    localStorage.setItem(STORAGE_KEY_API, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_API);
  }
}

export async function parseDealText(text) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Click the gear icon in the header to add your Anthropic API key.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this deal:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Check your key in settings.');
    }
    throw new Error(`API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error('Empty response from Claude.');
  }

  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Could not parse Claude response as JSON. Response: ' + content.substring(0, 200));
  }
}
