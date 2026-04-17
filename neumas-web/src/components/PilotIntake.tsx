"use client";
import React, { useState } from "react";

const businessTypes = [
  "Restaurant",
  "Caterer",
  "Central Kitchen",
  "Hotel",
  "Food-service Operator",
  "Other",
];

export default function PilotIntake() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    company: "",
    contact: "",
    email: "",
    phone: "",
    businessType: "",
    sites: "",
    process: "",
    startDate: "",
  });
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Basic validation
    if (!form.company || !form.contact || !form.email) {
      setError("Please fill in all required fields.");
      return;
    }
    // TODO: Replace with real API call
    try {
      await fetch("/api/pilot-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch (err) {
      setError("Submission failed. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-white/90 rounded-xl shadow p-8 flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-2 text-gray-900">Thank you!</h2>
        <p className="text-gray-700 mb-4 text-center">Your pilot request has been received. Our team will reach out to you soon to schedule your onboarding and answer any questions.</p>
        <a href="/" className="px-5 py-2 rounded bg-black text-white font-semibold hover:bg-gray-900 transition">Back to Home</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto mt-16 bg-white/90 rounded-xl shadow p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Start Your 14-Day Pilot</h2>
      <div className="grid grid-cols-1 gap-5">
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Company Name *</span>
          <input name="company" value={form.company} onChange={handleChange} required className="input" />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Contact Name *</span>
          <input name="contact" value={form.contact} onChange={handleChange} required className="input" />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Email *</span>
          <input name="email" type="email" value={form.email} onChange={handleChange} required className="input" />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Phone</span>
          <input name="phone" value={form.phone} onChange={handleChange} className="input" />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Business Type</span>
          <select name="businessType" value={form.businessType} onChange={handleChange} className="input">
            <option value="">Select...</option>
            {businessTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Number of Sites/Outlets</span>
          <input name="sites" value={form.sites} onChange={handleChange} className="input" />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Current Process</span>
          <textarea name="process" value={form.process} onChange={handleChange} className="input" rows={2} />
        </label>
        <label className="flex flex-col">
          <span className="font-semibold mb-1">Preferred Start Date</span>
          <input name="startDate" type="date" value={form.startDate} onChange={handleChange} className="input" />
        </label>
        {error && <div className="text-red-600 font-semibold">{error}</div>}
        <button type="submit" className="mt-4 px-6 py-3 rounded-lg bg-black text-white font-semibold shadow hover:bg-gray-900 transition">Submit Pilot Request</button>
      </div>
    </form>
  );
}
