export type ConfidenceScore = "High" | "Medium" | "Low";

export interface Compound {
  id: string;
  compoundName: string;
  category: string;
  halfLifeHours: number;
  administrationRoute: string[];
  supportsGoals: string[];
  treatsSymptoms: string[];
  contraindications: string;
  timingRules: string;
  knownSynergies: string[];
  confidenceScore: ConfidenceScore;
  citation: string;
}

export interface StackAlert {
  type: "clash" | "synergy";
  severity: "critical" | "warning" | "info";
  compounds: [string, string];
  message: string;
}
