import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIdentity } from "./instrumentIdentity";

test("NSE:RELIANCE → stock identity with sector + aliases", () => {
  const id = resolveIdentity({ exchange: "NSE", tradingsymbol: "RELIANCE", instrumentType: "EQ", name: "Reliance Industries" });
  assert.equal(id.canonical, "RELIANCE");
  assert.equal(id.identityType, "stock");
  assert.equal(id.sector, "energy");
  assert.equal(id.benchmark, "NIFTY");
  assert.ok(id.aliases.includes("reliance") && id.aliases.includes("ril") && id.aliases.includes("jio"));
  assert.ok(id.relatedEntities.includes("oil") && id.relatedEntities.includes("refining"));
});

test("NFO:RELIANCE26JULFUT resolves underlying RELIANCE (futures)", () => {
  const id = resolveIdentity({ exchange: "NFO", tradingsymbol: "RELIANCE26JULFUT", instrumentType: "FUT", name: "RELIANCE" });
  assert.equal(id.underlying, "RELIANCE");
  assert.equal(id.assetClass, "futures");
});

test("NFO:MIDCPNIFTY26JULFUT → MIDCPNIFTY index identity", () => {
  const id = resolveIdentity({ exchange: "NFO", tradingsymbol: "MIDCPNIFTY26JULFUT", instrumentType: "FUT", name: "MIDCPNIFTY" });
  assert.equal(id.canonical, "MIDCPNIFTY");
  assert.equal(id.underlyingDisplay, "Nifty Midcap Select");
  assert.ok(id.aliases.includes("midcap nifty") || id.aliases.includes("nifty midcap"));
});

test("BANKNIFTY future → banking sector + RBI/rates in related", () => {
  const id = resolveIdentity({ exchange: "NFO", tradingsymbol: "BANKNIFTY2570824500CE", instrumentType: "CE", name: "BANKNIFTY", strike: 24500, optionType: "CE" });
  assert.equal(id.canonical, "BANKNIFTY");
  assert.equal(id.sector, "banking");
  assert.equal(id.benchmark, "BANKNIFTY");
  assert.ok(id.relatedEntities.includes("rbi") && id.relatedEntities.includes("repo rate"));
});

test("NSE:NIFTY 50 → NIFTY index", () => {
  const id = resolveIdentity({ exchange: "NSE", tradingsymbol: "NIFTY 50", instrumentType: "EQ", name: "NIFTY 50" });
  assert.equal(id.canonical, "NIFTY");
  assert.equal(id.identityType, "index");
});
