import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const {
      input,
      level = "standard",
      stage = "idea"
    } = req.body || {};

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Missing or invalid input",
        success: false
      });
    }

    // -------------------------
    // INIT CLIENTS
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
You are a Principal Product Manager at a top-tier SaaS company.

PRD LEVEL: ${level.toUpperCase()}
PRODUCT STAGE: ${stage.toUpperCase()}

LEVEL GUIDELINES:

If SIMPLE:
- Very concise
- High-level only

If STANDARD:
- Balanced detail

If DETAILED:
- Deep and execution-ready

STAGE GUIDELINES:

If IDEA:
- Focus on problem clarity
- MVP only

If MVP:
- Core features + iteration

If GROWTH:
- Scalability, integrations, edge cases

FORMAT:

Use bold section headers:

**Problem**
**Users**
**Goals**
**Features**
**Success Metrics**

Return clean markdown only.

PRODUCT IDEA:
${input}
`;

    // -------------------------
    // GENERATE PRD
    // -------------------------
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    });

    const text = completion?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Empty response from Groq");
    }

    const latency_ms = Date.now() - startTime;

    // -------------------------
    // SAVE TO SUPABASE
    // -------------------------
    const { error: dbError } = await supabase
      .from("prd_outputs")
      .insert([
        {
          idea: input,
          prd: text.trim(),
          model_used: "llama-3.1-8b-instant",
          latency_ms,
          success: true,
          product_stage: stage,
          product_level: level
        }
      ]);

    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    return res.status(200).json({
      prd: text.trim(),
      model_used: "llama-3.1-8b-instant",
      latency_ms,
      success: true,
      saved: !dbError,
      product_stage: stage,
      product_level: level
    });

  } catch (err) {
    const latency_ms = Date.now() - startTime;

    console.error("FINAL ERROR:", err);

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      await supabase.from("prd_outputs").insert([
        {
          idea: "FAILED",
          prd: err.message || "error",
          model_used: "none",
          latency_ms,
          success: false,
          product_stage: null,
          product_level: null
        }
      ]);
    } catch (e) {
      console.error("Failed to log error:", e);
    }

    return res.status(500).json({
      error: err.message,
      latency_ms,
      success: false,
      saved: false
    });
  }
}
