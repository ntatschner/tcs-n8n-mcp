import { describe, it, expect } from "vitest";
import { n8nId, paginationCursor } from "./validation.js";

describe("n8nId", () => {
  it.each(["1", "123", "999999"])("accepts valid numeric ID '%s'", (id) => {
    expect(n8nId.parse(id)).toBe(id);
  });

  it.each([
    "../admin",
    "abc",
    "",
    "12.3",
    "12 34",
    "-1",
    "1/../../etc/passwd",
    "1; DROP TABLE",
  ])("rejects invalid ID '%s'", (id) => {
    expect(() => n8nId.parse(id)).toThrow();
  });
});

describe("paginationCursor", () => {
  it.each(["abc123", "YWJj", "a+b/c=d", "test_cursor-123"])(
    "accepts valid cursor '%s'",
    (cursor) => {
      expect(paginationCursor.parse(cursor)).toBe(cursor);
    }
  );

  it("accepts undefined (optional)", () => {
    expect(paginationCursor.parse(undefined)).toBeUndefined();
  });

  it.each(["../path", "cur sor", "test<script>"])(
    "rejects invalid cursor '%s'",
    (cursor) => {
      expect(() => paginationCursor.parse(cursor)).toThrow();
    }
  );
});
