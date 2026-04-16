
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;


  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Question: ${prompt}` }]
    }]
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Handle non-200 responses before parsing JSON
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Google API Error:', errorText);
        return res.status(response.status).json({ error: "Google API rejected the request." });
    }

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const botReply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ 
      content: [{ text: botReply }] 
    });

  } catch (err) {
    console.error('Server Crash:', err);
    return res.status(500).json({ error: "The server encountered an error processing the data." });
  }
}