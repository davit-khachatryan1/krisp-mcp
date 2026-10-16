// validateConfig on in-memory copies of the real config/icp.json – a live edit with a typo
// must give a clear error, not a crash or NaN scores.

import { describe, expect, it } from "vitest";
import { loadConfig, validateConfig, type IcpConfig } from "../src/config.js";

const realConfig = () => structuredClone(loadConfig());
const check = (edit: (config: IcpConfig) => void) => {
  const config = realConfig();
  edit(config);
  return () => validateConfig(config);
};

describe("validateConfig", () => {
  it("accepts the real config", () => {
    expect(() => validateConfig(realConfig())).not.toThrow();
  });

  it("max_per_company 0 -> clear error (used to crash select())", () => {
    expect(check((c) => { c.selection.max_per_company = 0; })).toThrow(
      "config/icp.json is invalid:\n- selection.max_per_company must be a whole number ≥ 1 (got 0)",
    );
  });

  it("a removed weight -> clear error (used to make every score NaN)", () => {
    expect(check((c) => { delete (c.score_weights as Partial<IcpConfig["score_weights"]>).company; })).toThrow(
      "score_weights.company must be a number ≥ 0 (got undefined)",
    );
  });

  it("a number written as a string -> clear error", () => {
    expect(check((c) => { (c.authority as Record<string, unknown>).vp = "0.9"; })).toThrow(
      'authority.vp must be a number ≥ 0 (got "0.9")',
    );
  });

  it("lists every problem at once", () => {
    const run = check((c) => {
      c.selection.min_score = 150;
      (c.industries.scores as Record<string, unknown>).unknown = null;
    });
    expect(run).toThrow(/selection\.min_score must be a number between 0 and 100 \(got 150\)\n- industries\.scores\.unknown/);
  });
});
