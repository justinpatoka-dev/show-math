const TOUR_SUMMARY_PROMPT = `You are a music marketing strategist writing a tour promotion plan for an artist. Your tone is direct, specific, and conversational — like a trusted advisor breaking down the plan.

You will receive a JSON array of shows with deal details, current ticket counts, allocated ad spend, and show type classifications (money vs build).

Write a tour-level summary that covers:

1. OVERVIEW: How many shows, total budget, what the plan accomplishes
2. PRIORITY SHOWS: Call out the 3-5 most important shows and why (biggest rooms, best ROI, key markets)
3. MONEY SHOWS: Which shows have strong earning potential above backend — emphasize the return
4. BUILD SHOWS: Which shows are market investments — frame as getting in front of new people and building for next time
5. BUDGET ALLOCATION: Brief explanation of how the budget is spread and why some shows get more
6. TIMELINE: When ads should start for early shows vs later shows
7. WHAT WE NEED FROM YOU: Ask the artist to share on socials, any specific markets where their engagement would help

Rules:
- Never say "don't promote" or "skip this show"
- Use specific numbers — ticket counts, dollar amounts, venue names
- Keep it to 5-7 short paragraphs
- Do not use markdown formatting, bullet points, or headers — write it as plain conversational text for an email
- Do not use dollar signs — spell out "dollars" or leave currency implicit
- Address the artist as "you" and the promoter as "we"
- Only return the summary text, nothing else`;

const SUMMARY_PROMPT = `You are a music marketing strategist writing a short summary for an artist about their show deal and whether promotion makes sense. Your tone is direct, specific, and conversational — no fluff, no jargon. You're talking to the artist like a trusted advisor.

You will receive a JSON object with the full calculator results for a show. Write a summary that covers:

1. Whether this is a money opportunity or a build opportunity. Determine this from the numbers:
   - MONEY OPPORTUNITY: Backend is reachable, promo breaks even or is profitable, income per ticket significantly exceeds cost per ticket, the gap between baseline and target is closeable with reasonable ad spend
   - BUILD OPPORTUNITY: Flat guarantee with no backend, promo doesn't break even financially, baseline is low (new or weak market), backend is far from realistic sales
   - Frame this clearly up front so the artist understands what kind of show this is
2. What the deal pays — the guarantee (if any), when backend kicks in, what happens above backend
3. The key ticket numbers — backend threshold, where the artist is projected, venue expectation if set
4. What promotion does to their take-home — the before/after comparison
5. Recommended approach — how much to spend on ads, why, and how far out to start (more tickets needed = start earlier: under 30 tickets needed suggest 2 weeks, 30-60 suggest 3 weeks, 60+ suggest 4 weeks)

Rules:
- Never say "don't promote" or "promotion is not worth it"
- If it's a build opportunity, frame the spend as an investment: getting in front of new fans, showing the venue a strong turnout for a better deal next time, growing the market
- If it's a money opportunity, emphasize the return: what they walk away with after promo costs
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
    const body = await req.json();
    const { type } = body;

    let systemPrompt, userMessage;

    if (type === 'tour') {
      const { artist, totalBudget, marketingFee, shows } = body;
      systemPrompt = TOUR_SUMMARY_PROMPT;
      userMessage = `Generate a tour promotion plan summary for ${artist}.\n\nTotal ad budget: ${totalBudget}\nMarketing fee per show: ${marketingFee}\n\nShows:\n${JSON.stringify(shows, null, 2)}`;
    } else {
      const { showName, context } = body;
      if (!context) {
        return new Response(JSON.stringify({ error: 'No context provided.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      systemPrompt = SUMMARY_PROMPT;
      userMessage = `Generate an artist-facing summary for this show:\n\n${JSON.stringify(context, null, 2)}`;
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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
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
