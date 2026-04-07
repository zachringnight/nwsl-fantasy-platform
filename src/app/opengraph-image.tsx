import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NWSL Fantasy — Draft leagues, salary-cap contests, and live match windows for the 2026 season.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0A0A14 0%, #0F1029 40%, #0A0A14 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(5, 34, 255, 0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "30%",
            right: "20%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0, 225, 255, 0.1) 0%, transparent 70%)",
          }}
        />

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: "#EAEAF4",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            NWSL Fantasy
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(234, 234, 244, 0.6)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            2026 Season
          </div>
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
          }}
        >
          {["Draft Leagues", "Salary Cap", "Live Scoring", "Daily Slates"].map(
            (label) => (
              <div
                key={label}
                style={{
                  border: "1px solid rgba(0, 225, 255, 0.3)",
                  borderRadius: 999,
                  padding: "10px 24px",
                  fontSize: 18,
                  color: "#00E1FF",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "rgba(0, 225, 255, 0.08)",
                }}
              >
                {label}
              </div>
            )
          )}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 18,
            color: "rgba(234, 234, 244, 0.4)",
            letterSpacing: "0.06em",
          }}
        >
          The home for NWSL fantasy football
        </div>
      </div>
    ),
    { ...size }
  );
}
