const SUMMARY_PROMPT = `You are a music marketing strategist writing a short summary for an artist about their show deal and whether promotion makes sense. Your tone is direct, specific, and conversational — no fluff, no jargon. You're talking to the artist like a trusted advisor.

You will receive a JSON object with the full calculator results for a show. Write a summary that covers:

1. What the deal pays — the guarantee (if any), when backend kicks in, what happens above backend
2. The key ticket numbers — backend threshold, where the artist is projected, venue expectation if set
3. What promotion does to their take-home — the before/after comparison
4. Recommended approach — how much to spend on ads and why

Rules:
- Never say "don't promote" or "promotion is not worth it"
- If promo doesn't break even financially, frame it as: market-building, getting in front of new fans, showing the venue a strong turnout for a better deal next time
- Use specific dollar amounts and ticket numbers, not vague language
- Keep it to 3-5 short paragraphs
- Do not use markdown formatting, bullet points, or headers — write it as plain conversational text that can be pasted into an email
- Do not use dollar signs — spell out "dollars" or just use the number with "bucks" or leave the currency implicit (e.g. "take-home goes from 1,000 to 1,400")
- Address the artist as "you" and the promoter (the user) as "we"
- Only return the summary text, nothing else`;

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
    const { showName, context } = await req.json();
    if (!context) {
      return new Response(JSON.stringify({ error: 'No context provided.' }), {
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
        system: SUMMARY_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Generate an artist-facing summary for this show:\n\n${JSON.stringify(context, null, 2)}`,
          },
        ],
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

    return new Response(JSON.stringify({ summary: content.trim() }), {
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
