"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ─── Storage keys ───────────────────────────────────────────────────
const INVENTORY_KEY = "biohacker-os:inventory";
const CALC_KEY = "biohacker-os:recon-calc";
const JOURNAL_KEY = "biohacker-os:journal";
const STACK_KEY = "biohacker-os:stack";

// ─── Types ──────────────────────────────────────────────────────────
type DoseRating = "better" | "same" | "worse" | "sideEffect";

interface DoseLog {
  timestamp: number;
  amount: number;
  rating?: DoseRating;
}

interface InventoryAsset {
  id: string;
  name: string;
  unit: "mg" | "mcg" | "pills" | "mL";
  totalQuantity: number;
  currentStock: number;
  lastDose: number;
  history: DoseLog[];
}

interface CalcState {
  vialMg: string;
  waterMl: string;
  syringeMl: string;
}

type Metric = "sleep" | "energy" | "mood" | "anxiety" | "pain" | "focus";

interface JournalEntry {
  date: string; // YYYY-MM-DD
  sleep: number;
  energy: number;
  mood: number;
  anxiety: number;
  pain: number;
  focus: number;
  note: string;
  compoundsLoggedToday: string[];
  stackSnapshot: string[];
  updatedAt: number;
}

const DEFAULT_CALC: CalcState = { vialMg: "5", waterMl: "2", syringeMl: "1.0" };

const METRIC_LABELS: Record<Metric, string> = {
  sleep: "Sleep",
  energy: "Energy",
  mood: "Mood",
  anxiety: "Anxiety",
  pain: "Pain",
  focus: "Focus",
};

// For anxiety + pain, higher = worse. Used for color cues only.
const INVERSE_METRICS: Set<Metric> = new Set(["anxiety", "pain"]);

type TabKey = "calc" | "inventory" | "journal";

