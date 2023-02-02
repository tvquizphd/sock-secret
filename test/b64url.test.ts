import { toB64urlQuery, fromB64urlQuery } from "../src/index";

const test_basic = (expected: string) => {
  const decoded = fromB64urlQuery(expected);
  return toB64urlQuery(decoded);
};

describe("Base 64 conversion round trip", () => {
  it("Basic conversion roundtrip", () => {
    const expected = '#data.ev=:ACID';
    const encoded = test_basic(expected);
    expect(encoded).toEqual(expected);
  })
  it("Nested conversion roundtrip", () => {
    const expected = '#a.a.array=:ACID&a.t.text=ACID';
    const encoded = test_basic(expected);
    expect(encoded).toEqual(expected);
  })
})
