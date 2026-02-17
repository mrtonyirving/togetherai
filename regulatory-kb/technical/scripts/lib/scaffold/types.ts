export interface ConceptEntry {
  name: string;
  file: string;
  subconcepts: SubconceptEntry[];
}

export interface SubconceptEntry {
  name: string;
  file: string;
}

export interface ProvisionNode {
  level: number;
  name: string;
  children: ProvisionNode[];
}

export interface LawEntry {
  name: string;
  provisions: ProvisionNode[];
}

export interface JurisdictionEntry {
  name: string;
  laws: LawEntry[];
}

export interface EnforcementActionEntry {
  name: string;
  file: string;
}

export const DECISION_TYPES = [
  'fine',
  'warning',
  'warning_with_fine',
  'revocation',
  'remark',
  'injunction'
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];
