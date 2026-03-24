// Extend timeout for large deal sheets (Netlify allows up to 26s on free tier)
exports.config = { maxDuration: 26 };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let reqData;
  try {
    reqData = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { dealSheet } = reqData;

  const systemPrompt = `You are a tour deal sheet parser for live music. You receive raw text from a booking agent's deal sheet (often copied from a spreadsheet or email) and extract structured data for each show.

Return ONLY valid JSON with no markdown formatting. No code fences. No explanation.

Return an array of show objects. For each show, extract whatever is available:

[
  {
    "date": "YYYY-MM-DD",
    "venue": "venue name",
    "market": "city, state/province",
    "dealType": "flat_guarantee" | "door_deal" | "guarantee_vs_gross" | "guarantee_vs_net" | "guarantee_plus_after_expenses" | "unknown",
    "guarantee": number or null,
    "artistPct": number (as decimal, e.g. 0.80) or null,
    "expenses": number or null,
    "ticketPrice": number or null,
    "capacity": number or null,
    "supportCost": number or null,
    "agentPct": 0.15,
    "notes": "any extra info like 'includes support' or support acts",
    "bonusTiers": [
      {
        "type": "pct_capacity" or "ticket_count",
        "threshold": number,
        "bonusMode": "dollar" or "pct_change",
        "amount": number or 0,
        "newPct": number (0-100) or 0
      }
    ]
  }
]

Bonus tier examples:
- "Bonus switches to 70% at 100% sold" → { "type": "pct_capacity", "threshold": 100, "bonusMode": "pct_change", "newPct": 70 }
- "Retro at sellout to 70%" → { "type": "pct_capacity", "threshold": 100, "bonusMode": "pct_change", "newPct": 70 }
- "$500 bonus at 200 tickets" → { "type": "ticket_count", "threshold": 200, "bonusMode": "dollar", "amount": 500 }
- If no bonus tiers, return empty array: []

Rules:
- If a field isn't in the data, use null
- "vs" typically means guarantee vs percentage: "$1000 vs 80%" = guarantee_vs_gross or guarantee_vs_net
- "after" or "plus after" means guarantee_plus_after_expenses: "$500 + 80% after $800"
- If it says "vs X% of net" or has expenses listed, it's guarantee_vs_net
- If it says "vs X% of gross" or just "vs X%" with no expenses, it's guarantee_vs_gross
- Default agentPct to 0.15 (15%) unless specified
- If support/opener cost is mentioned as "included in expenses", set supportCost to 0 and note it
- Parse ticket prices: "adv" = advance, "dos" = day of show — use advance price
- Dates without a year should be assumed to be 2026
- If a show is marked "OFF" or "TBD" or has no deal info, still include it with dealType "unknown" and nulls for financial fields
- Include ALL shows/dates from the input, even off days
- Try to infer the market/city from the venue name if not explicitly stated`;

  const userMessage = `Parse this tour deal sheet into structured show data:\n\n${dealSheet}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: 'Claude API error', details: errText }) };
    }

    const data = await response.json();
    const content = data.content[0].text.trim();

    // Strip markdown code fences if present
    let cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Extract JSON array
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No JSON array found in response', raw: cleaned.substring(0, 500) }) };
    }

    const shows = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shows })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Parse failed', message: err.message })
    };
  }
};
