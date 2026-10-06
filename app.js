'use strict';

(() => {
  const KEY = 'lyfe.v1';
  const DEFAULTS = { wage: 0, weeklyGoal: 0, weekStart: 0, currency: 'USD', theme: 'system' };
  const VIEWS = ['home', 'history', 'jobs', 'insights', 'settings'];
  const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#475569'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MO_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const CURRENCIES = ['USD', 'CAD', 'MXN', 'EUR', 'GBP', 'AUD'];
  const AMOUNT_FIELDS = ['cash', 'digital', 'tipOut', 'sales'];

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const daysBetween = (a, b) => Math.round((b - a) / 864e5);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pct = (n) => `${Math.round(n * 100)}%`;
  const fmtHours = (h) => `${+h.toFixed(2)}h`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${pad(m)}` : ''}${h < 12 ? 'am' : 'pm'}`; };
  const TIME_RE = /^\d{2}:\d{2}$/;

  function fmtDate(s) {
    const d = parseISO(s);
    const year = d.getFullYear() !== today().getFullYear() ? `, ${d.getFullYear()}` : '';
    return `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}${year}`;
  }

  // Parses "40+25+12.50", "3x20+5" or "$1,200" into a number. Returns NaN for anything else.
  const N = '(?:\\d+\\.?\\d*|\\.\\d+)';
  const TERM = `${N}(?:\\*${N})*`;
  const AMOUNT_RE = new RegExp(`^[-+]?${TERM}(?:[-+]${TERM})*$`);
  function parseAmount(str) {
    const s = String(str ?? '').replace(/[$,\s]/g, '').replace(/[x×]/gi, '*').replace(/[-+*]+$/, '');
    if (!s) return 0;
    if (!AMOUNT_RE.test(s)) return NaN;
    let total = 0;
    for (const term of s.match(/[-+]?[^-+]+/g)) {
      const sign = term[0] === '-' ? -1 : 1;
      total += sign * term.replace(/^[-+]/, '').split('*').reduce((a, f) => a * parseFloat(f), 1);
    }
    return round2(total);
  }

  function hoursBetween(a, b) {
    if (!a || !b) return null;
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    let mins = bh * 60 + bm - (ah * 60 + am);
    if (mins <= 0) mins += 1440; // overnight shift
    return round2(mins / 60);
  }

  // ---------- storage ----------
  function normalize(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return null;
    return {
      id: String(s.id || uid()),
      date: s.date,
      job: String(s.job ?? '').trim(),
      jobId: String(s.jobId ?? ''),
      start: TIME_RE.test(s.start) ? s.start : '',
      end: TIME_RE.test(s.end) ? s.end : '',
      hours: Math.max(0, num(s.hours)),
      cash: num(s.cash),
      digital: num(s.digital),
      tipOut: num(s.tipOut),
      sales: num(s.sales),
      wage: Math.max(0, num(s.wage)),
      notes: String(s.notes ?? '').trim(),
    };
  }

  function normalizeJob(j) {
    const name = String(j?.name ?? '').trim().slice(0, 60);
    if (!name) return null;
    return {
      id: String(j.id || uid()),
      name,
      wage: Math.max(0, num(j.wage)),
      start: TIME_RE.test(j.start) ? j.start : '',
      end: TIME_RE.test(j.end) ? j.end : '',
      tipOutPct: Math.min(100, Math.max(0, num(j.tipOutPct))),
      color: /^#[0-9a-f]{6}$/i.test(j.color) ? j.color : COLORS[0],
    };
  }

  // Builds { shifts, settings, jobs } from stored or imported data. Data saved before
  // jobs existed has no jobs list, so one is created from the job names on its shifts.
  function hydrate(raw) {
    const d = { shifts: raw.shifts.map(normalize).filter(Boolean), settings: { ...DEFAULTS, ...raw.settings } };
    d.jobs = Array.isArray(raw.jobs) ? raw.jobs.map(normalizeJob).filter(Boolean) : [];
    if (!Array.isArray(raw.jobs)) linkJobs(d);
    d.updatedAt = num(raw.updatedAt);
    d.lastBackupAt = num(raw.lastBackupAt);
    return d;
  }

  // Gives every shift with a job name but no saved job a matching job, creating it if needed.
  function linkJobs(d) {
    const ids = new Set(d.jobs.map((j) => j.id));
    for (const s of [...d.shifts].sort((a, b) => b.date.localeCompare(a.date))) {
      if (!s.job || ids.has(s.jobId)) continue;
      let job = d.jobs.find((j) => j.name.toLowerCase() === s.job.toLowerCase());
      if (!job) {
        job = normalizeJob({ name: s.job, wage: s.wage, start: s.start, end: s.end, color: COLORS[d.jobs.length % COLORS.length] });
        d.jobs.push(job);
        ids.add(job.id);
      }
      s.jobId = job.id;
      s.job = job.name;
    }
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Array.isArray(raw.shifts)) return hydrate(raw);
    } catch { /* corrupted or blocked storage: start fresh */ }
    return { shifts: [], settings: { ...DEFAULTS }, jobs: [], updatedAt: 0, lastBackupAt: 0 };
  }

  const jobById = (id) => (id ? data.jobs.find((j) => j.id === id) : undefined);
  const nextColor = () => COLORS.find((c) => !data.jobs.some((j) => j.color === c)) || COLORS[data.jobs.length % COLORS.length];

  let data = load();
  const ui = { view: 'home', period: 'week', range: '90', query: '', jobFilter: '', editing: null, formJob: '', orphanName: '', autoFill: {}, tipOutManual: false, editingJob: null, jobColor: COLORS[0], persisted: false };

  // `changed` is false for bookkeeping writes (like recording a backup) that shouldn't count as new data.
  function save(changed = true) {
    if (changed) data.updatedAt = Date.now();
    data.shifts.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      toast('Couldn’t save — browser storage is full or blocked');
    }
  }

  let money;
  function makeFormatter() {
    let f;
    try { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: data.settings.currency }); }
    catch { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }); }
    money = (n) => f.format(round2(n) || 0);
  }

  function applyTheme() {
    const t = data.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  // ---------- math ----------
  function calc(s) {
    const gross = s.cash + s.digital;
    const tips = gross - s.tipOut;
    const wages = s.hours * s.wage;
    return { gross, tips, wages, total: tips + wages };
  }

  function summarize(list) {
    const t = { count: list.length, cash: 0, digital: 0, tipOut: 0, hours: 0, tips: 0, wages: 0, total: 0, timedTotal: 0, sales: 0, salesTips: 0 };
    for (const s of list) {
      const c = calc(s);
      t.cash += s.cash; t.digital += s.digital; t.tipOut += s.tipOut;
      t.tips += c.tips; t.wages += c.wages; t.total += c.total;
      if (s.hours) { t.hours += s.hours; t.timedTotal += c.total; }
      if (s.sales > 0) { t.sales += s.sales; t.salesTips += c.gross; }
    }
    t.gross = t.cash + t.digital;
    t.perHour = t.hours ? t.timedTotal / t.hours : 0; // only shifts with hours logged
    t.perShift = t.count ? t.total / t.count : 0;
    t.cashShare = t.gross ? t.cash / t.gross : 0;
    t.tipPct = t.sales ? t.salesTips / t.sales : 0;
    return t;
  }

  const between = (start, end) => data.shifts.filter((s) => (!start || s.date >= iso(start)) && (!end || s.date < iso(end)));

  function startOfWeek(d) {
    return addDays(d, -((d.getDay() - data.settings.weekStart + 7) % 7));
  }

  function periodRange(period, ref = today()) {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    if (period === 'week') {
      const start = startOfWeek(ref);
      const last = addDays(start, 6);
      return { start, end: addDays(start, 7), prevStart: addDays(start, -7), label: `${MO[start.getMonth()]} ${start.getDate()} – ${MO[last.getMonth()]} ${last.getDate()}` };
    }
    if (period === 'month') {
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), prevStart: new Date(y, m - 1, 1), label: `${MO_LONG[m]} ${y}` };
    }
    if (period === 'year') {
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), prevStart: new Date(y - 1, 0, 1), label: String(y) };
    }
    return { start: null, end: null, prevStart: null, label: 'All time' };
  }

  function weekdayStats(list) {
    const days = Array.from({ length: 7 }, (_, i) => ({ i, count: 0, total: 0, hours: 0, timed: 0 }));
    for (const s of list) {
      const w = days[parseISO(s.date).getDay()];
      const { total } = calc(s);
      w.count++; w.total += total;
      if (s.hours) { w.hours += s.hours; w.timed += total; }
    }
    for (const w of days) {
      w.avg = w.count ? w.total / w.count : 0;
      w.perHour = w.hours ? w.timed / w.hours : 0;
    }
    return days;
  }

  // ---------- small UI pieces ----------
  const seg = (name, options, current) =>
    `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-seg="${name}" data-value="${v}" aria-pressed="${v === current}">${l}</button>`).join('')}</div>`;

  const stat = (label, value) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`;

  const legend = `<div class="legend"><span><i class="dot cash"></i>Cash</span><span><i class="dot digital"></i>Digital</span></div>`;

  function splitBar(t) {
    if (!t.gross) return '';
    const c = t.cashShare;
    return `<div class="split" role="img" aria-label="${pct(c)} cash, ${pct(1 - c)} digital">
        <span class="cash" style="width:${c * 100}%"></span><span class="digital" style="width:${(1 - c) * 100}%"></span>
      </div>
      <div class="legend"><span><i class="dot cash"></i>Cash ${money(t.cash)} · ${pct(c)}</span><span><i class="dot digital"></i>Digital ${money(t.digital)} · ${pct(1 - c)}</span></div>`;
  }

  function shiftRow(s) {
    const c = calc(s);
    const d = parseISO(s.date);
    const job = jobById(s.jobId);
    const parts = [`Cash ${money(s.cash)}`, `Digital ${money(s.digital)}`];
    if (s.tipOut) parts.push(`Tip-out ${money(s.tipOut)}`);
    return `<button type="button" class="row" data-edit="${esc(s.id)}">
        <div class="row-date"><b>${d.getDate()}</b><small>${MO[d.getMonth()]} · ${WD[d.getDay()]}</small></div>
        <div class="row-main"><div>${job ? `<i class="dot" style="background:${job.color}"></i>` : ''}${esc(s.job || 'Shift')}${s.hours ? ` · ${fmtHours(s.hours)}` : ''}</div><small>${parts.join(' · ')}</small></div>
        <div class="row-amt">${money(c.total)}${s.hours ? `<small>${money(c.total / s.hours)}/hr</small>` : ''}</div>
      </button>`;
  }

  function chart(period, p) {
    const daily = period === 'week' || period === 'month';
    const todayKey = iso(today());
    const cols = [];
    if (daily) {
      for (let d = p.start; d < p.end; d = addDays(d, 1)) {
        cols.push({
          key: iso(d),
          label: period === 'week' ? WD[d.getDay()][0] : String(d.getDate()),
          show: period === 'week' || d.getDate() % 7 === 1,
          title: fmtDate(iso(d)),
        });
      }
    } else {
      const t = today();
      const first = period === 'year' ? p.start : new Date(t.getFullYear(), t.getMonth() - 11, 1);
      for (let i = 0; i < 12; i++) {
        const m = new Date(first.getFullYear(), first.getMonth() + i, 1);
        cols.push({ key: iso(m).slice(0, 7), label: MO[m.getMonth()][0], show: true, title: `${MO[m.getMonth()]} ${m.getFullYear()}` });
      }
    }
    const keyLen = daily ? 10 : 7;
    const sums = new Map();
    for (const s of data.shifts) {
      const k = s.date.slice(0, keyLen);
      const v = sums.get(k) || { cash: 0, digital: 0 };
      v.cash += s.cash; v.digital += s.digital;
      sums.set(k, v);
    }
    const empty = { cash: 0, digital: 0 };
    const max = Math.max(1, ...cols.map((c) => { const v = sums.get(c.key) || empty; return v.cash + v.digital; }));
    const total = cols.reduce((a, c) => { const v = sums.get(c.key) || empty; return a + v.cash + v.digital; }, 0);
    const bars = cols.map((c) => {
      const v = sums.get(c.key) || empty;
      const isToday = c.key === todayKey || c.key === todayKey.slice(0, 7);
      return `<div class="col${isToday ? ' today' : ''}" title="${esc(c.title)}: ${money(v.cash + v.digital)} tips (${money(v.cash)} cash, ${money(v.digital)} digital)">
          <div class="stack"><i class="digital" style="height:${(v.digital / max) * 100}%"></i><i class="cash" style="height:${(v.cash / max) * 100}%"></i></div>
          <span>${c.show ? c.label : ''}</span>
        </div>`;
    }).join('');
    return `<div class="chart" role="img" aria-label="Tips chart, ${money(total)} total">${bars}</div>${legend}`;
  }

  // ---------- views ----------
  const WEEK_MS = 7 * 864e5;
  // Remind when nothing has ever been backed up, or when changes have gone a week without one.
  const needsBackup = () => data.shifts.length > 0 &&
    (!data.lastBackupAt || (data.updatedAt > data.lastBackupAt && Date.now() - data.lastBackupAt > WEEK_MS));

  function lastBackupText() {
    if (!data.lastBackupAt) return 'never';
    const days = daysBetween(new Date(data.lastBackupAt), new Date());
    return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }

  function backupNotice() {
    if (!needsBackup()) return '';
    return `<section class="card notice">
        <div><b>Back up your shifts</b><small>Last backup: ${lastBackupText()}. Save a copy to iCloud Drive, Google Drive, Files or email so a cleared browser or lost phone can’t erase it.</small></div>
        <button type="button" class="btn primary sm" data-action="backup">Back up now</button>
      </section>`;
  }

  function renderHome() {
    const el = $('#view-home');
    if (!data.shifts.length) {
      el.innerHTML = `<section class="card empty">
          <h2>Welcome to LYFE</h2>
          <p>Log each shift’s cash and digital tips. LYFE shows your totals, your real hourly rate, and which days pay best.</p>
          <button type="button" class="btn primary" data-action="new">Log your first shift</button>
          <p class="muted small" style="margin-top:16px">Your data stays on this device. You can back it up any time from Settings.</p>
        </section>`;
      return;
    }
    const p = periodRange(ui.period);
    const t = summarize(between(p.start, p.end));
    const extra = [];
    if (t.wages) extra.push(stat('Wages', money(t.wages)));
    if (t.tipOut) extra.push(stat('Tip-out', money(t.tipOut)));
    if (t.sales) extra.push(stat('Tip %', `${(t.tipPct * 100).toFixed(1)}%`));

    el.innerHTML = `
      ${backupNotice()}
      ${seg('period', [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All']], ui.period)}
      <section class="card">
        <p class="eyebrow">Take-home · ${esc(p.label)}</p>
        <p class="big">${money(t.total)}</p>
        <p class="sub">${compare(ui.period, p) || plural(t.count, 'shift')}</p>
        ${splitBar(t)}
      </section>
      <div class="stats">
        ${stat('Cash tips', money(t.cash))}
        ${stat('Digital tips', money(t.digital))}
        ${stat('Per hour', t.hours ? money(t.perHour) : '—')}
        ${stat('Hours', fmtHours(t.hours))}
        ${stat('Shifts', t.count)}
        ${stat('Avg / shift', t.count ? money(t.perShift) : '—')}
        ${extra.join('')}
      </div>
      ${goalCard()}
      <section class="card">
        <h2>${ui.period === 'all' ? 'Tips, last 12 months' : ui.period === 'year' ? 'Tips by month' : 'Tips by day'}</h2>
        ${chart(ui.period, p)}
      </section>
      <section class="card">
        <div class="card-head"><h2>Recent shifts</h2><a href="#history">See all</a></div>
        <div class="list">${data.shifts.slice(0, 5).map(shiftRow).join('')}</div>
      </section>`;
  }

  // Compares against the same number of elapsed days in the previous period, so a
  // half-finished week is not measured against a whole one.
  function compare(period, p) {
    if (period === 'all') return '';
    const elapsed = daysBetween(p.start, new Date(Math.min(addDays(today(), 1), p.end)));
    const prevEnd = new Date(Math.min(addDays(p.prevStart, elapsed), p.start));
    const prev = summarize(between(p.prevStart, prevEnd)).total;
    if (!prev) return '';
    const cur = summarize(between(p.start, p.end)).total;
    const d = (cur - prev) / prev;
    return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${pct(Math.abs(d))}</span> vs. this point last ${period}`;
  }

  function goalCard() {
    const goal = data.settings.weeklyGoal;
    if (!goal) return '';
    const w = periodRange('week');
    const got = summarize(between(w.start, w.end)).total;
    const left = goal - got;
    const daysLeft = daysBetween(today(), w.end);
    const msg = left > 0 ? `${money(left)} to go · ${plural(daysLeft, 'day')} left this week` : 'Goal reached this week. Nice work!';
    return `<section class="card">
        <div class="card-head"><h2>Weekly goal</h2><span class="muted small">${money(got)} of ${money(goal)}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1, got / goal) * 100)}"><span style="width:${Math.min(1, Math.max(0, got / goal)) * 100}%"></span></div>
        <p class="sub" style="margin:8px 0 0">${msg}</p>
      </section>`;
  }

  function renderHistory() {
    const el = $('#view-history');
    if (!el.dataset.ready) {
      el.innerHTML = `<input type="search" id="q" placeholder="Search by job, notes, day or date" aria-label="Search shifts"><div id="history-filters"></div><div id="history-list" class="view"></div>`;
      el.dataset.ready = '1';
      $('#q').addEventListener('input', (e) => { ui.query = e.target.value; renderHistoryList(); });
    }
    if (!jobById(ui.jobFilter)) ui.jobFilter = '';
    $('#history-filters').innerHTML = data.jobs.length < 2 ? '' : `<div class="chips" role="group" aria-label="Filter by job">
        <button type="button" class="chip" data-filter-job="" aria-pressed="${!ui.jobFilter}">All jobs</button>
        ${data.jobs.map((j) => `<button type="button" class="chip" data-filter-job="${j.id}" aria-pressed="${ui.jobFilter === j.id}"><i class="dot" style="background:${j.color}"></i>${esc(j.name)}</button>`).join('')}
      </div>`;
    renderHistoryList();
  }

  function renderHistoryList() {
    const el = $('#history-list');
    const q = ui.query.trim().toLowerCase();
    const shifts = ui.jobFilter ? data.shifts.filter((s) => s.jobId === ui.jobFilter) : data.shifts;
    const list = q
      ? shifts.filter((s) => {
          const d = parseISO(s.date);
          return `${s.date} ${s.job} ${s.notes} ${WD_LONG[d.getDay()]} ${MO_LONG[d.getMonth()]}`.toLowerCase().includes(q);
        })
      : shifts;
    if (!list.length) {
      el.innerHTML = `<section class="card empty"><p class="muted">${q || ui.jobFilter ? 'No shifts match.' : 'No shifts yet. Tap + to log one.'}</p></section>`;
      return;
    }
    const groups = new Map();
    for (const s of list) {
      const k = s.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    el.innerHTML = [...groups].map(([k, arr]) => {
      const t = summarize(arr);
      const [y, m] = k.split('-').map(Number);
      return `<section>
          <div class="group-head"><h3>${MO_LONG[m - 1]} ${y}</h3><span>${money(t.total)} · ${plural(t.count, 'shift')}${t.hours ? ` · ${money(t.perHour)}/hr` : ''}</span></div>
          <div class="list card">${arr.map(shiftRow).join('')}</div>
        </section>`;
    }).join('');
  }

  function renderJobs() {
    const el = $('#view-jobs');
    const head = `<div class="card-head page-head"><h2 class="page-title">Your jobs</h2><button type="button" class="btn primary" data-action="new-job">+ Add job</button></div>`;
    if (!data.jobs.length) {
      el.innerHTML = `${head}<section class="card empty">
          <h2>Save your jobs</h2>
          <p>Add each place you work with its hourly wage, usual shift times and tip-out. When you log a shift, just tap the job and LYFE fills the rest in.</p>
          <button type="button" class="btn primary" data-action="new-job">Add your first job</button>
        </section>`;
      return;
    }
    el.innerHTML = head + data.jobs.map((j) => {
      const t = summarize(data.shifts.filter((s) => s.jobId === j.id));
      const defaults = [
        j.wage ? `${money(j.wage)}/hr wage` : 'No base wage',
        j.start && j.end ? `${fmtTime(j.start)} – ${fmtTime(j.end)}` : '',
        j.tipOutPct ? `${j.tipOutPct}% tip-out` : '',
      ].filter(Boolean).join(' · ');
      return `<section class="card job-card" style="--job:${j.color}">
          <div class="card-head">
            <div><h2>${esc(j.name)}</h2><small class="muted">${defaults}</small></div>
            <button type="button" class="btn sm" data-edit-job="${j.id}">Edit</button>
          </div>
          <div class="job-stats">
            <div><small>Take-home</small><b>${money(t.total)}</b></div>
            <div><small>Per hour</small><b>${t.hours ? money(t.perHour) : '—'}</b></div>
            <div><small>Shifts</small><b>${t.count}</b></div>
          </div>
          <button type="button" class="btn primary block" data-log-job="${j.id}">Log a shift here</button>
        </section>`;
    }).join('') + '<p class="muted small center">Changes to a job apply to new shifts. Renaming a job also renames its past shifts.</p>';
  }

  function renderInsights() {
    const el = $('#view-insights');
    if (!data.shifts.length) {
      el.innerHTML = `<section class="card empty"><h2>No insights yet</h2><p class="muted">Log a few shifts and LYFE will show which days pay best, your tip percentage, and more.</p><button type="button" class="btn primary" data-action="new">Log a shift</button></section>`;
      return;
    }
    const days = { 30: 30, 90: 90, 365: 365 }[ui.range] || 0;
    const list = between(days ? addDays(today(), 1 - days) : null, null);
    const t = summarize(list);
    const head = seg('range', [['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'All time']], ui.range);
    const trend = `<section class="card"><h2>Tips, last 12 months</h2>${chart('all', {})}</section>`;
    if (!list.length) {
      el.innerHTML = `${head}<section class="card empty"><p class="muted">No shifts in this range.</p></section>${trend}`;
      return;
    }

    const wd = weekdayStats(list);
    const order = Array.from({ length: 7 }, (_, i) => (i + data.settings.weekStart) % 7);
    const maxAvg = Math.max(1, ...wd.map((d) => d.avg));
    const best = wd.reduce((a, d) => (d.avg > a.avg ? d : a)).i;
    const rows = [
      ['Take-home', money(t.total)],
      ['Tips after tip-out', money(t.tips)],
      t.wages ? ['Wages', money(t.wages)] : null,
      ['Cash tips', money(t.cash)],
      ['Digital tips', money(t.digital)],
      t.tipOut ? ['Tipped out', money(t.tipOut)] : null,
      ['Hours worked', fmtHours(t.hours)],
      ['Per hour', t.hours ? money(t.perHour) : '—'],
      ['Shifts', t.count],
      t.sales ? ['Avg tip on sales', `${(t.tipPct * 100).toFixed(1)}%`] : null,
    ].filter(Boolean);

    el.innerHTML = `
      ${head}
      <section class="card"><h2>Highlights</h2><ul class="insights">${highlights(list, t, wd).map((n) => `<li>${n}</li>`).join('')}</ul></section>
      <section class="card">
        <div class="card-head"><h2>By day of week</h2><span class="muted small">avg per shift</span></div>
        <div class="hbars">${order.map((i) => {
          const d = wd[i];
          return `<div class="hbar${i === best && d.count ? ' best' : ''}">
              <span class="hbar-label">${WD[i]}</span>
              <span class="hbar-track"><span style="width:${(d.avg / maxAvg) * 100}%"></span></span>
              <span class="hbar-val">${d.count ? money(d.avg) : '—'}<small>${d.count ? `${d.hours ? `${money(d.perHour)}/hr · ` : ''}${plural(d.count, 'shift')}` : 'no shifts'}</small></span>
            </div>`;
        }).join('')}</div>
      </section>
      ${jobsCard(list)}
      <section class="card"><h2>Summary</h2><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>
      ${trend}`;
  }

  function highlights(list, t, wd) {
    const out = [];
    const ranked = wd.filter((d) => d.count >= 2).sort((a, b) => b.avg - a.avg);
    if (ranked.length >= 2) {
      const top = ranked[0];
      const lift = t.perShift ? top.avg / t.perShift - 1 : 0;
      out.push(`<b>${WD_LONG[top.i]}s</b> are your best day, averaging ${money(top.avg)} per shift${lift >= 0.05 ? `, ${pct(lift)} above your overall average` : ''}.`);
      const low = ranked[ranked.length - 1];
      out.push(`<b>${WD_LONG[low.i]}s</b> pay the least, averaging ${money(low.avg)} per shift.`);
      const hourly = wd.filter((d) => d.count >= 2 && d.hours).sort((a, b) => b.perHour - a.perHour)[0];
      if (hourly && hourly.i !== top.i) out.push(`Per hour, <b>${WD_LONG[hourly.i]}s</b> pay best at ${money(hourly.perHour)}/hr.`);
    } else {
      out.push('Log at least two shifts on different days of the week to see which days pay best.');
    }
    if (t.gross) out.push(`<b>${pct(t.cashShare)}</b> of your tips came in cash and ${pct(1 - t.cashShare)} were digital.`);
    if (t.sales) out.push(`Your tips average <b>${(t.tipPct * 100).toFixed(1)}%</b> of sales.`);
    if (t.tipOut && t.gross) out.push(`You tipped out ${money(t.tipOut)}, which is ${pct(t.tipOut / t.gross)} of your gross tips.`);
    const top = list.reduce((a, s) => (calc(s).total > calc(a).total ? s : a));
    out.push(`Your best shift was <b>${money(calc(top).total)}</b> on ${fmtDate(top.date)}${top.job ? ` at ${esc(top.job)}` : ''}.`);

    const now = today();
    const dayN = now.getDate();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mtd = summarize(between(new Date(now.getFullYear(), now.getMonth(), 1), addDays(now, 1))).total;
    if (mtd && dayN >= 7 && dayN < dim) out.push(`At this pace you’re on track for about <b>${money((mtd / dayN) * dim)}</b> this month.`);

    const ytd = summarize(between(new Date(now.getFullYear(), 0, 1), null));
    if (ytd.gross) out.push(`So far this year you’ve received ${money(ytd.cash)} in cash tips and ${money(ytd.digital)} in digital tips. All tips count as taxable income, and this log works as your daily tip record.`);
    return out;
  }

  function jobsCard(list) {
    const jobs = new Map();
    for (const s of list) {
      const k = s.job || 'Unlabeled';
      if (!jobs.has(k)) jobs.set(k, []);
      jobs.get(k).push(s);
    }
    if (jobs.size < 2) return '';
    const rows = [...jobs].map(([name, arr]) => ({ name, t: summarize(arr) })).sort((a, b) => b.t.total - a.t.total);
    return `<section class="card"><h2>By job</h2><dl class="kv">${rows.map(({ name, t }) =>
      `<dt>${esc(name)} <span class="small">· ${plural(t.count, 'shift')}</span></dt><dd>${money(t.total)}${t.hours ? ` <span class="muted small">${money(t.perHour)}/hr</span>` : ''}</dd>`).join('')}</dl></section>`;
  }

  function renderSettings() {
    const s = data.settings;
    const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
    $('#view-settings').innerHTML = `
      <section class="card">
        <h2>Pay</h2>
        <label class="field"><span>Default hourly wage <em>(when no job is picked)</em></span><input type="number" name="wage" inputmode="decimal" step="0.01" min="0" value="${s.wage || ''}" placeholder="0.00"></label>
        <label class="field"><span>Weekly take-home goal</span><input type="number" name="weeklyGoal" inputmode="decimal" step="1" min="0" value="${s.weeklyGoal || ''}" placeholder="No goal"></label>
        <label class="field" style="margin:0"><span>Currency</span><select name="currency">${CURRENCIES.map((c) => opt(c, c, s.currency)).join('')}</select></label>
      </section>
      <section class="card">
        <h2>Display</h2>
        <label class="field"><span>Week starts on</span><select name="weekStart">${opt(0, 'Sunday', s.weekStart)}${opt(1, 'Monday', s.weekStart)}</select></label>
        <label class="field" style="margin:0"><span>Theme</span><select name="theme">${opt('system', 'Match device', s.theme)}${opt('light', 'Light', s.theme)}${opt('dark', 'Dark', s.theme)}</select></label>
      </section>
      <section class="card">
        <h2>Your data</h2>
        <p class="muted small" style="margin:0 0 12px">Your shifts are stored only in this browser on this device. Back up regularly to iCloud Drive, Google Drive, Files or email. A backup file is the only copy that survives a cleared browser or a lost phone.</p>
        <dl class="kv small">
          <dt>Last backup</dt><dd>${lastBackupText()}</dd>
          <dt>Protected from auto-clearing</dt><dd>${ui.persisted ? 'Yes' : 'Not guaranteed'}</dd>
          <dt>Installed as an app</dt><dd>${isInstalled() ? 'Yes' : 'No'}</dd>
        </dl>
        ${isInstalled() ? '' : '<p class="muted small">Install LYFE to your home screen (iPhone: Share → Add to Home Screen) so the browser treats its data as app data and doesn’t clear it.</p>'}
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="backup">Back up now</button>
          <button type="button" class="btn" data-action="restore">Restore backup</button>
          <button type="button" class="btn" data-action="export-csv">Export CSV</button>
          <button type="button" class="btn" data-action="import-csv">Import CSV</button>
        </div>
        <button type="button" class="btn danger" data-action="wipe">Erase all data</button>
      </section>
      <p class="muted small center">LYFE · ${plural(data.shifts.length, 'shift')} and ${plural(data.jobs.length, 'job')} stored · press N to log a shift</p>`;
  }

  function render() {
    ({ home: renderHome, history: renderHistory, jobs: renderJobs, insights: renderInsights, settings: renderSettings })[ui.view]();
  }

  function route() {
    const v = location.hash.slice(1);
    ui.view = VIEWS.includes(v) ? v : 'home';
    for (const name of VIEWS) $(`#view-${name}`).hidden = name !== ui.view;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === ui.view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }

  // ---------- shift form ----------
  const dialog = $('#shift-dialog');
  const form = $('#shift-form');
  const preview = $('#form-preview');

  function openForm(id, jobId) {
    const s = id ? data.shifts.find((x) => x.id === id) : null;
    const f = form.elements;
    form.reset();
    ui.editing = s ? s.id : null;
    ui.autoFill = {};
    ui.tipOutManual = Boolean(s); // never recalculate a saved shift's tip-out on its own
    $('#form-title').textContent = s ? 'Edit shift' : 'Log shift';
    $('#delete-btn').hidden = !s;

    const blank = (n) => (n ? String(n) : '');
    f.date.value = s ? s.date : iso(today());
    f.start.value = s?.start || '';
    f.end.value = s?.end || '';
    f.hours.value = blank(s?.hours);
    f.cash.value = blank(s?.cash);
    f.digital.value = blank(s?.digital);
    f.tipOut.value = blank(s?.tipOut);
    f.sales.value = blank(s?.sales);
    f.wage.value = blank(s ? s.wage : data.settings.wage);
    f.notes.value = s?.notes || '';
    f.job.value = '';

    if (s) {
      // A shift whose job was deleted keeps its name as a one-off "orphan" choice.
      ui.formJob = jobById(s.jobId) ? s.jobId : s.job ? 'orphan' : '';
      ui.orphanName = ui.formJob === 'orphan' ? s.job : '';
      renderJobChips();
      applyTipOut();
      updatePreview();
    } else {
      ui.orphanName = '';
      const recent = data.shifts.find((x) => jobById(x.jobId));
      const pick = jobById(jobId) ? jobId : recent ? recent.jobId : data.jobs.length === 1 ? data.jobs[0].id : '';
      selectJob(pick);
    }
    dialog.showModal();
    if (!s && window.matchMedia('(pointer: fine)').matches) f.cash.focus();
  }

  function renderJobChips() {
    const chip = (val, label, color) =>
      `<button type="button" class="chip${val === 'new' ? ' add' : ''}" role="radio" aria-checked="${ui.formJob === val}" data-job="${val}">${color ? `<i class="dot" style="background:${color}"></i>` : ''}${label}</button>`;
    $('#job-chips').innerHTML = [
      ...data.jobs.map((j) => chip(j.id, esc(j.name), j.color)),
      ui.orphanName ? chip('orphan', esc(ui.orphanName), '') : '',
      chip('new', '+ New job', ''),
    ].join('');
    form.elements.job.hidden = ui.formJob !== 'new';
  }

  // Fills wage and usual hours from the chosen job. Start/end are only replaced when
  // empty or still holding values a previous job filled in, so typed times are kept.
  function selectJob(val) {
    const f = form.elements;
    ui.formJob = val;
    const job = jobById(val);
    if (job) {
      f.wage.value = job.wage ? String(job.wage) : '';
      for (const k of ['start', 'end']) {
        if (job[k] && (!f[k].value || f[k].value === ui.autoFill[k])) {
          f[k].value = job[k];
          ui.autoFill[k] = job[k];
        }
      }
      const h = hoursBetween(f.start.value, f.end.value);
      if (h != null) f.hours.value = h;
    } else if (!ui.editing && val !== 'orphan') {
      f.wage.value = data.settings.wage ? String(data.settings.wage) : '';
    }
    renderJobChips();
    applyTipOut();
    updatePreview();
    if (val === 'new') f.job.focus();
  }

  // Suggests tip-out from the job's % of sales until the tip-out is typed by hand.
  function applyTipOut() {
    const job = jobById(ui.formJob);
    const hint = $('#tipout-hint');
    if (!job || !job.tipOutPct) {
      hint.textContent = '';
      if (!ui.tipOutManual) form.elements.tipOut.value = ''; // drop a previous job's suggestion
      return;
    }
    hint.textContent = `${job.tipOutPct}% of sales`;
    if (ui.tipOutManual) return;
    const sales = parseAmount(form.elements.sales.value);
    form.elements.tipOut.value = sales > 0 ? String(round2((sales * job.tipOutPct) / 100)) : '';
  }

  function readAmounts() {
    const f = form.elements;
    const v = { hours: num(f.hours.value), wage: num(f.wage.value) };
    for (const k of AMOUNT_FIELDS) v[k] = parseAmount(f[k].value);
    return v;
  }

  function updatePreview() {
    const v = readAmounts();
    for (const k of ['cash', 'digital']) {
      const raw = form.elements[k].value.trim();
      const hasMath = /\d\s*[-+*x×]\s*\d/i.test(raw);
      form.querySelector(`.calc[data-for="${k}"]`).textContent = hasMath && !Number.isNaN(v[k]) ? `= ${money(v[k])}` : '';
    }
    if (AMOUNT_FIELDS.some((k) => Number.isNaN(v[k]))) {
      preview.innerHTML = '<span class="err">Amounts can only contain numbers and + or −.</span>';
      return;
    }
    const c = calc(v);
    preview.innerHTML = `
      <div><small>Tips after tip-out</small><b>${money(c.tips)}</b></div>
      <div><small>Take-home</small><b>${money(c.total)}</b></div>
      <div><small>Per hour</small><b>${v.hours ? money(c.total / v.hours) : '—'}</b></div>
      ${v.sales ? `<div><small>Tip %</small><b>${((c.gross / v.sales) * 100).toFixed(1)}%</b></div>` : ''}`;
  }

  form.addEventListener('input', (e) => {
    if (e.target.name === 'tipOut') ui.tipOutManual = true;
    if (e.target.name === 'sales') applyTipOut();
    if (e.target.name === 'start' || e.target.name === 'end') {
      const h = hoursBetween(form.elements.start.value, form.elements.end.value);
      if (h != null) form.elements.hours.value = h;
    }
    updatePreview();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const v = readAmounts();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.value)) { f.date.focus(); return toast('Pick a date for this shift'); }
    for (const k of AMOUNT_FIELDS) {
      if (Number.isNaN(v[k]) || v[k] < 0) { f[k].focus(); return toast('Amounts must be numbers of 0 or more'); }
    }
    if (v.hours > 24) { f.hours.focus(); return toast('Hours can’t be more than 24'); }

    let job = jobById(ui.formJob);
    let newJob = false;
    if (ui.formJob === 'new') {
      const name = f.job.value.trim();
      if (!name) { f.job.focus(); return toast('Name the new job, or pick a saved one'); }
      job = data.jobs.find((j) => j.name.toLowerCase() === name.toLowerCase());
      if (!job) {
        job = normalizeJob({ name, wage: v.wage, start: f.start.value, end: f.end.value, color: nextColor() });
        data.jobs.push(job);
        newJob = true;
      }
    }
    const jobName = job ? job.name : ui.formJob === 'orphan' ? ui.orphanName : '';

    const shift = normalize({ ...v, id: ui.editing || uid(), date: f.date.value, job: jobName, jobId: job ? job.id : '', start: f.start.value, end: f.end.value, notes: f.notes.value });
    const i = data.shifts.findIndex((s) => s.id === shift.id);
    if (i >= 0) data.shifts[i] = shift;
    else data.shifts.push(shift);
    const first = data.shifts.length === 1;
    save();
    dialog.close();
    render();
    toast(`${i >= 0 ? 'Shift updated' : `Saved: ${money(calc(shift).total)} take-home`}${newJob ? ` · ${job.name} added to Jobs` : ''}`);
    // Ask the browser not to evict our data. Safari otherwise clears site storage after weeks without a visit.
    if (first) protectStorage();
  });


  // ---------- job form ----------
  const jobDialog = $('#job-dialog');
  const jobForm = $('#job-form');

  function renderSwatches() {
    $('#swatches').innerHTML = COLORS.map((c) =>
      `<button type="button" class="swatch" role="radio" aria-checked="${ui.jobColor === c}" aria-label="Color ${c}" data-color="${c}" style="background:${c}"></button>`).join('');
  }

  function openJobForm(id) {
    const j = jobById(id);
    const f = jobForm.elements;
    jobForm.reset();
    ui.editingJob = j ? j.id : null;
    ui.jobColor = j ? j.color : nextColor();
    $('#job-title').textContent = j ? 'Edit job' : 'Add job';
    $('#delete-job-btn').hidden = !j;
    f.name.value = j?.name || '';
    f.wage.value = j?.wage ? String(j.wage) : data.settings.wage ? String(data.settings.wage) : '';
    f.tipOutPct.value = j?.tipOutPct ? String(j.tipOutPct) : '';
    f.start.value = j?.start || '';
    f.end.value = j?.end || '';
    renderSwatches();
    jobDialog.showModal();
    if (!j) f.name.focus();
  }

  jobForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = jobForm.elements;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return toast('Give the job a name'); }
    if (data.jobs.some((j) => j.id !== ui.editingJob && j.name.toLowerCase() === name.toLowerCase())) {
      f.name.focus();
      return toast(`You already have a job called ${name}`);
    }
    const pctVal = num(f.tipOutPct.value);
    if (pctVal < 0 || pctVal > 100) { f.tipOutPct.focus(); return toast('Tip-out must be between 0 and 100%'); }
    const job = normalizeJob({ id: ui.editingJob || undefined, name, wage: f.wage.value, tipOutPct: f.tipOutPct.value, start: f.start.value, end: f.end.value, color: ui.jobColor });
    const i = data.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) {
      data.jobs[i] = job;
      for (const s of data.shifts) if (s.jobId === job.id) s.job = job.name;
    } else {
      data.jobs.push(job);
    }
    save();
    jobDialog.close();
    render();
    toast(i >= 0 ? 'Job updated' : `${job.name} saved`);
  });

  function deleteJob(id) {
    const job = jobById(id);
    if (!job) return;
    const count = data.shifts.filter((s) => s.jobId === id).length;
    const msg = `Delete ${job.name}?${count ? ` Its ${plural(count, 'shift')} stay in your history.` : ''}`;
    if (!confirm(msg)) return;
    data.jobs = data.jobs.filter((j) => j.id !== id);
    for (const s of data.shifts) if (s.jobId === id) s.jobId = '';
    save();
    jobDialog.close();
    render();
    toast(`${job.name} deleted`);
  }

  for (const d of [dialog, jobDialog]) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  function deleteShift(id) {
    const i = data.shifts.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [removed] = data.shifts.splice(i, 1);
    save();
    render();
    toast('Shift deleted', { label: 'Undo', run: () => { data.shifts.push(removed); save(); render(); } });
  }

  // ---------- import / export ----------
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const CSV_COLS = ['date', 'job', 'start', 'end', 'hours', 'cash', 'digital', 'tip_out', 'sales', 'wage', 'net_tips', 'take_home', 'notes'];

  function exportCSV() {
    if (!data.shifts.length) return toast('Nothing to export yet');
    const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = data.shifts.map((s) => {
      const c = calc(s);
      return [s.date, s.job, s.start, s.end, s.hours, s.cash, s.digital, s.tipOut, s.sales, s.wage, round2(c.tips), round2(c.total), s.notes].map(q).join(',');
    });
    download(`lyfe-shifts-${iso(today())}.csv`, [CSV_COLS.join(','), ...rows].join('\n'), 'text/csv');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim()));
  }

  function importCSV(text) {
    const [head, ...rows] = parseCSV(text.replace(/^﻿/, ''));
    const idx = Object.fromEntries((head || []).map((h, i) => [h.trim().toLowerCase().replace(/[\s-]+/g, '_'), i]));
    if (!('date' in idx)) throw new Error('The CSV needs a "date" column (YYYY-MM-DD).');
    const get = (r, ...names) => { for (const n of names) if (n in idx) return r[idx[n]] ?? ''; return ''; };
    const sig = (s) => [s.date, s.job, s.cash, s.digital].join('|');
    const existing = new Set(data.shifts.map(sig));
    let added = 0;
    let skipped = 0;
    for (const r of rows) {
      const s = normalize({
        date: get(r, 'date').trim(), job: get(r, 'job'), start: get(r, 'start').trim(), end: get(r, 'end').trim(),
        hours: get(r, 'hours'), cash: get(r, 'cash', 'cash_tips'), digital: get(r, 'digital', 'digital_tips', 'card', 'card_tips', 'credit'),
        tipOut: get(r, 'tip_out', 'tipout'), sales: get(r, 'sales'), wage: get(r, 'wage', 'hourly_wage'), notes: get(r, 'notes'),
      });
      if (!s || existing.has(sig(s))) { skipped++; continue; }
      existing.add(sig(s));
      data.shifts.push(s);
      added++;
    }
    linkJobs(data);
    save();
    render();
    toast(`Imported ${plural(added, 'shift')}${skipped ? `, skipped ${skipped} duplicate or invalid` : ''}`);
  }

  // On phones this opens the share sheet so the file can go straight to iCloud Drive,
  // Google Drive, Files or email; elsewhere it downloads the file.
  async function backup() {
    const name = `lyfe-backup-${iso(today())}.json`;
    const text = JSON.stringify({ app: 'LYFE', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
    const file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare?.({ files: [file] }) && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ files: [file], title: 'LYFE backup' });
      } catch (err) {
        if (err.name === 'AbortError') return; // closed the share sheet without saving
        download(name, text, 'application/json');
      }
    } else {
      download(name, text, 'application/json');
    }
    data.lastBackupAt = Date.now();
    save(false);
    render();
    toast(`Backup saved: ${plural(data.shifts.length, 'shift')}, ${plural(data.jobs.length, 'job')}`);
  }

  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // Asks the browser to exempt our storage from automatic eviction.
  async function protectStorage() {
    if (!navigator.storage?.persisted) return;
    try {
      ui.persisted = await navigator.storage.persisted();
      if (!ui.persisted && data.shifts.length) ui.persisted = await navigator.storage.persist();
    } catch { /* unsupported; leave as not guaranteed */ }
    if (ui.view === 'settings') render();
  }

  function restore(text) {
    const obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.shifts)) throw new Error('That file isn’t a LYFE backup.');
    const restored = hydrate(obj);
    if (!confirm(`Replace your ${plural(data.shifts.length, 'shift')} with the ${plural(restored.shifts.length, 'shift')} in this backup?`)) return;
    data = restored;
    data.lastBackupAt = Date.now(); // the data now matches a backup file
    save();
    makeFormatter();
    applyTheme();
    render();
    toast('Backup restored');
  }

  const fileInput = $('#file-input');
  let fileMode = null;
  function pickFile(mode, accept) {
    fileMode = mode;
    fileInput.accept = accept;
    fileInput.value = '';
    fileInput.click();
  }
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (fileMode === 'restore') restore(text);
      else importCSV(text);
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file couldn’t be read.' : err.message);
    }
  });

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { el.hidden = true; action.run(); });
      el.append(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2500);
  }

  // ---------- global events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-edit],[data-seg],[data-plus],[data-job],[data-edit-job],[data-log-job],[data-filter-job],[data-color]');
    if (!t) return;
    if (t.dataset.edit) return openForm(t.dataset.edit);
    if (t.dataset.job) return selectJob(t.dataset.job === ui.formJob && t.dataset.job !== 'new' ? '' : t.dataset.job);
    if (t.dataset.editJob) return openJobForm(t.dataset.editJob);
    if (t.dataset.logJob) return openForm(null, t.dataset.logJob);
    if ('filterJob' in t.dataset) { ui.jobFilter = t.dataset.filterJob; return renderHistory(); }
    if (t.dataset.color) { ui.jobColor = t.dataset.color; return renderSwatches(); }
    if (t.dataset.seg) { ui[t.dataset.seg] = t.dataset.value; return render(); }
    if (t.dataset.plus) {
      const input = form.elements[t.dataset.plus];
      if (input.value.trim() && !/[-+]\s*$/.test(input.value)) input.value = `${input.value.trim()}+`;
      input.focus();
      return updatePreview();
    }
    switch (t.dataset.action) {
      case 'new': openForm(); break;
      case 'new-job': openJobForm(); break;
      case 'close-job': jobDialog.close(); break;
      case 'delete-job': deleteJob(ui.editingJob); break;
      case 'cancel': dialog.close(); break;
      case 'delete': dialog.close(); deleteShift(ui.editing); break;
      case 'backup': backup(); break;
      case 'restore': pickFile('restore', '.json,application/json'); break;
      case 'export-csv': exportCSV(); break;
      case 'import-csv': pickFile('csv', '.csv,text/csv'); break;
      case 'wipe':
        if (!data.shifts.length && !data.jobs.length) { toast('There’s nothing to erase'); break; }
        if (confirm(`Erase all ${plural(data.shifts.length, 'shift')}, ${plural(data.jobs.length, 'job')} and settings from this device? Download a backup first if you might want them back.`)) {
          data = { shifts: [], settings: { ...DEFAULTS }, jobs: [], updatedAt: 0, lastBackupAt: 0 };
          save(); makeFormatter(); applyTheme(); render();
          toast('All data erased');
        }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (!inp.closest('#view-settings') || !inp.name) return;
    let v = inp.value;
    if (inp.name === 'wage' || inp.name === 'weeklyGoal') v = Math.max(0, num(v));
    if (inp.name === 'weekStart') v = Number(v);
    data.settings[inp.name] = v;
    save();
    makeFormatter();
    applyTheme();
    toast('Settings saved');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key || '').toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || dialog.open || jobDialog.open) return;
    if (e.target.closest('input, textarea, select')) return;
    e.preventDefault();
    openForm();
  });

  // Keep multiple open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    data = load();
    makeFormatter();
    applyTheme();
    render();
  });

  window.addEventListener('hashchange', route);

  // ---------- start ----------
  makeFormatter();
  applyTheme();
  $('#today-label').textContent = fmtDate(iso(today()));
  route();
  protectStorage();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
