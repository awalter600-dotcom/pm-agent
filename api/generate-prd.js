import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
You are a senior Product Manager.

Write a structured PRD:

Problem:
Users:
Goals:
Features:
Success Metrics:

Idea: ${input}
`
    });

    return res.status(200).json({
      prd: response.text
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
