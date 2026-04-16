export default async function handler(req, res) {
  // 1. Get data from the request body
  const { prompt, history } = req.body;
  const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

  // ... (rest of your logic for SYSTEM_PROMPT and fetch) ...

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        // ... your existing fetch code ...
    });
    const data = await response.json();
    
    // 2. Vercel's way of sending the answer back:
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}