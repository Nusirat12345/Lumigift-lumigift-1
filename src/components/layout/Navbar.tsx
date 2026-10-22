"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { useTranslation, SUPPORTED_LOCALES } from "@/i18n";
import type { Locale } from "@/i18n/types";
import styles from "./Navbar.module.css";

const NAV_HREFS = [
  { href: "/send", labelKey: "nav.send_gift" as const },
  { href: "/dashboard", labelKey: "nav.dashboard" as const },
];

const MOBILE_BREAKPOINT = 768;

export function Navbar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useTranslation();

  return (
    <header className={styles.header}>
      <nav
        ref={navRef}
        className={`container ${styles.nav}`}
        aria-label="Main navigation"
        onKeyDown={handleKeyDown}
      >
        <Link
          href="/"
          className={styles.logo}
          aria-label="Lumigift home"
          onClick={handleLinkClick}
        >
          <span className={styles.logoMark}>Z</span>
          <span className={styles.logoText}>Lumigift</span>
        </Link>

        <ul className={styles.links} role="list">
          {NAV_HREFS.map(({ href, labelKey }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href} role="none">
                <Link
                  href={href}
                  role="menuitem"
                  className={`${styles.link} ${active ? styles.linkActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={handleLinkClick}
                >
                  {t(labelKey)}
                </Link>
              </li>
            );
          })}

          {/* ── Language selector ──────────────────────────────────────── */}
          <li>
            <label htmlFor="lang-select" className="sr-only">
              {t("nav.language_selector")}
            </label>
            <select
              id="lang-select"
              className={styles.langSelect}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label={t("nav.select_language")}
            >
              {SUPPORTED_LOCALES.map(({ code, nativeLabel }) => (
                <option key={code} value={code}>
                  {nativeLabel}
                </option>
              ))}
            </select>
          </li>

          <li>
            <ThemeToggle />
          </li>
          <li role="none">
            <Link
              href="/auth/login"
              className="btn btn--primary btn--sm"
              role="menuitem"
              onClick={handleLinkClick}
            >
          <li>
            <NotificationBell />
          </li>
          <li>
            <Link href="/auth/login" className="btn btn--primary btn--sm">
              {t("nav.sign_in")}
            </Link>
          </li>
          <span ref={focusTrapEndRef} />
        </ul>

        <div className={styles.navControls}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="lumigift-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </button>
        </div>
      </nav>
    </header>
  );
}
