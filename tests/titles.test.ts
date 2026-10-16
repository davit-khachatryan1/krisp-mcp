import { describe, expect, it } from "vitest";
import { parseTitle } from "../src/titles.js";

describe("parseTitle", () => {
  it.each([
    ["COO", "c_level", "operations"],
    ["Chief Operating Officer", "c_level", "operations"],
    ["VP of Sales", "vp", "sales"],
    ["Vice President, Sales", "vp", "sales"],
    ["SVP Sales", "vp", "sales"],
    ["Chief Revenue Officer", "c_level", "sales"],
    ["Head of IT", "head", "it"],
    ["IT Manager", "manager", "it"],
    ["Director of Sales Enablement", "director", "sales"],
    ["Head of Remote Work", "head", "remote_work"],
    ["Junior Designer", "junior", "design"],
  ])("%s -> %s / %s", (title, seniority, fn) => {
    expect(parseTitle(title)).toEqual({ seniority, function: fn });
  });

  it("Executive Assistant to the CEO is junior, not C-level", () => {
    expect(parseTitle("Executive Assistant to the CEO").seniority).toBe("junior");
  });

  it("empty title -> nulls", () => {
    expect(parseTitle("")).toEqual({ seniority: null, function: null });
  });

  it("'Officer' does not count as the office/admin keyword", () => {
    expect(parseTitle("Chief Executive Officer")).toEqual({ seniority: "c_level", function: "general_management" });
  });

  it("'Partnerships Manager' is a manager, not a partner (VP)", () => {
    expect(parseTitle("Partnerships Manager").seniority).toBe("manager");
  });

  it("ambiguous C-level abbreviations have no function", () => {
    expect(parseTitle("CSO")).toEqual({ seniority: "c_level", function: null });
  });

  it.each([
    // assistants work for executives; they are not executives
    ["CEO Assistant", "junior"],
    ["Executive Assistant, Office of the CEO", "junior"],
    ["Assistant Vice President", "vp"],
    ["Assistant Director of Sales", "director"],
    // owner / partner only as real seniority
    ["Product Owner", "individual"],
    ["Process Owner", "individual"],
    ["Owner", "c_level"],
    ["Co-Owner", "c_level"],
    ["HR Business Partner", "individual"],
    ["Talent Partner", "individual"],
    ["Partner", "vp"],
    ["Managing Partner", "vp"],
    // "student" in a manager's title is not a student
    ["Student Success Manager", "manager"],
    ["Head of Student Experience", "head"],
    ["Student", "junior"],
  ])("%s -> %s", (title, seniority) => {
    expect(parseTitle(title).seniority).toBe(seniority);
  });

  it.each([
    ["Chief Information Officer", "it"],
    ["Chief Customer Officer", "customer_success"],
    ["HR Business Partner", "people"],
  ])("%s -> function %s", (title, fn) => {
    expect(parseTitle(title).function).toBe(fn);
  });
});
