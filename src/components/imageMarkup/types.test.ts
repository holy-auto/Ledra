import { describe, it, expect } from "vitest";
import { isAnnotationDocument, type Annotation } from "./types";

const doc = (annotations: Annotation[]) => ({
  version: 1 as const,
  imageWidth: 1024,
  imageHeight: 768,
  annotations,
});

const path = (points: number[]): Annotation => ({
  id: "p1",
  kind: "path",
  color: "#ff0000",
  strokeWidth: 2,
  points,
});

const text = (t: string): Annotation => ({
  id: "t1",
  kind: "text",
  color: "#ff0000",
  strokeWidth: 1,
  x: 0,
  y: 0,
  text: t,
  fontSize: 24,
});

describe("isAnnotationDocument bounds", () => {
  it("accepts a path within the 10000-point cap", () => {
    expect(isAnnotationDocument(doc([path(new Array(10000).fill(1))]))).toBe(true);
  });

  it("rejects a path exceeding the 10000-point cap", () => {
    expect(isAnnotationDocument(doc([path(new Array(10002).fill(1))]))).toBe(false);
  });

  it("accepts text at the 500-char cap and rejects beyond it", () => {
    expect(isAnnotationDocument(doc([text("a".repeat(500))]))).toBe(true);
    expect(isAnnotationDocument(doc([text("a".repeat(501))]))).toBe(false);
  });
});
