import { Router } from 'express';
import { all } from '../db.js';
import { rangeBounds, str } from './util.js';

const router = Router();

// Value of an opportunity = its latest priced quote, falling back to the estimated value.
const OPP_VALUE = `COALESCE(NULLIF((SELECT q.grand_total FROM quotes q WHERE q.opportunity_id = o.id ORDER BY q.grand_total DESC LIMIT 1), 0), o.est_value, 0)`;

function bucketsFor(period, startISO, endISO) {
  const end = endISO ? new Date(endISO) : new Date();
  let start = startISO ? new Date(startISO) : null;
  const buckets = [];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
  if (period === 'monthly') {
    if (!start) start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end && buckets.length < 36) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      buckets.push({ start: cur, end: next, label: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}` });
      cur = next;
    }
  } else if (period === 'yearly') {
    if (!start) start = new Date(end.getFullYear() - 4, 0, 1);
    for (let y = start.getFullYear(); y <= end.getFullYear() && buckets.length < 20; y++) {
      buckets.push({ start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y) });
    }
  } else {
    if (!start) start = new Date(end.getTime() - 12 * 7 * 864e5);
    let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur <= end && buckets.length < 60) {
      const next = new Date(cur.getTime() + 7 * 864e5);
      const last = new Date(Math.min(next.getTime() - 864e5, end.getTime()));
      buckets.push({ start: cur, end: next, label: `${fmt(cur)} - ${fmt(last)}` });
      cur = next;
    }
  }
  return buckets;
}

router.get('/dashboard', (req, res) => {
  const { start, end } = rangeBounds(req.query.range || '30d', req.query.from, req.query.to);
  const managedBy = str(req.query.managedBy, 120);
  const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period) ? req.query.period : 'weekly';
  const locBy = req.query.locBy === 'state' ? 'state' : 'city';

  const cond = (col) => {
    const parts = [];
    const params = [];
    if (start) {
      parts.push(`${col} >= ?`);
      params.push(start);
    }
    if (end) {
      parts.push(`${col} <= ?`);
      params.push(end);
    }
    if (managedBy) {
      parts.push('o.managed_by = ?');
      params.push(managedBy);
    }
    return { sql: parts.length ? parts.join(' AND ') : '1=1', params };
  };

  const created = cond('o.created_at');
  const createdRows = all(`SELECT o.id, o.city, o.state, o.source, o.stage, o.status, o.managed_by, o.created_at, ${OPP_VALUE} AS value FROM opportunities o WHERE ${created.sql}`, ...created.params);
  const statusCond = cond('o.status_changed_at');
  const wonRows = all(`SELECT o.id, o.project_name, o.managed_by, o.status_changed_at, ${OPP_VALUE} AS value FROM opportunities o WHERE o.status = 'won' AND ${statusCond.sql}`, ...statusCond.params);
  const lostRows = all(`SELECT o.id, o.lost_reason, o.managed_by, o.status_changed_at, ${OPP_VALUE} AS value FROM opportunities o WHERE o.status = 'lost' AND ${statusCond.sql}`, ...statusCond.params);
  const quotedCond = cond('q.created_at');
  const quotedRows = all(
    `SELECT q.id, q.grand_total AS value, q.created_at, o.managed_by FROM quotes q JOIN opportunities o ON o.id = q.opportunity_id
     WHERE q.grand_total > 0 AND ${quotedCond.sql}`,
    ...quotedCond.params,
  );
  const sum = (rows) => rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  // Sales analytics
  const buckets = bucketsFor(period, start, end).map((b) => ({ ...b, created: 0, won: 0, lost: 0, quoted: 0 }));
  const place = (dateISO, key, value) => {
    const t = new Date(dateISO).getTime();
    const b = buckets.find((x) => t >= x.start.getTime() && t < x.end.getTime());
    if (b) b[key] += Number(value) || 0;
  };
  createdRows.forEach((r) => place(r.created_at, 'created', r.value));
  wonRows.forEach((r) => place(r.status_changed_at, 'won', r.value));
  lostRows.forEach((r) => place(r.status_changed_at, 'lost', r.value));
  quotedRows.forEach((r) => place(r.created_at, 'quoted', r.value));

  // Location
  const locMap = new Map();
  for (const r of createdRows) {
    const key = (r[locBy] || 'UNKNOWN').toUpperCase();
    const e = locMap.get(key) || { location: key, qty: 0, value: 0 };
    e.qty += 1;
    e.value += Number(r.value) || 0;
    locMap.set(key, e);
  }
  // Sources
  const srcMap = new Map();
  for (const r of createdRows) {
    const e = srcMap.get(r.source) || { source: r.source, count: 0, value: 0 };
    e.count += 1;
    e.value += Number(r.value) || 0;
    srcMap.set(r.source, e);
  }
  // Lost reasons
  const lostMap = new Map();
  for (const r of lostRows) {
    const key = r.lost_reason || 'Not specified';
    const e = lostMap.get(key) || { reason: key, count: 0, value: 0 };
    e.count += 1;
    e.value += Number(r.value) || 0;
    lostMap.set(key, e);
  }
  // Funnel (based on opportunities created in range)
  const quotedIds = new Set(
    all(`SELECT DISTINCT q.opportunity_id AS id FROM quotes q WHERE q.grand_total > 0`).map((r) => r.id),
  );
  const createdQuoted = createdRows.filter((r) => quotedIds.has(r.id));
  const createdWon = createdRows.filter((r) => r.status === 'won');
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const funnel = [
    { label: 'Created', count: createdRows.length, value: sum(createdRows), pct: createdRows.length ? 100 : 0 },
    { label: 'Quoted', count: createdQuoted.length, value: sum(createdQuoted), pct: pct(createdQuoted.length, createdRows.length) },
    { label: 'Won', count: createdWon.length, value: sum(createdWon), pct: pct(createdWon.length, createdRows.length) },
  ];
  // Stages of active opportunities
  const stageMap = new Map();
  for (const r of createdRows.filter((x) => x.status === 'active')) {
    const e = stageMap.get(r.stage) || { stage: r.stage, count: 0, value: 0 };
    e.count += 1;
    e.value += Number(r.value) || 0;
    stageMap.set(r.stage, e);
  }
  // Teams of the month (won this calendar month)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const users = all('SELECT name, team FROM users');
  const teamOf = new Map(users.map((u) => [u.name, u.team]));
  const monthWins = all(
    `SELECT o.project_name, o.managed_by, ${OPP_VALUE} AS value FROM opportunities o WHERE o.status = 'won' AND o.status_changed_at >= ?`,
    monthStart,
  );
  const teamMap = new Map();
  for (const w of monthWins) {
    const team = teamOf.get(w.managed_by);
    if (!team) continue;
    const e = teamMap.get(team) || { team, topDeal: null, topDealValue: 0, members: users.filter((u) => u.team === team).length, memberValues: new Map(), count: 0, value: 0 };
    e.count += 1;
    e.value += Number(w.value) || 0;
    if ((Number(w.value) || 0) > e.topDealValue) {
      e.topDealValue = Number(w.value) || 0;
      e.topDeal = w.project_name;
    }
    e.memberValues.set(w.managed_by, (e.memberValues.get(w.managed_by) || 0) + (Number(w.value) || 0));
    teamMap.set(team, e);
  }
  const teamsOfMonth = [...teamMap.values()]
    .map((e) => ({
      team: e.team,
      topDeal: e.topDeal,
      topDealValue: e.topDealValue,
      members: e.members,
      topMember: [...e.memberValues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      count: e.count,
      value: e.value,
    }))
    .sort((a, b) => b.value - a.value);
  // Teams performance by executive
  const perf = new Map();
  const bump = (name, key, value) => {
    const e = perf.get(name) || { executive: name, created: 0, createdValue: 0, won: 0, wonValue: 0, lost: 0, lostValue: 0 };
    e[key] += 1;
    e[`${key}Value`] += Number(value) || 0;
    perf.set(name, e);
  };
  createdRows.forEach((r) => bump(r.managed_by, 'created', r.value));
  wonRows.forEach((r) => bump(r.managed_by, 'won', r.value));
  lostRows.forEach((r) => bump(r.managed_by, 'lost', r.value));

  // Smart quotes
  const sqCond = cond('s.created_at');
  const sqRows = all(
    `SELECT s.*, o.project_name, o.status, q.grand_total FROM smart_quotes s JOIN quotes q ON q.id = s.quote_id JOIN opportunities o ON o.id = q.opportunity_id
     WHERE ${sqCond.sql}`,
    ...sqCond.params,
  );
  const sqDTO = (r) => ({ quoteId: r.quote_id, opportunity: r.project_name, value: r.grand_total, generatedAt: r.created_at, lastViewedAt: r.last_viewed_at, views: r.views, status: r.status });
  const smartQuotes = {
    generated: sqRows.length,
    active: sqRows.filter((r) => r.status === 'active').length,
    won: sqRows.filter((r) => r.status === 'won').length,
    lost: sqRows.filter((r) => r.status === 'lost').length,
    recentlyGenerated: [...sqRows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(sqDTO),
    recentlyViewed: sqRows.filter((r) => r.last_viewed_at).sort((a, b) => b.last_viewed_at.localeCompare(a.last_viewed_at)).slice(0, 8).map(sqDTO),
    topViews: sqRows.filter((r) => r.views > 0).sort((a, b) => b.views - a.views).slice(0, 8).map(sqDTO),
  };

  res.json({
    range: { start, end },
    kpis: {
      created: { count: createdRows.length, value: sum(createdRows) },
      quoted: { count: quotedRows.length, value: sum(quotedRows) },
      won: { count: wonRows.length, value: sum(wonRows) },
      lost: { count: lostRows.length, value: sum(lostRows) },
    },
    salesAnalytics: buckets.map((b) => ({ label: b.label, created: b.created, won: b.won, lost: b.lost, quoted: b.quoted })),
    salesLocation: [...locMap.values()].sort((a, b) => b.value - a.value),
    lostReasons: { total: sum(lostRows), rows: [...lostMap.values()].sort((a, b) => b.value - a.value) },
    sources: [...srcMap.values()].sort((a, b) => b.count - a.count),
    funnel,
    stages: [...stageMap.values()].sort((a, b) => b.count - a.count),
    teamsOfMonth,
    teamsPerformance: [...perf.values()].sort((a, b) => b.createdValue - a.createdValue),
    smartQuotes,
  });
});

export default router;
