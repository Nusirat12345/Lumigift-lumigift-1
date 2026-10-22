import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import "@/styles/globals.css";
import "@/styles/components.css";

interface GlobalErrorProps {
  error: Error;
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  console.error("[layout] Unhandled layout error:", error);

  return (
    <html lang="en">
      <body>
        <Navbar />
        <main id="main-content" style={{ padding: "var(--space-6)" }}>
          <div
            style={{
              maxWidth: "420px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: "var(--space-8)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border-subtle)",
              background: "var(--color-surface-card)",
            }}
          >
            <h1
              style={{
                fontSize: "var(--text-3xl)",
                fontWeight: "var(--font-bold)",
                color: "var(--color-text-primary)",
                margin: 0,
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "var(--text-base)",
                color: "var(--color-text-secondary)",
                margin: "0 0 var(--space-4) 0",
              }}
            >
              We hit an unexpected layout error. Please try again or go home.
            </p>
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => reset()}
                aria-label="Retry the page"
                style={{
                  padding: "var(--space-3) var(--space-6)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-brand-primary)",
                  background: "var(--color-brand-primary)",
                  color: "#fff",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--font-medium)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              <Link
                href="/"
                style={{
                  padding: "var(--space-3) var(--space-6)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border-subtle)",
                  background: "transparent",
                  color: "var(--color-text-primary)",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--font-medium)",
                  textDecoration: "none",
                }}
              >
                Go home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
