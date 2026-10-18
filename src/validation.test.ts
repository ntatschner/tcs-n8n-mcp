import { describe, it, expect } from "vitest";
import {
  executionId,
  n8nId,
  paginationCursor,
  resourceId,
  userIdentifier,
} from "./validation.js";

describe("resourceId", () => {
  it.each(["1", "2tUt1wbLX592XDdX", "tag-with-hyphens", "abc_DEF.123", "wf/A"])(
    "accepts opaque ID '%s'",
    (id) => {
      expect(resourceId.parse(id)).toBe(id);
      expect(n8nId.parse(id)).toBe(id);
    },
  );

  it.each(["", ".", "..", "line\nbreak", "\0"])(
    "rejects unsafe ID '%s'",
    (id) => {
      expect(() => resourceId.parse(id)).toThrow();
    },
  );
});

describe("executionId", () => {
  it.each(["1", "123", "999999"])("accepts numeric ID '%s'", (id) => {
    expect(executionId.parse(id)).toBe(id);
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
  ])("rejects invalid execution ID '%s'", (id) => {
    expect(() => executionId.parse(id)).toThrow();
  });
});

describe("userIdentifier", () => {
  it.each(["user-id_123", "person@example.com"])("accepts '%s'", (id) => {
    expect(userIdentifier.parse(id)).toBe(id);
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

  it.each(["cursor with spaces", "opaque:cursor?part=1", "test<script>"])(
    "accepts opaque cursor '%s'",
    (cursor) => {
      expect(paginationCursor.parse(cursor)).toBe(cursor);
    },
  );

  it.each(["", "line\nbreak", "\0"])("rejects unsafe cursor '%s'", (cursor) => {
    expect(() => paginationCursor.parse(cursor)).toThrow();
  });
});
