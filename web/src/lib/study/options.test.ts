import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBJECTS } from "../entities";
import { STUDY_SUBJECTS } from "./options";

describe("study option lists", () => {
  it("match the subject list the rest of the app uses", () => {
    assert.deepEqual([...STUDY_SUBJECTS], [...SUBJECTS]);
  });
});
