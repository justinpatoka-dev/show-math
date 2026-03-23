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
- If you see "retro at sellout" or "switches to X% at Y" or percentage changes at certain thresholds, include them in the bonusTiers array

Also return a bonusTiers array. Each bonus tier is an object:
{
  "type": "pct_capacity" or "ticket_count",
  "threshold": number (percentage like 100 for 100% capacity, or ticket count),
  "bonusMode": "dollar" or "pct_change",
  "amount": number (dollar amount, only if bonusMode is "dollar"),
  "newPct": number from 0-100 (new artist percentage, only if bonusMode is "pct_change")
}

Examples:
- "Bonus switches to 70% at 100% sold" → { "type": "pct_capacity", "threshold": 100, "bonusMode": "pct_change", "newPct": 70 }
- "Retro at sellout to 70%" → { "type": "pct_capacity", "threshold": 100, "bonusMode": "pct_change", "newPct": 70 }
- "$500 bonus at 200 tickets" → { "type": "ticket_count", "threshold": 200, "bonusMode": "dollar", "amount": 500 }

If no bonus tiers, return an empty array: "bonusTiers": []`;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { text } = await req.json();
    if (!text) {
      return new Response(JSON.stringify({ error: 'No deal text provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Parse this deal:\n\n${text}` }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error (${response.status}): ${err}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) {
      return new Response(JSON.stringify({ error: 'Empty response from Claude.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
