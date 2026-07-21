import { test } from "node:test";
import assert from "node:assert/strict";

import { SubscriptionManager } from "./subscriptionManager";

test("a token stays desired until the LAST reference is released", () => {
  const m = new SubscriptionManager();
  m.addRefs([100]); // e.g. always-on index
  m.addRefs([100, 200]); // a client also wants 100 + 200
  assert.deepEqual(m.desired().sort(), [100, 200]);
  m.removeRefs([100, 200]); // client leaves
  assert.deepEqual(m.desired(), [100]); // index reference remains
  m.removeRefs([100]);
  assert.deepEqual(m.desired(), []);
});

test("reconcile diffs desired against the socket state", () => {
  const m = new SubscriptionManager();
  m.addRefs([1, 2, 3]);
  let plan = m.reconcile();
  assert.deepEqual(plan.subscribe.sort(), [1, 2, 3]);
  assert.deepEqual(plan.unsubscribe, []);
  m.markSubscribed(plan.subscribe);

  m.removeRefs([2]);
  m.addRefs([4]);
  plan = m.reconcile();
  assert.deepEqual(plan.subscribe, [4]);
  assert.deepEqual(plan.unsubscribe, [2]);
  m.markSubscribed(plan.subscribe);
  m.markUnsubscribed(plan.unsubscribe);

  // Stable once reconciled.
  assert.deepEqual(m.reconcile(), { subscribe: [], unsubscribe: [] });
});

test("onReconnect clears socket state and returns everything desired", () => {
  const m = new SubscriptionManager();
  m.addRefs([10, 20]);
  m.markSubscribed([10, 20]);
  const tokens = m.onReconnect();
  assert.deepEqual(tokens.sort(), [10, 20]);
  // After a reconnect nothing is considered subscribed until re-marked.
  assert.deepEqual(m.reconcile().subscribe.sort(), [10, 20]);
});

test("invalid tokens are ignored; max cap is honoured", () => {
  const m = new SubscriptionManager(2);
  m.addRefs([0, -5, NaN, 1, 2, 3]);
  assert.equal(m.desired().length, 2); // capped
  assert.ok(!m.desired().includes(0));
});