// ─── Icons ──────────────────────────────────────────────────────────
function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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
function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3" />
    </svg>
  );
}
function FlaskIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M10 3v6.5L4.5 18a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9.5V3" />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────
function parseNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function makeId() {
  return `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.01) return n.toExponential(2);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKeyToHuman(k: string): string {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Build last N day keys, ending today
function lastNDateKeys(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}

// ─── Reconstitution Calculator ──────────────────────────────────────
function ReconstitutionCalculator() {
  const [calc, setCalc] = useState<CalcState>(DEFAULT_CALC);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCalc(readLS<CalcState>(CALC_KEY, DEFAULT_CALC));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeLS(CALC_KEY, calc);
  }, [calc, hydrated]);

  const vialMg = parseNum(calc.vialMg);
  const waterMl = parseNum(calc.waterMl);
  const syringeMl = parseNum(calc.syringeMl) || 1.0;

  const unitsPerMl = 100;
  const totalUnitsInSyringe = syringeMl * unitsPerMl;
  const totalMcg = vialMg * 1000;
  const concentrationMcgPerMl = waterMl > 0 ? totalMcg / waterMl : 0;
  const mcgPerUnit = concentrationMcgPerMl / unitsPerMl;
  const mcgPerFullSyringe = concentrationMcgPerMl * syringeMl;

  const valid = vialMg > 0 && waterMl > 0;

  return (
    <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-sky-400">
          Reconstitution Calculator
        </span>
        <span className="text-[10px] font-mono text-[#444] ml-auto">U-100 syringe math</span>
      </div>

      <div className="grid md:grid-cols-2 gap-0">
        <div className="p-5 border-b md:border-b-0 md:border-r border-[#1a1a1a]">
          <div className="space-y-4">
            <NumberField
              label="Vial Quantity"
              suffix="mg"
              value={calc.vialMg}
              onChange={(v) => setCalc({ ...calc, vialMg: v })}
              placeholder="5"
              hint="Peptide mass per vial (pre-reconstitution)"
            />
            <NumberField
              label="Bacteriostatic Water Added"
              suffix="mL"
              value={calc.waterMl}
              onChange={(v) => setCalc({ ...calc, waterMl: v })}
              placeholder="2"
              hint="BAC water drawn into the vial"
            />
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-[#666] mb-1.5">
                Syringe Size
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { v: "0.3", label: "0.3 mL / 30u" },
                  { v: "0.5", label: "0.5 mL / 50u" },
                  { v: "1.0", label: "1.0 mL / 100u" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setCalc({ ...calc, syringeMl: opt.v })}
                    className={`px-2 py-2 text-[11px] font-mono rounded-md border transition-all cursor-pointer ${
                      calc.syringeMl === opt.v
                        ? "bg-sky-500/15 border-sky-500/50 text-sky-400"
                        : "bg-[#111] border-[#222] text-[#888] hover:border-[#444]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-[#555] font-mono">
                All U-100 insulin syringes · 1 unit = 0.01 mL
              </p>
            </div>
          </div>
        </div>

        <div className="relative p-5 flex flex-col items-center justify-center bg-grid-fade">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#666] mb-2">
            mcg per unit tick
          </div>

          {valid ? (
            <>
              <div className="text-6xl sm:text-7xl font-mono font-bold text-glow-blue leading-none tabular-nums">
                {fmt(mcgPerUnit, 2)}
              </div>
              <div className="mt-1 text-xs font-mono text-[#666]">mcg</div>

              <div className="mt-5 w-full grid grid-cols-2 gap-2">
                <ReadoutCell label="Concentration" value={`${fmt(concentrationMcgPerMl, 1)} mcg/mL`} />
                <ReadoutCell label="Full syringe" value={`${fmt(mcgPerFullSyringe, 1)} mcg`} />
                <ReadoutCell label="Units in syringe" value={`${fmt(totalUnitsInSyringe, 0)} u`} />
                <ReadoutCell label="Total vial mcg" value={`${fmt(totalMcg, 0)} mcg`} />
              </div>
            </>
          ) : (
            <div className="text-xs font-mono text-[#555] text-center py-10">
              Enter vial mass and BAC water volume to calculate dose-per-tick.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-[#666] mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          inputMode="decimal"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={placeholder}
          className="w-full pl-3 pr-12 py-2.5 bg-[#111] border border-[#222] rounded-md text-sm text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all"
        />
        {suffix && (
          <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-[10px] font-mono text-[#555] uppercase tracking-wider pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-[#555] font-mono">{hint}</p>}
    </div>
  );
}

function ReadoutCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
      <div className="text-[9px] font-mono uppercase tracking-widest text-[#555]">{label}</div>
      <div className="text-xs font-mono text-[#ccc] tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ─── Inventory Tracker ──────────────────────────────────────────────
function InventoryTracker() {
  const [inventory, setInventory] = useState<InventoryAsset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<InventoryAsset["unit"]>("mg");
  const [newTotal, setNewTotal] = useState("");
  const [newDose, setNewDose] = useState("");

  useEffect(() => {
    setInventory(readLS<InventoryAsset[]>(INVENTORY_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeLS(INVENTORY_KEY, inventory);
  }, [inventory, hydrated]);

  const addAsset = useCallback(() => {
    const name = newName.trim();
    const total = parseNum(newTotal);
    const lastDose = parseNum(newDose);
    if (!name || total <= 0) return;

    const asset: InventoryAsset = {
      id: makeId(),
      name,
      unit: newUnit,
      totalQuantity: total,
      currentStock: total,
      lastDose: lastDose > 0 ? lastDose : 0,
      history: [],
    };
    setInventory((prev) => [asset, ...prev]);
    setNewName("");
    setNewTotal("");
    setNewDose("");
  }, [newName, newUnit, newTotal, newDose]);

  const logDose = useCallback((id: string, amount: number): number | null => {
    if (amount <= 0) return null;
    const ts = Date.now();
    setInventory((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              currentStock: Math.max(0, a.currentStock - amount),
              lastDose: amount,
              history: [{ timestamp: ts, amount }, ...a.history.slice(0, 49)],
            }
          : a
      )
    );
    return ts;
  }, []);

  const rateDose = useCallback((id: string, timestamp: number, rating: DoseRating) => {
    setInventory((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              history: a.history.map((h) =>
                h.timestamp === timestamp ? { ...h, rating } : h
              ),
            }
          : a
      )
    );
  }, []);

  const resetStock = useCallback((id: string) => {
    setInventory((prev) =>
      prev.map((a) => (a.id === id ? { ...a, currentStock: a.totalQuantity, history: [] } : a))
    );
  }, []);

  const removeAsset = useCallback((id: string) => {
    setInventory((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400">
          Inventory Tracker
        </span>
        <span className="text-[10px] font-mono text-[#444] ml-auto">
          {inventory.length} asset{inventory.length === 1 ? "" : "s"} · saved locally
        </span>
      </div>

      <div className="p-4 border-b border-[#1a1a1a] bg-[#0b0b0b]">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#555] mb-2">
          Add Asset
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Compound (e.g., BPC-157)"
            className="md:col-span-4 px-3 py-2 bg-[#111] border border-[#222] rounded-md text-xs text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all"
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value as InventoryAsset["unit"])}
            className="md:col-span-2 px-3 py-2 bg-[#111] border border-[#222] rounded-md text-xs text-[#e8e8e8] font-mono focus:outline-none focus:border-sky-500/50 transition-all cursor-pointer"
          >
            <option value="mg">mg</option>
            <option value="mcg">mcg</option>
            <option value="pills">pills</option>
            <option value="mL">mL</option>
          </select>
          <input
            inputMode="decimal"
            type="text"
            value={newTotal}
            onChange={(e) => setNewTotal(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Total qty"
            className="md:col-span-2 px-3 py-2 bg-[#111] border border-[#222] rounded-md text-xs text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 transition-all"
          />
          <input
            inputMode="decimal"
            type="text"
            value={newDose}
            onChange={(e) => setNewDose(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Default dose"
            className="md:col-span-2 px-3 py-2 bg-[#111] border border-[#222] rounded-md text-xs text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 transition-all"
          />
          <button
            type="button"
            onClick={addAsset}
            disabled={!newName.trim() || parseNum(newTotal) <= 0}
            className="md:col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 hover:border-sky-500 text-sky-400 text-xs font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-sky-500/15 disabled:hover:border-sky-500/40"
          >
            <PlusIcon /> Add
          </button>
        </div>
      </div>

      <div className="p-4">
        {inventory.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xs font-mono text-[#555]">
              No assets tracked. Add a compound above to start logging doses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {inventory.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onLog={(amt) => logDose(asset.id, amt)}
                onRate={(ts, r) => rateDose(asset.id, ts, r)}
                onReset={() => resetStock(asset.id)}
                onRemove={() => removeAsset(asset.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AssetCard({
  asset,
  onLog,
  onRate,
  onReset,
  onRemove,
}: {
  asset: InventoryAsset;
  onLog: (amount: number) => number | null;
  onRate: (timestamp: number, rating: DoseRating) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const [doseInput, setDoseInput] = useState<string>(
    asset.lastDose > 0 ? String(asset.lastDose) : ""
  );
  const [pendingTs, setPendingTs] = useState<number | null>(null);

  const pctRemaining = useMemo(() => {
    if (asset.totalQuantity <= 0) return 0;
    return Math.min(100, (asset.currentStock / asset.totalQuantity) * 100);
  }, [asset.currentStock, asset.totalQuantity]);

  const dosesRemaining = useMemo(() => {
    const d = parseNum(doseInput);
    if (d <= 0 || asset.currentStock <= 0) return null;
    return Math.floor(asset.currentStock / d);
  }, [doseInput, asset.currentStock]);

  const lowStock = pctRemaining < 20;
  const empty = asset.currentStock <= 0;

  const handleLog = () => {
    const d = parseNum(doseInput);
    if (d <= 0) return;
    const ts = onLog(d);
    if (ts !== null) setPendingTs(ts);
  };

  const handleRate = (r: DoseRating) => {
    if (pendingTs == null) return;
    onRate(pendingTs, r);
    setPendingTs(null);
  };

  return (
    <div
      className={`bg-[#111] border rounded-lg p-3 transition-all ${
        empty ? "border-red-500/40" : lowStock ? "border-amber-500/40" : "border-[#222]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#e8e8e8] truncate">{asset.name}</h3>
          <p className="text-[10px] font-mono text-[#666] tabular-nums">
            {fmt(asset.currentStock, 2)} / {fmt(asset.totalQuantity, 2)} {asset.unit}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          title="Remove asset"
          className="p-1 text-[#444] hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-300 ${
            empty ? "bg-red-500/60" : lowStock ? "bg-amber-500/70" : "bg-sky-500/70"
          }`}
          style={{ width: `${pctRemaining}%` }}
        />
      </div>

      <div className="flex items-stretch gap-1.5">
        <div className="relative flex-1">
          <input
            inputMode="decimal"
            type="text"
            value={doseInput}
            onChange={(e) => setDoseInput(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Dose"
            className="w-full pl-2.5 pr-10 py-1.5 bg-[#0a0a0a] border border-[#222] rounded-md text-xs text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 transition-all"
          />
          <span className="absolute inset-y-0 right-0 pr-2 flex items-center text-[9px] font-mono text-[#555] uppercase pointer-events-none">
            {asset.unit}
          </span>
        </div>
        <button
          type="button"
          onClick={handleLog}
          disabled={parseNum(doseInput) <= 0 || empty}
          className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 hover:border-sky-500 text-sky-400 text-[11px] font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-sky-500/15"
        >
          Log Dose
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Reset to full"
          className="px-2 py-1.5 border border-[#222] hover:border-[#444] text-[10px] font-mono text-[#666] hover:text-[#ccc] rounded-md transition-all cursor-pointer"
        >
          ↺
        </button>
      </div>

      {/* Post-dose rating strip */}
      {pendingTs !== null && (
        <div className="mt-2 p-2 bg-[#0a0a0a] border border-sky-500/30 rounded-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono uppercase tracking-widest text-sky-400">
              How did it feel?
            </span>
            <button
              type="button"
              onClick={() => handleRate("better")}
              className="px-2 py-1 text-[10px] font-mono rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer"
            >
              ↑ Better
            </button>
            <button
              type="button"
              onClick={() => handleRate("same")}
              className="px-2 py-1 text-[10px] font-mono rounded border border-[#333] text-[#888] hover:bg-[#1a1a1a] transition-all cursor-pointer"
            >
              · Same
            </button>
            <button
              type="button"
              onClick={() => handleRate("worse")}
              className="px-2 py-1 text-[10px] font-mono rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
            >
              ↓ Worse
            </button>
            <button
              type="button"
              onClick={() => handleRate("sideEffect")}
              className="px-2 py-1 text-[10px] font-mono rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            >
              ⚠ Side effect
            </button>
            <button
              type="button"
              onClick={() => setPendingTs(null)}
              className="ml-auto px-1.5 py-1 text-[10px] font-mono text-[#555] hover:text-[#aaa] transition-all cursor-pointer"
              title="Skip rating"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 text-[10px] font-mono">
        <span className={empty ? "text-red-400" : lowStock ? "text-amber-400" : "text-[#555]"}>
          {empty
            ? "DEPLETED"
            : lowStock
            ? `LOW · ${pctRemaining.toFixed(0)}%`
            : `${pctRemaining.toFixed(0)}% remaining`}
        </span>
        {dosesRemaining !== null && !empty && (
          <span className="text-[#666]">
            ~{dosesRemaining} dose{dosesRemaining === 1 ? "" : "s"} left
          </span>
        )}
      </div>

      {asset.history.length > 0 && (
        <div className="mt-1 text-[9px] font-mono text-[#444] text-right">
          last: {new Date(asset.history[0].timestamp).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" · "}
          {fmt(asset.history[0].amount, 2)} {asset.unit}
          {asset.history[0].rating && (
            <span
              className={`ml-1.5 ${
                asset.history[0].rating === "better"
                  ? "text-emerald-400"
                  : asset.history[0].rating === "worse"
                  ? "text-amber-400"
                  : asset.history[0].rating === "sideEffect"
                  ? "text-red-400"
                  : "text-[#777]"
              }`}
            >
              {asset.history[0].rating === "better"
                ? "↑"
                : asset.history[0].rating === "worse"
                ? "↓"
                : asset.history[0].rating === "sideEffect"
                ? "⚠"
                : "·"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Daily Journal ──────────────────────────────────────────────────
const EMPTY_JOURNAL_SHAPE = {
  sleep: 5,
  energy: 5,
  mood: 5,
  anxiety: 5,
  pain: 5,
  focus: 5,
  note: "",
};

function makeTodayEntry(existing?: JournalEntry): JournalEntry {
  const inventory = readLS<InventoryAsset[]>(INVENTORY_KEY, []);
  const stack = readLS<string[]>(STACK_KEY, []);
  const today = todayKey();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const compoundsLoggedToday = inventory
    .filter((a) => a.history.some((h) => h.timestamp >= dayStart.getTime()))
    .map((a) => a.name);

  return {
    date: today,
    ...EMPTY_JOURNAL_SHAPE,
    ...(existing ?? {}),
    compoundsLoggedToday,
    stackSnapshot: stack,
    updatedAt: Date.now(),
  };
}

function JournalSection() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<JournalEntry | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const existing = readLS<JournalEntry[]>(JOURNAL_KEY, []);
    setEntries(existing);
    const today = todayKey();
    const todayEntry = existing.find((e) => e.date === today);
    setDraft(makeTodayEntry(todayEntry));
    setHydrated(true);
  }, []);

  const saveDraft = useCallback(() => {
    if (!draft) return;
    const now = Date.now();
    const updated: JournalEntry = { ...draft, updatedAt: now };
    setEntries((prev) => {
      const next = prev.filter((e) => e.date !== updated.date);
      next.unshift(updated);
      next.sort((a, b) => (a.date < b.date ? 1 : -1));
      writeLS(JOURNAL_KEY, next);
      return next;
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }, [draft]);

  const setMetric = (m: Metric, v: number) => {
    if (!draft) return;
    setDraft({ ...draft, [m]: v });
  };

  // Build sparkline data: last 14 days per metric
  const sparkDates = useMemo(() => lastNDateKeys(14), []);
  const byDate = useMemo(() => {
    const map: Record<string, JournalEntry> = {};
    for (const e of entries) map[e.date] = e;
    return map;
  }, [entries]);

  if (!hydrated || !draft) {
    return (
      <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl p-8 text-center">
        <p className="text-xs font-mono text-[#555]">Loading journal…</p>
      </section>
    );
  }

  const todayCompounds = draft.compoundsLoggedToday;

  return (
    <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-violet-400">
          Daily Check-In
        </span>
        <span className="text-[10px] font-mono text-[#444] ml-auto">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} · saved locally
        </span>
      </div>

      {/* Today's entry */}
      <div className="p-5 border-b border-[#1a1a1a]">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#e8e8e8]">Today</h3>
            <p className="text-[10px] font-mono text-[#555] tracking-wide">
              {dateKeyToHuman(draft.date)}
            </p>
          </div>
          <button
            type="button"
            onClick={saveDraft}
            className={`px-4 py-2 text-[11px] font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer border ${
              savedFlash
                ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-400"
                : "bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 hover:border-sky-500 text-sky-400"
            }`}
          >
            {savedFlash ? "✓ Saved" : "Save Entry"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <MetricSlider
              key={m}
              label={METRIC_LABELS[m]}
              metric={m}
              value={draft[m]}
              onChange={(v) => setMetric(m, v)}
            />
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-[10px] font-mono uppercase tracking-widest text-[#666] mb-1.5">
            Note
          </label>
          <textarea
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="Anything noteworthy — side effects, context, sleep conditions, stress…"
            rows={3}
            className="w-full px-3 py-2 bg-[#111] border border-[#222] rounded-md text-xs text-[#e8e8e8] placeholder-[#333] font-mono focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all resize-none"
          />
        </div>

        {/* Today's compound snapshot */}
        {todayCompounds.length > 0 && (
          <div className="mt-4 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#555] mb-1.5">
              Logged today ({todayCompounds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {todayCompounds.map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 text-[10px] font-mono bg-sky-500/10 text-sky-400 rounded border border-sky-500/20"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trend sparklines */}
      <div className="p-5 border-b border-[#1a1a1a] bg-[#0b0b0b]">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#666] mb-3">
          14-Day Trend
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <Sparkline
              key={m}
              label={METRIC_LABELS[m]}
              inverse={INVERSE_METRICS.has(m)}
              values={sparkDates.map((d) => byDate[d]?.[m] ?? null)}
            />
          ))}
        </div>
      </div>

      {/* History */}
      <div className="p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#666] mb-3">
          Recent entries
        </div>
        {entries.length === 0 ? (
          <p className="text-xs font-mono text-[#555] py-6 text-center">
            No past entries yet. Save today to start building a trail.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 7).map((e) => (
              <EntryRow key={e.date} entry={e} />
            ))}
            {entries.length > 7 && (
              <p className="text-[10px] font-mono text-[#444] text-center pt-2">
                + {entries.length - 7} older entries stored locally
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MetricSlider({
  label,
  metric,
  value,
  onChange,
}: {
  label: string;
  metric: Metric;
  value: number;
  onChange: (v: number) => void;
}) {
  const inverse = INVERSE_METRICS.has(metric);
  // For inverse metrics, high = bad; for normal, high = good.
  // Pick a subtle color cue on the value number only.
  const valueColor = (() => {
    if (inverse) {
      if (value >= 7) return "text-red-400";
      if (value >= 4) return "text-amber-400";
      return "text-emerald-400";
    }
    if (value >= 7) return "text-emerald-400";
    if (value >= 4) return "text-amber-400";
    return "text-red-400";
  })();

  return (
    <div className="p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#888]">
          {label}
        </span>
        <span className={`text-lg font-mono font-bold tabular-nums ${valueColor}`}>{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-sky-500 cursor-pointer"
      />
      <div className="flex justify-between text-[9px] font-mono text-[#444] mt-0.5">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}

function Sparkline({
  label,
  inverse,
  values,
}: {
  label: string;
  inverse: boolean;
  values: (number | null)[];
}) {
  const width = 120;
  const height = 32;
  const pad = 2;

  // Latest available value
  const latest = [...values].reverse().find((v) => v !== null) ?? null;
  const latestColor = (() => {
    if (latest == null) return "text-[#555]";
    if (inverse) {
      if (latest >= 7) return "text-red-400";
      if (latest >= 4) return "text-amber-400";
      return "text-emerald-400";
    }
    if (latest >= 7) return "text-emerald-400";
    if (latest >= 4) return "text-amber-400";
    return "text-red-400";
  })();

  const points: string[] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const x = pad + ((width - 2 * pad) * i) / Math.max(1, values.length - 1);
    const y = height - pad - ((height - 2 * pad) * (v - 1)) / 9;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  const anyData = points.length > 0;

  return (
    <div className="p-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-[#666]">
          {label}
        </span>
        <span className={`text-[11px] font-mono font-bold tabular-nums ${latestColor}`}>
          {latest ?? "—"}
        </span>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-1"
      >
        {anyData ? (
          <>
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* last point dot */}
            {(() => {
              const last = points[points.length - 1].split(",");
              return <circle cx={last[0]} cy={last[1]} r={1.75} fill="#0ea5e9" />;
            })()}
          </>
        ) : (
          <line
            x1={pad}
            x2={width - pad}
            y1={height / 2}
            y2={height / 2}
            stroke="#222"
            strokeDasharray="2 3"
          />
        )}
      </svg>
    </div>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const metrics: Metric[] = ["sleep", "energy", "mood", "anxiety", "pain", "focus"];
  return (
    <div className="p-3 bg-[#111] border border-[#222] rounded-md">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-semibold text-[#e8e8e8]">
            {dateKeyToHuman(entry.date)}
          </span>
          <span className="ml-2 text-[10px] font-mono text-[#555]">{entry.date}</span>
        </div>
        {entry.compoundsLoggedToday.length > 0 && (
          <span className="text-[9px] font-mono text-[#666]">
            {entry.compoundsLoggedToday.length} compound
            {entry.compoundsLoggedToday.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {metrics.map((m) => {
          const v = entry[m];
          const inverse = INVERSE_METRICS.has(m);
          const cue = (() => {
            if (inverse) {
              if (v >= 7) return "text-red-400";
              if (v >= 4) return "text-amber-400";
              return "text-emerald-400";
            }
            if (v >= 7) return "text-emerald-400";
            if (v >= 4) return "text-amber-400";
            return "text-red-400";
          })();
          return (
            <div
              key={m}
              className="px-1.5 py-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded text-center"
            >
              <div className="text-[8px] font-mono uppercase tracking-widest text-[#555] truncate">
                {METRIC_LABELS[m].slice(0, 4)}
              </div>
              <div className={`text-[11px] font-mono font-bold tabular-nums ${cue}`}>{v}</div>
            </div>
          );
        })}
      </div>
      {entry.note && (
        <p className="text-[11px] text-[#aaa] leading-relaxed italic border-l-2 border-[#222] pl-2">
          {entry.note}
        </p>
      )}
      {entry.compoundsLoggedToday.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.compoundsLoggedToday.map((n) => (
            <span
              key={n}
              className="px-1.5 py-0.5 text-[9px] font-mono bg-sky-500/10 text-sky-400 rounded border border-sky-500/20"
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Navigation ─────────────────────────────────────────────────
function TabNav({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: { key: TabKey; label: string; dot: string }[] = [
    { key: "calc", label: "CALCULATOR", dot: "bg-sky-400" },
    { key: "inventory", label: "INVENTORY", dot: "bg-emerald-400" },
    { key: "journal", label: "JOURNAL", dot: "bg-violet-400" },
  ];
  return (
    <div className="flex gap-1 p-1 bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[11px] font-mono uppercase tracking-widest transition-all cursor-pointer ${
            active === t.key
              ? "bg-[#161616] text-[#e8e8e8] border border-[#2a2a2a]"
              : "text-[#666] hover:text-[#aaa] border border-transparent"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────
export default function LabPage() {
  const [tab, setTab] = useState<TabKey>("calc");

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#1a1a1a]">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <FlaskIcon />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-wide">LAB TOOLS</h1>
                <p className="text-[10px] text-[#555] font-mono tracking-widest">
                  RECONSTITUTION · INVENTORY · JOURNAL
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2a2a] hover:border-[#444] text-[#666] hover:text-[#ccc] text-xs font-mono transition-all cursor-pointer"
            >
              <BackIcon />
              <span>DATABASE</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] mx-auto px-4 py-6 w-full space-y-5">
        <TabNav active={tab} onChange={setTab} />
        {tab === "calc" && <ReconstitutionCalculator />}
        {tab === "inventory" && <InventoryTracker />}
        {tab === "journal" && <JournalSection />}
      </main>

      <footer className="border-t border-[#1a1a1a] bg-[#0a0a0a] mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] font-mono text-[#666] tracking-wide text-center sm:text-left">
            Lab Tools — calculations and ratings are personal-use notes, not medical records.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#111] hover:bg-[#161616] border border-[#2a2a2a] hover:border-sky-500/40 rounded-md text-[11px] font-mono text-[#aaa] hover:text-sky-400 transition-all duration-200 cursor-pointer"
          >
            <BackIcon /> Return to database
          </Link>
        </div>
      </footer>
    </div>
  );
}
