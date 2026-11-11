import assert from "node:assert/strict";
import test from "node:test";

import { failureOf } from "@sincpro/client-framework";

import {
  ChecksFailed,
  DomainAppError,
  DomainBackendError,
  DomainException,
  DomainNetworkError,
  DomainUserError,
  DomainValidationError,
  RejectedFailure,
  RepeatableFailure,
  StaleAggregate,
} from "../../sincpro_mobile/exceptions.ts";

test("each mobile error says its kind, and the framework decides from it", () => {
  const cases = [
    [new DomainUserError("the route is closed"), "domain", { permanent: true, fault: false }],
    [new RejectedFailure("rejected"), "domain", { permanent: true, fault: false }],
    [new DomainValidationError("no customer"), "invalid", { permanent: true, fault: false }],
    [
      new ChecksFailed([{ rule: "required", message: "required", path: ["name"] }]),
      "invalid",
      { permanent: true, fault: false },
    ],
    [new StaleAggregate("v3 is not v4"), "conflict", { permanent: false, fault: false }],
    [new DomainNetworkError("offline"), "unavailable", { permanent: false, fault: true }],
    [new RepeatableFailure("try again"), "unavailable", { permanent: false, fault: true }],
    [new DomainBackendError("500"), "internal", { permanent: false, fault: true }],
    [new DomainAppError("bug"), "internal", { permanent: false, fault: true }],
  ] as const;
  for (const [error, kind, { permanent, fault }] of cases) {
    const failure = failureOf(error);
    assert.equal(failure.kind, kind, error.name);
    assert.equal(failure.permanent, permanent, `${error.name} permanent`);
    assert.equal(failure.fault, fault, `${error.name} fault`);
  }
  assert.equal(failureOf(new RepeatableFailure("x")).retryable, true);
  assert.equal(failureOf(new DomainUserError("x")).retryable, false);
});

test("a bare DomainException declares nothing: an unexpected fault", () => {
  const failure = failureOf(new DomainException("?"));
  assert.equal(failure.kind, "internal");
  assert.equal(failure.fault, true);
});
