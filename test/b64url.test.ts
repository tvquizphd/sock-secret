import { toB64urlQuery, fromB64urlQuery } from "../src/index";

const test_basic = (expected: string) => {
  const decoded = fromB64urlQuery(expected);
  const encoded = toB64urlQuery(decoded);
  return expected === encoded;
};

describe("Base 64 conversion round trip", () => {
  const ok = "Text encoded/decoded properly";
  const error = "Error encoding/decoding text";

  it("Basic conversion roundtrip", () => {
    const expected = '#data.ev=:ACID';
    const passed = test_basic(expected);
    expect(passed).toEqual(true);
  })
  it("Nested conversion roundtrip", () => {
    const expected = '#a.a.array=:ACID#a.t.text=ACID';
    const passed = test_basic(expected);
    expect(passed).toEqual(true);
  })
})
