import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const startTime = Date.now();

  // -------------------------
  // METHOD CHECK
  // -------------------------
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

  // -------------------------
  // PROMPT
  // -------------------------
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
  // GEMINI GENERATION WITH FALLBACK
  // -------------------------
  async function generatePRD() {
    const models = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

    for (const model of models) {
      try {
        console.log("Trying model:", model);

        const response = await ai.models.generateContent({
          model,
          contents: prompt
        });

        const text = response.text();

        if (text && text.length > 0) {
          return {
            text,
            modelUsed: model
          };
        }
      } catch (err) {
        console.log(`Model ${model} failed:`, err.message);
      }
    }

    throw new Error("All models failed to generate PRD");
  }

  // -------------------------
  // MAIN LOGIC
  // -------------------------
  try {
    const result = await generatePRD();
    const latency_ms = Date.now() - startTime;

    // -------------------------
    // SUPABASE INSERT (SUCCESS)
    // -------------------------
    const { error: dbError } = await supabase.from("prd_outputs").insert([
      {
        idea: input,
        prd: result.text,
        model_used: result.modelUsed,
        latency_ms,
        success: true
      }
    ]);

    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    // -------------------------
    // RESPONSE
    // -------------------------
    return res.status(200).json({
      prd: result.text,
      model_used: result.modelUsed,
      latency_ms,
      success: true,
      saved: !dbError
    });

  } catch (err) {
    const latency_ms = Date.now() - startTime;

    console.error("FINAL ERROR:", err);

    // -------------------------
    // FAIL SAFE SUPABASE LOG
    // -------------------------
    await supabase.from("prd_outputs").insert([
      {
        idea: input,
        prd: err.message || "FAILED",
        model_used: "none",
        latency_ms,
        success: false
      }
    ]);

    // -------------------------
    // ERROR RESPONSE
    // -------------------------
    return res.status(500).json({
      error: err.message,
      latency_ms,
      success: false,
      saved: false
    });
  }
}
