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
  // GEMINI CALL WITH SAFE FALLBACK LOOP
  // -------------------------
  async function generatePRD() {
    const models = ["gemini-2.5-flash", "gemini-2.5-pro"];

    for (const model of models) {
      try {
        console.log("Trying model:", model);

        const response = await ai.models.generateContent({
          model,
          contents: prompt
        });

        // -------------------------
        // CRITICAL FIX:
        // Handle API-level errors inside response
        // -------------------------
        if (response?.error) {
          console.log(`Model ${model} returned API error:`, response.error);
          continue;
        }

        if (response?.text && response.text.length > 0) {
          return {
            text: response.text,
            modelUsed: model
          };
        }

        console.log(`Model ${model} returned empty response`);

      } catch (err) {
        console.log(`Model ${model} threw error:`, err.message);
      }
    }

    throw new Error("All Gemini models failed");
  }

  // -------------------------
  // MAIN EXECUTION
  // -------------------------
  try {
    const result = await generatePRD();

    // -------------------------
    // SUPABASE SAVE (non-blocking)
    // -------------------------
    const { error: dbError } = await supabase
      .from("prds")
      .insert([
        {
          input,
          prd: result.text,
          model_used: result.modelUsed
        }
      ]);

    if (dbError) {
      console.error("Supabase error:", dbError);
    }

    // -------------------------
    // RESPONSE
    // -------------------------
    return res.status(200).json({
      prd: result.text,
      model_used: result.modelUsed,
      saved: !dbError
    });

  } catch (err) {
    console.error("FINAL ERROR:", err);

    return res.status(500).json({
      error: err.message
    });
  }
}
