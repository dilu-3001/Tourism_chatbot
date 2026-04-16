export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, history } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY; // Make sure this matches your Vercel Settings!

  // 2. Your Rotorua Data & System Instructions
  const SYSTEM_INSTRUCTION = "You are a Rotorua Tourism Analyst. Use the provided data to answer questions about occupancy and spend. Be concise.";

  // 3. Construct the Gemini Payload
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Question: ${prompt}` }]
      }
    ]
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini Error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    // 4. Send the text back to your HTML
    const botReply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ 
      content: [{ text: botReply }] 
    });

  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}