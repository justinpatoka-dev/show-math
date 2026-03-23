exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let emailData;
  try {
    emailData = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { from, subject, body } = emailData;

  const systemPrompt = `You are a data extraction assistant. You receive automated venue/ticketing platform emails and extract ticket count information.

Your job:
1. Determine if this email contains a ticket count report for a live music show
2. If yes, extract the key data
3. If no (it's a conversation about tickets, a marketing email, etc.), mark it as not a ticket count

Return ONLY valid JSON with no markdown formatting. No code fences.

If it IS a ticket count email, return:
{
  "is_ticket_count": true,
  "venue": "venue name",
  "artist": "artist/act name",
  "show_date": "YYYY-MM-DD",
  "ticket_count": number (the total tickets sold/distributed — use the most relevant total, typically total sold or total distributed, not subtotals by ticket type),
  "ticket_type": "presale" or "final" or "daily_update",
  "source_platform": "Etix" or "Eventbrite" or "DICE" or "Opendate" or "other"
}

If it is NOT a ticket count email, return:
{
  "is_ticket_count": false
}

Notes:
- The ticket count should be the total number, not broken down by type
- If there are multiple ticket types (GA, VIP, etc.), sum them
- "presale" means tickets sold before the show date
- "final" means it's the last count (show date or after)
- "daily_update" means it's a recurring count before the show
- If you can't determine the show date, use null
- If the email is clearly not about a specific show's ticket sales (e.g., it's a newsletter, a conversation, a system notification), mark is_ticket_count as false`;

  const userMessage = `From: ${from}
Subject: ${subject}

Body:
${body}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
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
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const result = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Parse failed', message: err.message })
    };
  }
};
