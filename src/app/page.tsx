"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import compounds from "../../lib/data.json";
import { Compound, StackAlert } from "@/lib/types";
import { analyzeStack } from "@/lib/safety-engine";

const allCompounds = compounds as Compound[];

// ─── LocalStorage keys ──────────────────────────────────────────────
const STACK_STORAGE_KEY = "biohacker-os:stack";
const DISCLAIMER_STORAGE_KEY = "biohacker-os:disclaimer-accepted";

// Extract unique goals and symptoms
const allGoals = Array.from(
  new Set(allCompounds.flatMap((c) => c.supportsGoals))
).sort();
const allSymptoms = Array.from(
  new Set(allCompounds.flatMap((c) => c.treatsSymptoms))
).sort();

// ─── Icons ──────────────────────────────────────────────────────────
function SearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}

function SynergyIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function XIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Category badge colors ──────────────────────────────────────────
function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    Peptide: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Nootropic": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    "Botanical": "bg-green-500/20 text-green-400 border-green-500/30",
    "Amino Acid": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "Mineral": "bg-teal-500/20 text-teal-400 border-teal-500/30",
    "Vitamin": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "Hormone": "bg-pink-500/20 text-pink-400 border-pink-500/30",
    "Alkaloid": "bg-red-500/20 text-red-400 border-red-500/30",
    "Eugeroic": "bg-sky-500/20 text-sky-400 border-sky-500/30",
  };

  for (const [key, value] of Object.entries(map)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

// ─── Filter Tag ─────────────────────────────────────────────────────
function FilterTag({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono rounded-full border transition-all duration-200 cursor-pointer ${
        active
          ? "bg-sky-500/20 text-sky-400 border-sky-500/50"
          : "bg-[#1a1a1a] text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#999]"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Compound Card ──────────────────────────────────────────────────
function CompoundCard({
  compound,
  isInStack,
  onToggleStack,
  onExpand,
}: {
  compound: Compound;
  isInStack: boolean;
  onToggleStack: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className={`group relative bg-[#161616] border rounded-lg p-4 transition-all duration-200 hover:bg-[#1a1a1a] ${
        isInStack ? "border-sky-500/50 bg-sky-500/5" : "border-[#222]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onExpand}>
          <h3 className="text-sm font-semibold text-[#e8e8e8] truncate leading-tight">
            {compound.compoundName}
          </h3>
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-mono rounded border ${getCategoryColor(
              compound.category
            )}`}
          >
            {compound.category}
          </span>
        </div>
        <button
          onClick={onToggleStack}
          className={`ml-2 p-1.5 rounded-md border transition-all duration-200 flex-shrink-0 cursor-pointer ${
            isInStack
              ? "bg-sky-500/20 border-sky-500/50 text-sky-400"
              : "border-[#333] text-[#555] hover:border-[#555] hover:text-[#999]"
          }`}
          title={isInStack ? "Remove from stack" : "Add to stack"}
        >
          {isInStack ? <CheckIcon /> : <PlusIcon />}
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="text-[10px] text-[#555]">
          <span className="text-[#777]">t½</span>{" "}
          <span className="text-[#bbb] font-mono">{compound.halfLifeHours}h</span>
        </div>
        <div className="text-[10px] text-[#555]">
          <span className="text-[#777]">Route</span>{" "}
          <span className="text-[#bbb] font-mono">{compound.administrationRoute[0]}</span>
        </div>
      </div>

      {/* Goals */}
      <div className="flex flex-wrap gap-1 mb-2">
        {compound.supportsGoals.slice(0, 3).map((goal) => (
          <span
            key={goal}
            className="px-1.5 py-0.5 text-[9px] font-mono bg-[#1a1a1a] text-[#888] rounded border border-[#2a2a2a]"
          >
            {goal}
          </span>
        ))}
        {compound.supportsGoals.length > 3 && (
          <span className="px-1.5 py-0.5 text-[9px] font-mono text-[#555]">
            +{compound.supportsGoals.length - 3}
          </span>
        )}
      </div>

      {/* Expand indicator */}
      <button
        onClick={onExpand}
        className="text-[10px] text-[#555] hover:text-sky-400 transition-colors cursor-pointer font-mono"
      >
        Details →
      </button>
    </div>
  );
}

// ─── Compound Detail Modal ──────────────────────────────────────────
function CompoundModal({
  compound,
  onClose,
}: {
  compound: Compound;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative bg-[#111] border border-[#2a2a2a] rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[#555] hover:text-white transition-colors cursor-pointer"
        >
          <XIcon className="w-5 h-5" />
        </button>

        {/* Header */}
        <h2 className="text-xl font-bold mb-1">{compound.compoundName}</h2>
        <span
          className={`inline-block px-2.5 py-1 text-xs font-mono rounded border ${getCategoryColor(
            compound.category
          )}`}
        >
          {compound.category}
        </span>

        {/* Stats row */}
        <div className="flex gap-6 mt-4 mb-6 pb-4 border-b border-[#222]">
          <div>
            <div className="text-[10px] text-[#555] uppercase tracking-widest">Half-Life</div>
            <div className="text-lg font-mono text-sky-400">{compound.halfLifeHours}h</div>
          </div>
          <div>
            <div className="text-[10px] text-[#555] uppercase tracking-widest">Routes</div>
            <div className="text-sm text-[#ccc] font-mono">
              {compound.administrationRoute.join(" · ")}
            </div>
          </div>
        </div>

        {/* Supports Goals */}
        <div className="mb-4">
          <h4 className="text-[10px] text-[#555] uppercase tracking-widest mb-2">
            Supports Goals
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {compound.supportsGoals.map((g) => (
              <span
                key={g}
                className="px-2 py-1 text-xs font-mono bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20"
              >
                {g}
              </span>
            ))}
          </div>
        </div>

        {/* Treats Symptoms */}
        <div className="mb-4">
          <h4 className="text-[10px] text-[#555] uppercase tracking-widest mb-2">
            Treats Symptoms
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {compound.treatsSymptoms.map((s) => (
              <span
                key={s}
                className="px-2 py-1 text-xs font-mono bg-amber-500/10 text-amber-400 rounded border border-amber-500/20"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Contraindications */}
        <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
          <h4 className="text-[10px] text-red-400 uppercase tracking-widest mb-1">
            Contraindications
          </h4>
          <p className="text-sm text-[#ccc] leading-relaxed">
            {compound.contraindications}
          </p>
        </div>

        {/* Timing */}
        <div className="mb-4 p-3 bg-sky-500/5 border border-sky-500/20 rounded-lg">
          <h4 className="text-[10px] text-sky-400 uppercase tracking-widest mb-1">
            Timing Rules
          </h4>
          <p className="text-sm text-[#ccc] leading-relaxed">
            {compound.timingRules}
          </p>
        </div>

        {/* Synergies */}
        <div>
          <h4 className="text-[10px] text-[#555] uppercase tracking-widest mb-2">
            Known Synergies
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {compound.knownSynergies.map((s) => (
              <span
                key={s}
                className="px-2 py-1 text-xs font-mono bg-sky-500/10 text-sky-400 rounded border border-sky-500/20"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stack Alert Banner ─────────────────────────────────────────────
function AlertBanner({ alert }: { alert: StackAlert }) {
  if (alert.type === "clash") {
    return (
      <div
        className={`p-3 rounded-lg border ${
          alert.severity === "critical"
            ? "bg-red-500/10 border-red-500/40 animate-pulse-red"
            : "bg-amber-500/10 border-amber-500/40"
        }`}
      >
        <div className="flex items-start gap-2">
          <AlertIcon />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-mono font-bold uppercase ${
                alert.severity === "critical" ? "text-red-400" : "text-amber-400"
              }`}>
                {alert.severity === "critical" ? "CRITICAL CLASH" : "WARNING"}
              </span>
            </div>
            <p className="text-xs text-[#ccc] leading-relaxed">{alert.message}</p>
            <p className="text-[10px] text-[#777] mt-1 font-mono">
              {alert.compounds[0]} ↔ {alert.compounds[1]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border bg-sky-500/10 border-sky-500/40 animate-pulse-blue">
      <div className="flex items-start gap-2">
        <SynergyIcon />
        <div>
          <span className="text-xs font-mono font-bold uppercase text-sky-400">
            SYNERGY DETECTED
          </span>
          <p className="text-xs text-[#ccc] leading-relaxed mt-1">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Medical Disclaimer Modal ───────────────────────────────────────
function DisclaimerModal({ onAgree }: { onAgree: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      <div className="relative bg-[#0d0d0d] border border-red-500/40 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 glow-red-subtle">
        {/* Scanline header bar */}
        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-red-500/20">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-red-400">
            Operator Acknowledgment Required
          </span>
        </div>

        <h2
          id="disclaimer-title"
          className="text-xl sm:text-2xl font-bold tracking-tight text-[#e8e8e8] mb-1"
        >
          Informational Use Only
        </h2>
        <p className="text-[11px] font-mono uppercase tracking-widest text-[#666] mb-5">
          BIOHACKER OS · Stack Safety Engine
        </p>

        <div className="space-y-3 text-sm text-[#bbb] leading-relaxed">
          <p>
            Biohacker OS is a research and reference tool. The compound data,
            interaction flags, synergies, and stack analyses shown here are{" "}
            <span className="text-[#e8e8e8] font-semibold">
              for informational purposes only
            </span>{" "}
            and do not constitute medical advice, diagnosis, or treatment.
          </p>

          <p>
            Nothing on this site establishes a doctor-patient relationship.
            Compounds listed are not evaluated by the FDA, and many are
            research chemicals, investigational, or restricted to specific
            jurisdictions. Use, acquisition, and dosing are your responsibility.
          </p>

          <p>
            Clash detection is rule-based and{" "}
            <span className="text-red-400 font-semibold">
              not exhaustive
            </span>
            . The absence of an alert does not mean a combination is safe.
            Individual pharmacogenetics, existing conditions, and co-administered
            medications will affect outcomes in ways this engine cannot model.
          </p>

          <p className="text-[#888] text-xs italic pt-1">
            By clicking &ldquo;I Agree&rdquo; you confirm you understand these
            terms and accept full responsibility for any decisions made using
            this tool.
          </p>
        </div>

        <div className="mt-6 pt-5 border-t border-[#222] flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onAgree}
            className="px-6 py-3 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/50 hover:border-sky-500 text-sky-400 text-sm font-mono font-semibold uppercase tracking-widest rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          >
            I Agree — Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function Home() {
  const [search, setSearch] = useState("");
  const [activeGoals, setActiveGoals] = useState<Set<string>>(new Set());
  const [activeSymptoms, setActiveSymptoms] = useState<Set<string>>(new Set());
  const [stack, setStack] = useState<Set<string>>(new Set());
  const [expandedCompound, setExpandedCompound] = useState<Compound | null>(null);
  const [showStackPanel, setShowStackPanel] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showSymptoms, setShowSymptoms] = useState(false);

  // Hydration + disclaimer state (client-only to avoid SSR mismatch)
  const [hydrated, setHydrated] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // ─── Hydrate from localStorage on mount ───────────────────────────
  useEffect(() => {
    try {
      // Restore active stack
      const raw = window.localStorage.getItem(STACK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Only keep ids that still exist in the dataset
          const validIds = new Set(allCompounds.map((c) => c.id));
          const restored = parsed.filter(
            (id): id is string => typeof id === "string" && validIds.has(id)
          );
          if (restored.length > 0) setStack(new Set(restored));
        }
      }

      // Disclaimer gate
      const agreed = window.localStorage.getItem(DISCLAIMER_STORAGE_KEY);
      if (agreed !== "true") setShowDisclaimer(true);
    } catch {
      // localStorage unavailable (private mode, disabled, etc.) — fail open
      setShowDisclaimer(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  // ─── Persist stack to localStorage on change ──────────────────────
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STACK_STORAGE_KEY,
        JSON.stringify(Array.from(stack))
      );
    } catch {
      // Ignore write failures (quota, private mode)
    }
  }, [stack, hydrated]);

  const acceptDisclaimer = useCallback(() => {
    try {
      window.localStorage.setItem(DISCLAIMER_STORAGE_KEY, "true");
    } catch {
      // Ignore — still dismiss for this session
    }
    setShowDisclaimer(false);
  }, []);

  // Filter compounds
  const filtered = useMemo(() => {
    return allCompounds.filter((c) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          c.compoundName.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.supportsGoals.some((g) => g.toLowerCase().includes(q)) ||
          c.treatsSymptoms.some((s) => s.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // Goal filter
      if (activeGoals.size > 0) {
        const matchesGoal = c.supportsGoals.some((g) => activeGoals.has(g));
        if (!matchesGoal) return false;
      }

      // Symptom filter
      if (activeSymptoms.size > 0) {
        const matchesSymptom = c.treatsSymptoms.some((s) =>
          activeSymptoms.has(s)
        );
        if (!matchesSymptom) return false;
      }

      return true;
    });
  }, [search, activeGoals, activeSymptoms]);

  // Stack compounds
  const stackCompounds = useMemo(
    () => allCompounds.filter((c) => stack.has(c.id)),
    [stack]
  );

  // Safety analysis
  const alerts = useMemo(() => analyzeStack(stackCompounds), [stackCompounds]);

  const toggleGoal = useCallback((goal: string) => {
    setActiveGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goal)) next.delete(goal);
      else next.add(goal);
      return next;
    });
  }, []);

  const toggleSymptom = useCallback((symptom: string) => {
    setActiveSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(symptom)) next.delete(symptom);
      else next.add(symptom);
      return next;
    });
  }, []);

  const toggleStack = useCallback((id: string) => {
    setStack((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const warningAlerts = alerts.filter(
    (a) => a.type === "clash" && a.severity === "warning"
  );
  const synergyAlerts = alerts.filter((a) => a.type === "synergy");

  return (
    <div className="flex flex-col min-h-screen">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#1a1a1a]">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <span className="text-sky-400 text-sm font-bold">B</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-wide">BIOHACKER OS</h1>
                <p className="text-[10px] text-[#555] font-mono tracking-widest">
                  COMPOUND DATABASE · STACK ENGINE
                </p>
              </div>
            </div>

            {/* Stack toggle */}
            <button
              onClick={() => setShowStackPanel(!showStackPanel)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                stack.size > 0
                  ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                  : "border-[#2a2a2a] text-[#666] hover:border-[#444]"
              }`}
            >
              <StackIcon />
              <span>STACK</span>
              {stack.size > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px]">
                  {stack.size}
                </span>
              )}
              {criticalAlerts.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] animate-pulse">
                  {criticalAlerts.length} !!
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* ─── Main Content ─── */}
        <main className="flex-1 max-w-[1600px] mx-auto px-4 py-6 w-full">
          {/* Search Bar */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#555]">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search compounds, categories, goals, symptoms..."
              className="w-full pl-10 pr-4 py-3 bg-[#111] border border-[#222] rounded-lg text-sm text-[#e8e8e8] placeholder-[#444] focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 font-mono transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#555] hover:text-white cursor-pointer"
              >
                <XIcon />
              </button>
            )}
          </div>

          {/* Filter Toggles */}
          <div className="mb-6 space-y-3">
            {/* Goals */}
            <div>
              <button
                onClick={() => setShowGoals(!showGoals)}
                className="text-[10px] text-[#555] uppercase tracking-widest font-mono mb-2 flex items-center gap-1 cursor-pointer hover:text-[#888] transition-colors"
              >
                Supports Goals ({activeGoals.size}/{allGoals.length})
                <span className="text-xs">{showGoals ? "▾" : "▸"}</span>
              </button>
              {showGoals && (
                <div className="flex flex-wrap gap-1.5">
                  {allGoals.map((goal) => (
                    <FilterTag
                      key={goal}
                      label={goal}
                      active={activeGoals.has(goal)}
                      onClick={() => toggleGoal(goal)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Symptoms */}
            <div>
              <button
                onClick={() => setShowSymptoms(!showSymptoms)}
                className="text-[10px] text-[#555] uppercase tracking-widest font-mono mb-2 flex items-center gap-1 cursor-pointer hover:text-[#888] transition-colors"
              >
                Treats Symptoms ({activeSymptoms.size}/{allSymptoms.length})
                <span className="text-xs">{showSymptoms ? "▾" : "▸"}</span>
              </button>
              {showSymptoms && (
                <div className="flex flex-wrap gap-1.5">
                  {allSymptoms.map((symptom) => (
                    <FilterTag
                      key={symptom}
                      label={symptom}
                      active={activeSymptoms.has(symptom)}
                      onClick={() => toggleSymptom(symptom)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Active filter summary */}
            {(activeGoals.size > 0 || activeSymptoms.size > 0) && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#555]">
                  {filtered.length} of {allCompounds.length} compounds
                </span>
                <button
                  onClick={() => {
                    setActiveGoals(new Set());
                    setActiveSymptoms(new Set());
                  }}
                  className="text-[10px] font-mono text-red-400/60 hover:text-red-400 cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* ─── Compound Grid ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((compound) => (
              <CompoundCard
                key={compound.id}
                compound={compound}
                isInStack={stack.has(compound.id)}
                onToggleStack={() => toggleStack(compound.id)}
                onExpand={() => setExpandedCompound(compound)}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-[#555] font-mono text-sm">
                No compounds match your filters.
              </p>
            </div>
          )}
        </main>

        {/* ─── Stack Panel (Slide-out) ─── */}
        {showStackPanel && (
          <aside className="w-96 border-l border-[#1a1a1a] bg-[#0d0d0d] overflow-y-auto flex-shrink-0">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                  <StackIcon /> STACK BUILDER
                </h2>
                <button
                  onClick={() => setShowStackPanel(false)}
                  className="p-1 text-[#555] hover:text-white cursor-pointer"
                >
                  <XIcon />
                </button>
              </div>

              {stack.size === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[#444] font-mono text-xs">
                    Add compounds to your stack using the + button on each card.
                  </p>
                </div>
              ) : (
                <>
                  {/* Stack items */}
                  <div className="space-y-2 mb-4">
                    {stackCompounds.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2.5 bg-[#161616] border border-[#222] rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {c.compoundName}
                          </p>
                          <p className="text-[10px] text-[#555] font-mono">
                            {c.category}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleStack(c.id)}
                          className="p-1 text-[#555] hover:text-red-400 cursor-pointer flex-shrink-0"
                        >
                          <XIcon />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] text-[#555] uppercase tracking-widest font-mono">
                        Safety Analysis ({alerts.length} findings)
                      </h3>

                      {criticalAlerts.length > 0 && (
                        <div className="space-y-2">
                          {criticalAlerts.map((alert, i) => (
                            <AlertBanner key={`critical-${i}`} alert={alert} />
                          ))}
                        </div>
                      )}

                      {warningAlerts.length > 0 && (
                        <div className="space-y-2">
                          {warningAlerts.map((alert, i) => (
                            <AlertBanner key={`warning-${i}`} alert={alert} />
                          ))}
                        </div>
                      )}

                      {synergyAlerts.length > 0 && (
                        <div className="space-y-2">
                          {synergyAlerts.map((alert, i) => (
                            <AlertBanner key={`synergy-${i}`} alert={alert} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {alerts.length === 0 && stack.size >= 2 && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                      <p className="text-xs text-emerald-400 font-mono">
                        No known interactions detected in this stack.
                      </p>
                    </div>
                  )}

                  {/* Clear stack */}
                  <button
                    onClick={() => setStack(new Set())}
                    className="mt-4 w-full py-2 text-xs font-mono text-red-400/60 hover:text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/5 transition-all cursor-pointer"
                  >
                    CLEAR STACK
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ─── Detail Modal ─── */}
      {expandedCompound && (
        <CompoundModal
          compound={expandedCompound}
          onClose={() => setExpandedCompound(null)}
        />
      )}

      {/* ─── First-visit Medical Disclaimer ─── */}
      {hydrated && showDisclaimer && (
        <DisclaimerModal onAgree={acceptDisclaimer} />
      )}
    </div>
  );
}
