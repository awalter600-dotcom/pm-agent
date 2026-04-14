import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  // -------------------------
  // INIT CLIENTS
  // -------------------------
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const prompt = `
You are a senior Product Manager.

Write a structured PRD with:
- Problem
- Users
- Goals
- Features
- Success metrics

Idea: ${input}
`;

  // -------------------------
  // HELPER: CHECK VALID RESPONSE
  // -------------------------
  function isValidResponse(response) {
    return response && response.text && response.text.length > 0;
  }

  // -------------------------
  // GEMINI WITH PROPER FALLBACK
  // -------------------------
  async function generatePRD() {
    console.log("Trying model: gemini-2.5-flash");

    let response;

    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
    } catch (err) {
      console.log("Flash request failed:", err.message);
    }

    // If flash failed OR returned empty → fallback
    if (!isValidResponse(response)) {
      console.log("Switching to gemini-2.5-pro");

      response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt
      });
    }

    // Final validation
    if (!isValidResponse(response)) {
      throw new Error("Both models failed to generate a PRD");
    }

    return response.text;
  }

  // -------------------------
  // MAIN EXECUTION
  // -------------------------
  try {
    const prd = await generatePRD();

    // -------------------------
    // SAVE TO SUPABASE
    // -------------------------
    const { error: dbError } = await supabase
      .from("prds")
      .insert([{ input, prd }]);

    if (dbError) {
      console.error("Supabase error:", dbError);
    }

    // -------------------------
    // RESPONSE
    // -------------------------
    return res.status(200).json({
      prd,
      saved: !dbError,
      model_used: "gemini-2.5-flash or gemini-2.5-pro"
    });

  } catch (err) {
    console.error("FINAL ERROR:", err);

    return res.status(500).json({
      error: err.message
    });
  }
}
