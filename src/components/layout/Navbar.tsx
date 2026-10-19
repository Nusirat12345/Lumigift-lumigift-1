"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./Navbar.module.css";

const NAV_LINKS = [
  { href: "/send", label: "Send a Gift" },
  { href: "/dashboard", label: "Dashboard" },
];

const MOBILE_BREAKPOINT = 768;

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLNavElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusTrapEndRef = useRef<HTMLSpanElement>(null);

  // Close menu on Escape.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (menuOpen && e.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    },
    [menuOpen]
  );

  // Close menu on resize above breakpoint.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT && menuOpen) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [menuOpen]);

  // Focus management: trap focus inside the menu while open.
  useEffect(() => {
    if (!menuOpen || !navRef.current) return;

    const nav = navRef.current;
    const focusable = nav.querySelectorAll<HTMLElement>(
      'a[href], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last || document.activeElement === focusTrapEndRef.current) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    nav.addEventListener("keydown", handleTab);
    return () => nav.removeEventListener("keydown", handleTab);
  }, [menuOpen]);

  // Close menu when a link is clicked.
  const handleLinkClick = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

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

        <ul
          id="lumigift-mobile-menu"
          className={`${styles.links} ${menuOpen ? styles.linksOpen : ""}`}
          role="menu"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <li key={href} role="none">
                <Link
                  href={href}
                  role="menuitem"
                  className={`${styles.link} ${active ? styles.linkActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={handleLinkClick}
                >
                  {label}
                </Link>
              </li>
            );
          })}
          <li role="none">
            <ThemeToggle role="menuitem" />
          </li>
          <li role="none">
            <Link
              href="/auth/login"
              className="btn btn--primary btn--sm"
              role="menuitem"
              onClick={handleLinkClick}
            >
              Sign In
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
