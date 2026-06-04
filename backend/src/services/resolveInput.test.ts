import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInstrumentInput } from "./resolveInput";
import { KiteError } from "./kite.service";

// These tests cover the exact-symbol VALIDATION only (no cache/network needed).

test("accepts a valid exact equity symbol", async () => {
  const r = await resolveInstrumentInput({ instrument: "NSE:RELIANCE" });
  assert.equal(r.instrument, "NSE:RELIANCE");
  assert.equal(r.resolvedFrom, "exact");
});

test("accepts a valid exact F&O symbol", async () => {
  const r = await resolveInstrumentInput({ instrument: "NFO:MIDCPNIFTY26JUNFUT" });
  assert.equal(r.instrument, "NFO:MIDCPNIFTY26JUNFUT");
});

test('rejects "NSE:MIDCPNIFTY FUT JUN" (spaces) with resolver guidance', async () => {
  await assert.rejects(
    () => resolveInstrumentInput({ instrument: "NSE:MIDCPNIFTY FUT JUN" }),
    (err: unknown) => {
      assert.ok(err instanceof KiteError);
      assert.equal((err as KiteError).code, "KITE_BAD_INSTRUMENT");
      assert.match((err as KiteError).message, /resolver|instruments\/resolve/i);
      return true;
    },
  );
});

test("rejects a bare symbol with no exchange", async () => {
  await assert.rejects(() => resolveInstrumentInput({ instrument: "RELIANCE" }), /not a valid Kite instrument/i);
});

test("returns REFERENCE_ONLY (not a raw error) for a non-quoteable exchange (NSEIX:GIFT NIFTY)", async () => {
  await assert.rejects(
    () => resolveInstrumentInput({ instrument: "NSEIX:GIFT NIFTY" }),
    (err: unknown) => {
      assert.ok(err instanceof KiteError);
      assert.equal((err as KiteError).code, "KITE_REFERENCE_ONLY");
      assert.match((err as KiteError).message, /reference-only|not directly quoteable|tradable/i);
      return true;
    },
  );
});

test("requires either instrument or underlying", async () => {
  await assert.rejects(
    () => resolveInstrumentInput({}),
    (err: unknown) => {
      assert.ok(err instanceof KiteError);
      assert.equal((err as KiteError).code, "KITE_RESOLVE_REQUIRED");
      return true;
    },
  );
});
