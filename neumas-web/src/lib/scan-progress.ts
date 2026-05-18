import type { ScanStatusResponse } from "@/lib/api/types";

function getStageStatus(
  stageDetails: Record<string, unknown> | null | undefined,
  stage: string
): string | null {
  const value = stageDetails?.[stage];
  if (!value || typeof value !== "object") return null;

  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

export function getScanPipelineProgress(
  scan: Pick<ScanStatusResponse, "status" | "stage_details"> | null | undefined
): { value: number; label: string } {
  if (!scan) {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  if (scan.status === "completed") {
    return { value: 100, label: "AI analysis complete" };
  }

  if (scan.status === "partial_failed") {
    return { value: 100, label: "Analysis complete with warnings" };
  }

  if (scan.status === "completed_with_partial_analysis") {
    return { value: 100, label: "AI provider temporarily unavailable; showing extracted basics" };
  }

  if (scan.status === "failed_provider_unavailable" || scan.status === "failed_invalid_file") {
    return { value: 100, label: "Analysis failed; retry" };
  }

  if (scan.status === "failed") {
    return { value: 100, label: "Analysis failed" };
  }

  if (scan.status === "queued") {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  if (scan.status === "uploaded") {
    return { value: 35, label: "Receipt uploaded, analysis pending" };
  }

  const stageDetails = scan.stage_details;
  const currentStage =
    typeof stageDetails?.current_stage === "string" ? stageDetails.current_stage : null;

  if (currentStage === "ocr" || getStageStatus(stageDetails, "ocr") === "running") {
    return { value: 55, label: "Running OCR extraction" };
  }

  if (
    currentStage === "inventory" ||
    getStageStatus(stageDetails, "inventory") === "running"
  ) {
    return { value: 72, label: "Updating inventory" };
  }

  if (
    currentStage === "baseline" ||
    getStageStatus(stageDetails, "baseline") === "running"
  ) {
    return { value: 86, label: "Recomputing baseline" };
  }

  if (
    currentStage === "predictions" ||
    getStageStatus(stageDetails, "predictions") === "running"
  ) {
    return { value: 96, label: "Refreshing predictions" };
  }

  return { value: 45, label: "Preparing AI analysis" };
}
