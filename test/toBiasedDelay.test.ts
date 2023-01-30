import { _toBiasedDelay } from "../src/util/toBiasedDelay";

type Limit = { count: number, minutes: number };

const _toUniformDelay = (limit: Limit) => {
  const m_delay = limit.minutes / limit.count;
  return Math.ceil(60000 * m_delay) / 1000;
}

const count = 1000;
const minutes = 60;
describe(`Time-discounting ${count} steps per ${minutes} min`, () => {
  const limit = { count, minutes };
  const ud = _toUniformDelay(limit);
  const deltas = [...new Array(minutes).keys()];
  const bds = deltas.map(m => {
    return _toBiasedDelay(m*60, limit);
  });
  const k_fast = Math.round(0.23*minutes);
  const k_slow = Math.round(0.2*minutes);
  it(`First ${k_fast} min ~2x faster than uniform`, () => {
    const q1 = bds.slice(0, k_fast);
    const all_faster = q1.every(bd => bd < ud);
    const half_cost = q1.reduce((sum, bd) => {
      return sum + bd;
    }, 0) / (ud * k_fast);
    expect(all_faster).toEqual(true);
    expect(half_cost).toBeCloseTo(0.5, 1);
  });
  it(`Last ${k_slow} min ~4x slower than uniform`, () => {
    const q4 = bds.slice(minutes - k_slow, minutes);
    const all_slower = q4.every(bd => bd > ud);
    const half_cost = q4.reduce((sum, bd) => {
      return sum + bd;
    }, 0) / (ud * k_slow);
    expect(all_slower).toEqual(true);
    expect(1/half_cost).toBeCloseTo(0.25, 1);
  });
  it("All delays exceed needed minutes", () => {
    let t = 0;
    let n = 0;
    while (n < count) {
      const bd = _toBiasedDelay(t, limit);
      t+= bd;
      n+= 1;
    }
    expect(t/60).toBeGreaterThan(minutes);
  });
})
