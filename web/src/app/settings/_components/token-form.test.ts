import assert from "node:assert/strict";
import test from "node:test";
import { INTEGRATION_SCOPES } from "@/lib/security/integration-tokens";
import { scopeDefaultChecked } from "./token-form";

test("the Nanny preset selects only its dedicated scope", () => {
  assert.deepEqual(
    INTEGRATION_SCOPES.filter((scope) => scopeDefaultChecked(scope, true)),
    ["study-nanny:write"],
  );
  assert.equal(scopeDefaultChecked("study-nanny:write", false), false);
  assert.equal(scopeDefaultChecked("metadata:write", false), true);
});
