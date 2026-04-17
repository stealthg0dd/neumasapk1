import type { NextApiRequest, NextApiResponse } from "next";

// In production, store in a database or CRM
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const data = req.body;
  // TODO: Add validation and persistence (e.g., Supabase, email, or CRM integration)
  // For pilot: log to console and return success
  console.log("Pilot intake submission:", data);
  return res.status(200).json({ ok: true });
}
