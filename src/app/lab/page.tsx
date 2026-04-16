"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ─── Storage keys ───────────────────────────────────────────────────
const INVENTORY_KEY = "biohacker-os:inventory";
const CALC_KEY = "biohacker-os:recon-calc";

// ─── Types ──────────────────────────────────────────────────────────
interface DoseLog {
  timestamp: number;
  amount: number;
}

interface InventoryAsset {
  id: string;
  name: string;
  unit: "mg" | "mcg" | "pills" | "mL";
  totalQuantity: number;
  currentStock: number;
  lastDose: number; // default dose amount for quick-log
  history: DoseLog[];
}

interface CalcState {
  vialMg: string; // stored as strings so fields can be empty
  waterMl: string;
  syringeMl: string; // "0.3" | "0.5" | "1.0"
}

const DEFAULT_CALC: CalcState = {
  vialMg: "5",
  waterMl: "2",
  syringeMl: "1.0",
};

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
    // ignore quota / private mode
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

  // U-100 insulin syringes: 1 unit = 0.01 mL regardless of barrel size
  const unitsPerMl = 100;
  const totalUnitsInSyringe = syringeMl * unitsPerMl;
  const totalMcg = vialMg * 1000;
  const concentrationMcgPerMl = waterMl > 0 ? totalMcg / waterMl : 0;
  const mcgPerUnit = concentrationMcgPerMl / unitsPerMl;
  const mcgPerFullSyringe = concentrationMcgPerMl * syringeMl;

  const valid = vialMg > 0 && waterMl > 0;

  return (
    <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-sky-400">
          Reconstitution Calculator
        </span>
        <span className="text-[10px] font-mono text-[#444] ml-auto">U-100 syringe math</span>
      </div>

      <div className="grid md:grid-cols-2 gap-0">
        {/* ── Inputs ── */}
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

        {/* ── Output ── */}
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
                <ReadoutCell
                  label="Concentration"
                  value={`${fmt(concentrationMcgPerMl, 1)} mcg/mL`}
                />
                <ReadoutCell
                  label="Full syringe"
                  value={`${fmt(mcgPerFullSyringe, 1)} mcg`}
                />
                <ReadoutCell
                  label="Units in syringe"
                  value={`${fmt(totalUnitsInSyringe, 0)} u`}
                />
                <ReadoutCell
                  label="Total vial mcg"
                  value={`${fmt(totalMcg, 0)} mcg`}
                />
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
      <div className="text-[9px] font-mono uppercase tracking-widest text-[#555]">
        {label}
      </div>
      <div className="text-xs font-mono text-[#ccc] tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ─── Inventory Tracker ──────────────────────────────────────────────
function InventoryTracker() {
  const [inventory, setInventory] = useState<InventoryAsset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Add-asset form state
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

  const logDose = useCallback((id: string, amount: number) => {
    if (amount <= 0) return;
    setInventory((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              currentStock: Math.max(0, a.currentStock - amount),
              lastDose: amount,
              history: [
                { timestamp: Date.now(), amount },
                ...a.history.slice(0, 49),
              ],
            }
          : a
      )
    );
  }, []);

  const resetStock = useCallback((id: string) => {
    setInventory((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, currentStock: a.totalQuantity, history: [] } : a
      )
    );
  }, []);

  const removeAsset = useCallback((id: string) => {
    setInventory((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <section className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400">
          Inventory Tracker
        </span>
        <span className="text-[10px] font-mono text-[#444] ml-auto">
          {inventory.length} asset{inventory.length === 1 ? "" : "s"} · saved locally
        </span>
      </div>

      {/* Add-asset form */}
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

      {/* Inventory grid */}
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
  onReset,
  onRemove,
}: {
  asset: InventoryAsset;
  onLog: (amount: number) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const [doseInput, setDoseInput] = useState<string>(
    asset.lastDose > 0 ? String(asset.lastDose) : ""
  );

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
    if (d > 0) onLog(d);
  };

  return (
    <div
      className={`bg-[#111] border rounded-lg p-3 transition-all ${
        empty
          ? "border-red-500/40"
          : lowStock
          ? "border-amber-500/40"
          : "border-[#222]"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#e8e8e8] truncate">
            {asset.name}
          </h3>
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

      {/* Progress bar */}
      <div className="h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-300 ${
            empty
              ? "bg-red-500/60"
              : lowStock
              ? "bg-amber-500/70"
              : "bg-sky-500/70"
          }`}
          style={{ width: `${pctRemaining}%` }}
        />
      </div>

      {/* Dose input + log button */}
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

      {/* Stats row */}
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

      {/* Last dose timestamp */}
      {asset.history.length > 0 && (
        <div className="mt-1 text-[9px] font-mono text-[#444] text-right">
          last: {new Date(asset.history[0].timestamp).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })} · {fmt(asset.history[0].amount, 2)} {asset.unit}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────
export default function LabPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
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
                  RECONSTITUTION · INVENTORY
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

      {/* Content */}
      <main className="flex-1 max-w-[1200px] mx-auto px-4 py-6 w-full space-y-5">
        <ReconstitutionCalculator />
        <InventoryTracker />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1a1a1a] bg-[#0a0a0a] mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] font-mono text-[#666] tracking-wide text-center sm:text-left">
            Lab Tools — calculations are informational only. Verify independently before injection.
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
