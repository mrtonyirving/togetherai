import { repoPath } from '../io.js';

export function indexConceptsPath(): string {
  return repoPath('library', 'taxonomy', 'index_concepts.md');
}

export function indexJurisdictionPath(): string {
  return repoPath('library', 'taxonomy', 'index_jurisdiction.md');
}

export function indexEnforcementActionsPath(): string {
  return repoPath('library', 'taxonomy', 'index_enforcement_actions.md');
}

export function conceptFileRef(conceptSlug: string): string {
  return `AML/concepts/${conceptSlug}/${conceptSlug}.md`;
}

export function subconceptFileRef(
  parentConceptSlug: string,
  subconceptSlug: string
): string {
  return `AML/concepts/${parentConceptSlug}/subconcepts/${subconceptSlug}/${subconceptSlug}.md`;
}

export function jurisdictionFileRef(jurisdictionName: string): string {
  return `AML/map/${jurisdictionName}/${jurisdictionName}.md`;
}

export function lawDirectoryRef(jurisdictionName: string, lawName: string): string {
  return `AML/map/${jurisdictionName}/legislation/${lawName}`;
}

export function enforcementActionFileRef(slug: string): string {
  return `../ontologies/document-types/enforcement-actions/jurisdictions/se/examples/enforcement-actions/${slug}.md`;
}
