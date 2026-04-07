"use client";

import { motion } from "framer-motion";

export default function AlertsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border border-gray-100 rounded-xl shadow-sm p-6 bg-white"
    >
      <h1 className="text-gray-900 font-semibold text-lg">Alerts</h1>
      <p className="text-gray-600 mt-2 text-sm">
        Live inventory alerts are based on low stock and out-of-stock signals from your inventory endpoint.
      </p>
    </motion.div>
  );
}

