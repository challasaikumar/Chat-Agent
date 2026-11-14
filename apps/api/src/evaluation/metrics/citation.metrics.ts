export type CitationAssessment = {
  totalCitations: number;
  validCitations: number;
  relevantCitations: number;
  materialClaims: number;
  citedMaterialClaims: number;
  unsupportedMaterialClaims: number;
};

export function citationPrecision(a: CitationAssessment): number | null {
  if (a.totalCitations <= 0) return null;
  return a.relevantCitations / a.totalCitations;
}

export function citationRecall(a: CitationAssessment): number | null {
  if (a.materialClaims <= 0) return null;
  return a.citedMaterialClaims / a.materialClaims;
}

export function citationValidityRate(a: CitationAssessment): number | null {
  if (a.totalCitations <= 0) return null;
  return a.validCitations / a.totalCitations;
}

export function claimGroundingRate(a: CitationAssessment): number | null {
  if (a.materialClaims <= 0) return null;
  return a.citedMaterialClaims / a.materialClaims;
}

export function unsupportedClaimRate(a: CitationAssessment): number | null {
  if (a.materialClaims <= 0) return null;
  return a.unsupportedMaterialClaims / a.materialClaims;
}
