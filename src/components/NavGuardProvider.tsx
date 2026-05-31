"use client";

import { createContext, useContext, useRef, type MutableRefObject } from "react";

type NavGuard = { blockedRef: MutableRefObject<boolean> };

const NavGuardContext = createContext<NavGuard | null>(null);

/**
 * Lets the global nav know when a quiz is in progress, so it can warn before
 * navigating away. Wraps the whole app in the root layout.
 */
export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const blockedRef = useRef(false);
  return <NavGuardContext.Provider value={{ blockedRef }}>{children}</NavGuardContext.Provider>;
}

export function useNavGuard(): NavGuard {
  const ctx = useContext(NavGuardContext);
  if (!ctx) throw new Error("useNavGuard must be used within NavGuardProvider");
  return ctx;
}
