import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(180deg, rgba(250,250,250,1) 0%, rgba(241,245,249,1) 48%, rgba(255,255,255,1) 100%)",
          color: "#0f172a",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 24, letterSpacing: 4, color: "#0071a3" }}>NEUMAS</div>
          <div
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(15,23,42,0.08)",
              fontSize: 18,
              color: "#334155",
            }}
          >
            Grocery Autopilot
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 920 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 0.95, letterSpacing: -3, fontWeight: 700 }}>
            <span>Know your pantry</span>
            <span>before the next shop.</span>
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.4, color: "#475569", maxWidth: 900 }}>
            AI-powered receipt intelligence, pantry tracking, stockout prediction, and smart shopping lists for households in Singapore and Southeast Asia.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            "Receipt intelligence",
            "Pantry inventory",
            "Stockout prediction",
            "Smart shopping lists",
          ].map((label) => (
            <div
              key={label}
              style={{
                padding: "14px 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(15,23,42,0.08)",
                fontSize: 22,
                color: "#334155",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}