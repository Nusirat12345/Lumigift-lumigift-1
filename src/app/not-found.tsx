"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className={styles.main} id="main-content">
        <div className={styles.card}>
          <h1 className={styles.heading}>Page not found</h1>
          <p className={styles.description}>
            Sorry, we couldn&rsquo;t find the page you&rsquo;re looking for.
          </p>
          <Link
            href="/"
            className={styles.button}
            aria-label="Go to the Lumigift home page"
          >
            Go home
          </Link>
        </div>
      </main>
    </>
  );
}
