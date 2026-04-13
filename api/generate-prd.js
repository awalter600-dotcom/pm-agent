export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { input } = req.body;

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  const prd = `
# Product Requirements Document

## Problem
${input}

## Solution
Build a simple AI-powered tool to help product managers.

## Features
- Generate PRDs from ideas
- Save outputs
- Improve requirements over time
`;

  return res.status(200).json({ prd });
}
