import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const startTime = Date.now();

  try {
    // -------------------------
    // METHOD CHECK
    // -------------------------
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    // -------------------------
    // INPUT SAFETY (VERY IMPORTANT)
    // -------------------------
    const input =
      req.body?.input ||
      req.body?.idea ||
      req.body?.text;

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Missing or invalid input"
      });
    }

    // -------------------------
    // ENV CHECK (FAIL FAST)
    // -------------------------
    if (!process.env.GROQ_API_KEY) {
      throw new Error("Missing GROQ_API_KEY");
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase env vars");
    }

    // -------------------------
    // CLIENTS
    // -------------------------
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
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
- Success Metrics

Return clean markdown only.

Idea:
${input}
`;

    // -------------------------
    // LLM CALL (WITH RETRY)
    // -------------------------
    async function generateWithRetry(retries = 2) {
      let lastError;

      for (let i = 0; i <= retries; i++) {
        try {
          const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "user", content: prompt }
            ],
            temperature: 0.7
          });

          const text = response?.choices?.[0]?.message?.content;

          if (text) {
            return text;
          }

          throw new Error("Empty LLM response");
        } catch (err) {
          lastError = err;
          console.log(`LLM attempt ${i + 1} failed:`, err.message);
        }
      }

      throw lastError;
    }

    const prdText = await generateWithRetry();

    // -------------------------
    // LATENCY
    // -------------------------
    const latency_ms = Date.now() - startTime;

    // -------------------------
    // SUPABASE SAVE (SAFE - NEVER CRASH API)
    // -------------------------
    let dbSaved = true;

    try {
      const { error } = await supabase
        .from("prd_outputs")
        .insert([
          {
            idea: input,
            prd: prdText,
            model_used: "llama-3.1-8b-instant",
            latency_ms,
            success: true
          }
        ]);

      if (error) {
        console.log("Supabase insert error:", error);
        dbSaved = false;
      }
    } catch (dbErr) {
      console.log("Supabase crash:", dbErr);
      dbSaved = false;
    }

    // -------------------------
    // RESPONSE
    // -------------------------
    return res.status(200).json({
      prd: prdText,
      model_used: "llama-3.1-8b-instant",
      latency_ms,
      success: true,
      saved: dbSaved
    });

  } catch (err) {
    // -------------------------
    // GLOBAL ERROR HANDLER
    // -------------------------
    const latency_ms = Date.now() - startTime;

    console.error("API ERROR:", err);

    return res.status(500).json({
      error: err.message,
      latency_ms,
      success: false,
      saved: false
    });
  }
}
