import { Compound, StackAlert } from "./types";

// Dangerous interaction rules
const CLASH_RULES: {
  pattern: [string | RegExp, string | RegExp];
  message: string;
  severity: "critical" | "warning";
}[] = [
  {
    pattern: [/MAOI/i, /Dopaminergic/i],
    message:
      "CRITICAL: MAOI + Dopaminergic compound — risk of hypertensive crisis, serotonin syndrome, and death.",
    severity: "critical",
  },
  {
    pattern: [/MAOI/i, /Serotonin/i],
    message:
      "CRITICAL: MAOI + Serotonergic compound — severe serotonin syndrome risk.",
    severity: "critical",
  },
  {
    pattern: [/MAOI/i, /SSRI/i],
    message:
      "CRITICAL: MAOI + SSRI combination is potentially fatal — serotonin syndrome.",
    severity: "critical",
  },
  {
    pattern: [/MAOI/i, /Tyramine|Tyrosine|L-DOPA|Mucuna/i],
    message:
      "CRITICAL: MAOI interaction with tyramine/dopamine precursor — hypertensive crisis risk.",
    severity: "critical",
  },
  {
    pattern: [/Serotonin Syndrome/i, /SSRI|SNRI|5-HTP|Tryptophan/i],
    message:
      "SEVERE: Serotonin syndrome risk — do not combine serotonergic compounds.",
    severity: "critical",
  },
  {
    pattern: [/5-HTP/i, /SSRI|SNRI|MAOI|Tramadol/i],
    message:
      "SEVERE: 5-HTP with serotonergic drugs — serotonin syndrome risk.",
    severity: "critical",
  },
  {
    pattern: [/GABAergic/i, /GABAergic/i],
    message:
      "WARNING: Stacking multiple GABAergic compounds increases CNS depression and respiratory risk.",
    severity: "critical",
  },
  {
    pattern: [/Phenibut/i, /Alcohol|Benzodiazepine|GABAergic|Pregabalin/i],
    message:
      "CRITICAL: Phenibut with other CNS depressants — respiratory depression and death risk.",
    severity: "critical",
  },
  {
    pattern: [/Methylene Blue/i, /SSRI|SNRI|MAOI|Serotonin/i],
    message:
      "CRITICAL: Methylene Blue is an MAO inhibitor — serotonin syndrome with serotonergic drugs.",
    severity: "critical",
  },
  {
    pattern: [/anticoagulant/i, /anticoagulant|bleeding/i],
    message:
      "WARNING: Multiple compounds with anticoagulant effects — increased bleeding risk.",
    severity: "warning",
  },
  {
    pattern: [/Metformin/i, /Berberine/i],
    message:
      "WARNING: Metformin + Berberine — additive hypoglycemia risk. Monitor blood sugar closely.",
    severity: "warning",
  },
  {
    pattern: [/thyroid/i, /thyroid/i],
    message:
      "WARNING: Multiple thyroid-active compounds — risk of thyroid overstimulation.",
    severity: "warning",
  },
  {
    pattern: [/Cancer|tumor|malignancy/i, /Growth Hormone|IGF|telomerase/i],
    message:
      "WARNING: Growth-promoting compounds may be contraindicated with cancer history.",
    severity: "warning",
  },
  {
    pattern: [/Dopaminergic|L-DOPA|Mucuna/i, /Dopaminergic|L-DOPA|Mucuna/i],
    message:
      "WARNING: Stacking dopaminergic compounds — risk of dopamine dysregulation, psychosis at high doses.",
    severity: "warning",
  },
];

function matchesPattern(text: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(text);
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

function getCompoundFingerprint(compound: Compound): string {
  return `${compound.compoundName} ${compound.category} ${compound.contraindications}`;
}

export function analyzeStack(compounds: Compound[]): StackAlert[] {
  const alerts: StackAlert[] = [];

  if (compounds.length < 2) return alerts;

  // Check for clashes
  for (let i = 0; i < compounds.length; i++) {
    for (let j = i + 1; j < compounds.length; j++) {
      const a = compounds[i];
      const b = compounds[j];
      const fingerprintA = getCompoundFingerprint(a);
      const fingerprintB = getCompoundFingerprint(b);

      for (const rule of CLASH_RULES) {
        const [p1, p2] = rule.pattern;
        const forwardMatch =
          matchesPattern(fingerprintA, p1) &&
          matchesPattern(fingerprintB, p2);
        const reverseMatch =
          matchesPattern(fingerprintA, p2) &&
          matchesPattern(fingerprintB, p1);

        if (forwardMatch || reverseMatch) {
          // Avoid duplicate alerts for same pair
          const existingAlert = alerts.find(
            (alert) =>
              alert.type === "clash" &&
              ((alert.compounds[0] === a.compoundName &&
                alert.compounds[1] === b.compoundName) ||
                (alert.compounds[0] === b.compoundName &&
                  alert.compounds[1] === a.compoundName)) &&
              alert.message === rule.message
          );

          if (!existingAlert) {
            alerts.push({
              type: "clash",
              severity: rule.severity,
              compounds: [a.compoundName, b.compoundName],
              message: rule.message,
            });
          }
        }
      }

      // Check for synergies
      const aSynergizesWithB = a.knownSynergies.some(
        (s) =>
          b.compoundName.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes(b.compoundName.toLowerCase())
      );
      const bSynergizesWithA = b.knownSynergies.some(
        (s) =>
          a.compoundName.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes(a.compoundName.toLowerCase())
      );

      if (aSynergizesWithB || bSynergizesWithA) {
        alerts.push({
          type: "synergy",
          severity: "info",
          compounds: [a.compoundName, b.compoundName],
          message: `Synergy detected: ${a.compoundName} and ${b.compoundName} appear in each other's known synergies.`,
        });
      }
    }
  }

  // Sort: critical clashes first, then warnings, then synergies
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}
