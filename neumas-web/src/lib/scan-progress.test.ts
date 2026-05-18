import { describe, expect, it } from "vitest";

import { getScanPipelineProgress } from "@/lib/scan-progress";

describe("getScanPipelineProgress status contract", () => {
  it("maps uploaded state to the required pending message", () => {
    const result = getScanPipelineProgress({
      status: "uploaded",
      stage_details: null,
    });

    expect(result.label).toBe("Receipt uploaded, analysis pending");
  });

  it("maps partial analysis completion to the required fallback message", () => {
    const result = getScanPipelineProgress({
      status: "completed_with_partial_analysis",
      stage_details: null,
    });

    expect(result.label).toBe("AI provider temporarily unavailable; showing extracted basics");
  });

  it("maps provider/file failures to the required retry message", () => {
    const providerFailure = getScanPipelineProgress({
      status: "failed_provider_unavailable",
      stage_details: null,
    });
    const fileFailure = getScanPipelineProgress({
      status: "failed_invalid_file",
      stage_details: null,
    });

    expect(providerFailure.label).toBe("Analysis failed; retry");
    expect(fileFailure.label).toBe("Analysis failed; retry");
  });
});
