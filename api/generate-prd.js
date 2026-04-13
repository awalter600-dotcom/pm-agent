export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a senior Product Manager.

Write a structured PRD with:
- Problem
- Users
- Goals
- Features
- Success metrics

Idea: ${input}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    // 🔴 DEBUG: show full Gemini response in logs
    console.log("Gemini response:", JSON.stringify(data, null, 2));

    // 🔴 If API failed
    if (!response.ok) {
      return res.status(500).json({
        error: "Gemini API failed",
        details: data
      });
    }

    const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    // 🔴 If no output returned
    if (!output) {
      return res.status(500).json({
        error: "No content returned from Gemini",
        raw: data
      });
    }

    return res.status(200).json({
      prd: output
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
