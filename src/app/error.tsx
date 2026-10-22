"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import styles from "./error.module.css";

interface ErrorPageProps {
  error: Error;
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  console.error("[500] Unhandled error:", error);

  return (
    <>
      <Navbar />
      <main className={styles.main} id="main-content">
        <div className={styles.card}>
          <h1 className={styles.heading}>Something went wrong</h1>
          <p className={styles.description}>
            We hit an unexpected error. Please try again or go home.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                reset();
              }}
              aria-label="Retry the page"
            >
              Retry
            </button>
            <Link
              href="/"
              className={styles.buttonOutline}
              aria-label="Go to the Lumigift home page"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
