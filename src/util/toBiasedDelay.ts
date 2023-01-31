type Limit = { count: number, minutes: number };
export type LimitLeft = Limit & { when: Date };

const toMinutes = (seconds: number) => {
  return Math.ceil(Math.max(0, seconds) / 60);
}

const _toBiasedDelay = (dt: number, limit: Limit) => {
  if (limit.count <= 0) {
    return limit.minutes;
  }
  const N = limit.count;
  const M = limit.minutes;
  const m = toMinutes(dt + 15) + .5;
  const m_delay = (Math.log(M) * m) / N;
  return Math.round(60000 * m_delay) / 1000;
}

const toBiasedDelay = (limit: LimitLeft) => {
  const elapsed = Date.now() - limit.when.getTime();
  const dt = Math.ceil(elapsed / 1000);
  return _toBiasedDelay(dt, limit);
}


export { toMinutes, toBiasedDelay, _toBiasedDelay }
