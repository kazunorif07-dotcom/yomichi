'use strict';
/* =========================================================
   ヨミチ — 読書記録アプリ（段階4）
   このファイルの構成:
     1. 定数（分野・状態・表紙の色など、変わらない一覧）
     2. データの読み書き（端末の localStorage に保存）
     3. 日付と計算（今週の合計・連続日数・進捗・読了予測）
     4. 画面の部品（表紙・進捗バー・記録の行）
     5. 画面の描画（ホーム／本棚／記録一覧）
     6. ボトムシート（本の登録・詳細・記録・設定）
     7. 読書タイマー
     8. お祝い（紙吹雪）とお知らせ
     9. ボタン操作の受け付けと起動
   ========================================================= */

/* ---------- 1. 定数 ---------- */
const FIELDS = [
  '物理学・宇宙', '生物・進化', '化学・素材', '数学・統計', 'コンピュータ・AI', '工学・エネルギー',
  '経済学', '金融・投資', '経営・起業', '心理学・認知科学', '社会学・人類学', '政治・公共政策',
  '歴史', '哲学・倫理', '宗教', '文学・小説', '芸術・デザイン', '医学・健康',
];
// 自動生成する表紙の色（分野ごと）。白い文字が読める濃さにしてある。
const FIELD_COLORS = {
  '物理学・宇宙': '#27347F', '生物・進化': '#23845A', '化学・素材': '#0B8A96', '数学・統計': '#4453CF',
  'コンピュータ・AI': '#2B3445', '工学・エネルギー': '#C4600F', '経済学': '#B8322A', '金融・投資': '#8C6A08',
  '経営・起業': '#C8440E', '心理学・認知科学': '#8440A6', '社会学・人類学': '#99502A', '政治・公共政策': '#33475E',
  '歴史': '#7D5128', '哲学・倫理': '#574A8A', '宗教': '#8E6229', '文学・小説': '#B8195A',
  '芸術・デザイン': '#C92C80', '医学・健康': '#00796B',
};
const STATUSES = [
  { id: 'reading', label: '読書中' },
  { id: 'want', label: '積読' },   // 持っているけど、まだ読んでいない本
  { id: 'wish', label: '欲しい' },  // まだ持っていない、読みたい本
  { id: 'done', label: '読了' },
  { id: 'paused', label: '中断' },
];
const LANGS = [{ id: 'ja', label: '日本語' }, { id: 'en', label: '英語' }];
const POSITIONS = [
  { id: 'trunk', label: '幹', desc: '入門・古典' },
  { id: 'branch', label: '枝', desc: '応用' },
  { id: 'leaf', label: '葉', desc: '専門・細部' },
];
const STATUS_ORDER = { reading: 0, want: 1, wish: 2, paused: 3, done: 4 };

// 知の地図の「大陸」。18分野を4つのまとまりに分ける
const CONTINENTS = [
  { name: '自然科学', fields: ['物理学・宇宙', '生物・進化', '化学・素材', '数学・統計', '医学・健康'] },
  { name: 'テクノロジー', fields: ['コンピュータ・AI', '工学・エネルギー'] },
  { name: '社会・人間', fields: ['経済学', '金融・投資', '経営・起業', '心理学・認知科学', '社会学・人類学', '政治・公共政策'] },
  { name: '人文・芸術', fields: ['歴史', '哲学・倫理', '宗教', '文学・小説', '芸術・デザイン'] },
];

// ネット検索の分類（英語）から、このアプリの分野を推測する。上から順に当てはめる。
const FIELD_RULES = [
  [/physics|astronom|cosmolog|space|物理|宇宙/i, '物理学・宇宙'],
  [/biolog|evolution|life science|nature|genetic|生物|進化/i, '生物・進化'],
  [/chemi|material|化学/i, '化学・素材'],
  [/math|statist|数学|統計/i, '数学・統計'],
  [/computer|programming|artificial|software|data|コンピュータ|プログラ/i, 'コンピュータ・AI'],
  [/medical|health|fitness|medicine|医/i, '医学・健康'],
  [/engineer|technolog|energy|工学/i, '工学・エネルギー'],
  [/invest|finance|money|金融|投資/i, '金融・投資'],
  [/business|management|entrepreneur|経営|起業/i, '経営・起業'],
  [/economics|経済/i, '経済学'],
  [/psycholog|self-help|心理/i, '心理学・認知科学'],
  [/political|law|government|政治|法/i, '政治・公共政策'],
  [/social|sociolog|anthropolog|社会/i, '社会学・人類学'],
  [/history|歴史/i, '歴史'],
  [/philosoph|哲学/i, '哲学・倫理'],
  [/religio|bible|buddhis|宗教/i, '宗教'],
  [/fiction|poetry|literar|drama|novel|小説|文学/i, '文学・小説'],
  [/\bart|design|music|photograph|architect|芸術|デザイン/i, '芸術・デザイン'],
];
function guessField(text) {
  const hit = FIELD_RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : '';
}
const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || '';

/* ---------- 2. データの読み書き ---------- */
// 保存場所の名前は段階1から変えない（変えると、入れたデータが見えなくなるため）。
const STORAGE_KEY = 'chizucho-data-v1';

function emptyData() {
  return {
    version: 2,
    books: [],     // 本の一覧
    sessions: [],  // 読書の記録（1回分ずつ）
    notes: [],     // メモ（段階4で使う）
    timer: null,   // 動いているタイマー（アプリを閉じても続きから再開できるよう保存）
    settings: { yearGoal: 24, dailyGoal: 20 },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const saved = JSON.parse(raw);
    const base = emptyData();
    return { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  } catch (e) {
    return emptyData();
  }
}

let data = loadData();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    toast('この端末に保存できませんでした。プライベートブラウズでは保存されません。');
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- 3. 日付と計算 ---------- */
// 日付は "2026-11-08" の形の文字で保存する（並べ替えや比較がしやすい）。
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const todayStr = () => toDateStr(new Date());
function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7)); // 月曜はじまり
const daysBetween = (a, b) => Math.round((parseDate(toDateStr(b)) - parseDate(toDateStr(a))) / 86400000);

function fmtMinutes(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
function fmtDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}
const fmtMonthDay = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;

const bookById = (id) => data.books.find((b) => b.id === id);
const sessionPages = (s) => Math.max(0, (s.endPage || 0) - (s.startPage || 0));
// 読む速さ（ページ/時）
const speedOf = (pages, minutes) => (minutes > 0 ? Math.round((pages / minutes) * 60) : 0);

// その本でいちばん先まで読んだページ
function lastPageOf(bookId) {
  let max = 0;
  for (const s of data.sessions) if (s.bookId === bookId && s.endPage > max) max = s.endPage;
  return max;
}

// 進み具合（0〜100%）
function progressOf(b) {
  if (b.status === 'done') return 100;
  return Math.min(100, Math.round((lastPageOf(b.id) / b.totalPages) * 100));
}

// ある期間（start から days 日間）の合計
function summarize(start, days) {
  const from = toDateStr(start);
  const to = toDateStr(addDays(start, days));
  const list = data.sessions.filter((s) => s.date >= from && s.date < to);
  return {
    minutes: list.reduce((a, s) => a + (s.minutes || 0), 0),
    pages: list.reduce((a, s) => a + sessionPages(s), 0),
    days: new Set(list.map((s) => s.date)).size,
  };
}
const minutesOn = (dateStr) => summarize(parseDate(dateStr), 1).minutes;

// 連続読書日数。今日まだ読んでいなくても、昨日まで続いていれば途切れていない扱い。
function streakInfo() {
  const days = new Set(data.sessions.map((s) => s.date));
  const todayRead = days.has(todayStr());
  let d = todayRead ? new Date() : addDays(new Date(), -1);
  let current = 0;
  while (days.has(toDateStr(d))) { current++; d = addDays(d, -1); }
  // 過去最高
  let best = 0, run = 0, prev = null;
  for (const ds of [...days].sort()) {
    run = prev && daysBetween(parseDate(prev), parseDate(ds)) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = ds;
  }
  return { current, todayRead, best };
}

// 読了予測：直近14日（読み始めがそれより新しければ読み始めから）のペースで計算
function forecastOf(b) {
  if (b.status === 'done') return null;
  const remaining = b.totalPages - lastPageOf(b.id);
  const list = data.sessions.filter((s) => s.bookId === b.id);
  if (remaining <= 0 || !list.length) return null;
  const today = new Date();
  const first = parseDate(list.reduce((m, s) => (s.date < m ? s.date : m), list[0].date));
  const from = first > addDays(today, -13) ? first : addDays(today, -13);
  const days = daysBetween(from, today) + 1;
  const pages = list.filter((s) => s.date >= toDateStr(from)).reduce((a, s) => a + sessionPages(s), 0);
  if (pages <= 0) return null;
  const perDay = pages / days;
  const daysLeft = Math.ceil(remaining / perDay);
  return { date: addDays(today, daysLeft), daysLeft, perDay };
}

// 今年の読書チャレンジ（目標冊数と達成率、予定どおりのペースとの差）
function yearGoalInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const goal = data.settings.yearGoal;
  const done = data.books.filter((b) => b.status === 'done' && b.finishedAt && b.finishedAt.startsWith(String(year))).length;
  const dayOfYear = daysBetween(new Date(year, 0, 1), now) + 1;
  const daysInYear = daysBetween(new Date(year, 0, 1), new Date(year + 1, 0, 1));
  const expected = (goal * dayOfYear) / daysInYear;
  const gap = done - expected;
  const note = done >= goal ? '目標達成！おめでとう'
    : gap >= 1 ? `予定より${Math.floor(gap)}冊リード中`
    : gap > -1 ? 'ちょうど予定どおりのペース'
    : `予定まであと${Math.ceil(-gap)}冊`;
  return { year, goal, done, pct: Math.round((done / goal) * 100), expectedPct: Math.min(100, (expected / goal) * 100), note };
}

// 分野ごとの集計（知の地図とグラフで使う）
function fieldStats() {
  return FIELDS.map((field) => {
    const books = data.books.filter((b) => b.field === field);
    const done = books.filter((b) => b.status === 'done');
    return {
      field, books, done: done.length,
      reading: books.filter((b) => b.status === 'reading').length,
      tsundoku: books.filter((b) => b.status === 'want').length,
      trunkDone: done.some((b) => b.position === 'trunk'),
    };
  });
}

// 新しい順に並べた記録
function sortedSessions(list = data.sessions) {
  return [...list].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

// 文字を画面に安全に表示する（< などを無害な形に変える）
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const $ = (sel) => document.querySelector(sel);

/* ---------- 4. 画面の部品 ---------- */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
};

// 「本題 : 副題 上」を、本題（＋巻）と副題に分ける
function splitTitle(t = '') {
  const m = String(t).match(/^(.*?)\s*[:：]\s*(.*?)(\s+(?:上|中|下|[0-9０-９]+))?$/);
  if (!m) return [t, ''];
  return [m[1] + (m[3] || ''), m[2]];
}
const mainTitle = (t) => splitTitle(t)[0];
const subTitle = (t) => splitTitle(t)[1];

// 分野の色と「幹・枝・葉」の模様で、本ごとの表紙を自動でつくる。
// 写真やネットの表紙があればそれを重ねて表示。画像が読めなければ自動の表紙に戻る。
function coverHtml(b, size = '') {
  const pos = POSITIONS.find((p) => p.id === b.position);
  const img = b.coverData || b.coverUrl;
  return `<div class="cover ${size ? `cover-${size}` : ''} pat-${b.position || 'trunk'} ${img ? 'cover-img' : ''}" style="--cover:${FIELD_COLORS[b.field] || '#4A4F5C'}" aria-hidden="true">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <span class="cover-title">${esc(mainTitle(b.title))}${subTitle(b.title) ? `<small>${esc(subTitle(b.title))}</small>` : ''}</span>
      <span class="cover-author">${esc((b.author || '').split('、')[0])}</span>
      ${pos ? `<span class="cover-pos">${pos.label}</span>` : ''}
    </div>`;
}

function progressHtml(b) {
  const pct = progressOf(b);
  return `<div class="progress-row">
      <div class="progress ${pct >= 100 ? 'done' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="進み具合"><i style="width:${pct}%"></i></div>
      <span class="pct">${pct}%</span>
    </div>`;
}

function logItemHtml(s, showDate = false) {
  const b = bookById(s.bookId);
  const pages = sessionPages(s);
  const speed = speedOf(pages, s.minutes);
  return `
    <div class="log-item">
      ${b ? coverHtml(b, 'xs') : '<span></span>'}
      <div class="log-main">
        <span class="log-book">${esc(b ? b.title : '（削除された本）')}</span>
        <span class="log-meta">${s.source === 'timer' ? '<span class="log-tag">タイマー</span>' : ''}${showDate ? `${fmtDate(s.date)}・` : ''}${fmtMinutes(s.minutes)}・${pages}p${speed ? `・時速${speed}p` : ''}</span>
      </div>
      <button class="del-btn" data-action="delete-session" data-id="${s.id}">削除</button>
    </div>`;
}

function flameSvg(on) {
  return `<svg class="flame ${on ? '' : 'off'}" viewBox="0 0 34 40" aria-hidden="true">
      <path class="flame-outer" d="M17 1c2 8 12 12 12 24a12 12 0 0 1-24 0c0-6 3-9 5-12 0 4 2 6 4 6-2-7 1-13 3-18z"/>
      <path class="flame-inner" d="M17 20c1 4 6 6 6 11a6 6 0 0 1-12 0c0-4 4-6 6-11z"/>
    </svg>`;
}

function ringSvg(fraction, r = 32, stroke = 9) {
  const c = 2 * Math.PI * r;
  const size = (r + stroke) * 2;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, fraction))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

/* ---------- 5. 画面の描画 ---------- */
let currentView = 'home';
let bookFilter = 'all';
let shelfMode = 'books'; // 本棚タブの表示：'books'（本）か 'notes'（メモ）

function render() {
  if (currentView === 'home') renderHome();
  if (currentView === 'books') renderBooks();
  if (currentView === 'history') renderHistory();
  if (currentView === 'map') renderMap();
  if (currentView === 'stats') renderStats();
  renderPlayer();
}

function renderHome() {
  const el = $('#view-home');
  if (data.books.length === 0) {
    const demo = [
      { title: '宇宙は何でできているのか', field: '物理学・宇宙', position: 'trunk', r: '-6deg' },
      { title: '進化の意味', field: '生物・進化', position: 'branch', r: '3deg' },
      { title: '思考の技法', field: '心理学・認知科学', position: 'leaf', r: '-2deg' },
    ];
    el.innerHTML = `
      <div class="hero">
        <div class="hero-covers">${demo.map((d) => `<div style="--r:${d.r}">${coverHtml(d)}</div>`).join('')}</div>
        <h2>読んだ本で、自分だけの知の地図をつくろう。</h2>
        <p>タイマーで読書時間を記録して、毎日の連続記録をのばそう。読んだ分野が増えるほど、地図が広がります。</p>
        <button class="btn btn-primary btn-block" data-action="add-book">最初の1冊を登録する</button>
        <button class="btn btn-ghost btn-block" data-action="load-sample">サンプルデータで試す</button>
      </div>`;
    return;
  }

  const goal = data.settings.dailyGoal;
  const today = todayStr();
  const todayMin = minutesOn(today);
  const st = streakInfo();
  const ws = weekStart(new Date());
  const week = summarize(ws, 7);
  const lastWeek = summarize(addDays(ws, -7), 7);
  const diff = week.minutes - lastWeek.minutes;
  const compare = lastWeek.minutes === 0 ? (week.minutes ? '先週は記録なし' : '')
    : `先週より ${diff >= 0 ? '+' : '−'}${fmtMinutes(Math.abs(diff))}（先週 ${fmtMinutes(lastWeek.minutes)}）`;
  const yr = yearGoalInfo();

  // 今週のミニ棒グラフ（目標の線つき）
  const mins = Array.from({ length: 7 }, (_, i) => minutesOn(toDateStr(addDays(ws, i))));
  const top = Math.max(goal * 1.25, ...mins);
  const barsH = 78; // 棒が使える高さ(px)。下の曜日ラベル分を除く
  const bars = mins.map((m, i) => {
    const ds = toDateStr(addDays(ws, i));
    const cls = ['wbar', m > 0 ? 'read' : '', m >= goal ? 'met' : '', ds === today ? 'today' : ''].join(' ');
    return `<div class="${cls}" title="${m}分"><div class="wbar-fill" style="height:${Math.round((m / top) * barsH)}px"></div><span>${'月火水木金土日'[i]}</span></div>`;
  }).join('');

  const streakNote = st.todayRead ? '今日も読みました'
    : st.current > 0 ? `今日読めば${st.current + 1}日に` : '今日から始めよう';
  const ringNote = todayMin >= goal ? '目標達成！' : `あと${goal - todayMin}分`;

  const reading = data.books.filter((b) => b.status === 'reading');
  const recent = sortedSessions().slice(0, 4);

  const world = worldStats();
  el.innerHTML = `
    <button class="home-realm" data-action="go" data-view="map" aria-label="知の版図 ${world.pct}%。押すと地図を開く">
      <div class="home-realm-head">
        <span class="tile-label">あなたの知の版図</span>
        <span class="home-realm-pct"><span class="big">${world.pct}</span><small>%</small></span>
      </div>
      ${worldMapSvg({ mini: true })}
      <span class="home-realm-foot">${(() => { const c = empireCompare(world.conquered); return c.passed ? `${c.passed.name}超え・` : ''; })()}${fieldStats().filter((s) => s.done).length}／18か国に進出・地図を開く →</span>
    </button>
    <div class="bento">
      <div class="tile tile-coral">
        <span class="tile-label">連続読書</span>
        <div class="streak-row"><span class="big">${st.current}</span><small>日</small>${flameSvg(st.todayRead)}</div>
        <span class="tile-note">${streakNote}</span>
      </div>
      <button class="tile tile-blue" data-action="settings" aria-label="今日の目標 ${todayMin}分／${goal}分。押すと目標を変更">
        <span class="tile-label">今日の目標</span>
        <div class="ring-tile">${ringSvg(todayMin / goal)}
          <div class="ring-text"><span class="big">${todayMin}</span><small>／${goal}分</small></div>
        </div>
        <span class="tile-note">${ringNote}</span>
      </button>
      <button class="tile tile-wide tile-butter" data-action="settings" aria-label="今年の目標 ${yr.done}冊／${yr.goal}冊。押すと目標を変更">
        <div class="year-head">
          <span class="tile-label">${yr.year}年の読書チャレンジ</span>
          <span class="year-pct big">${yr.pct}<small>%</small></span>
        </div>
        <div class="year-row"><span class="big">${yr.done}</span><small>／${yr.goal}冊 読了</small></div>
        <div class="year-bar" aria-hidden="true"><i style="width:${Math.min(100, yr.pct)}%"></i><b style="left:${yr.expectedPct}%"></b></div>
        <span class="tile-note">${yr.note}</span>
      </button>
      <div class="tile tile-wide">
        <div class="week-head">
          <span class="tile-label">今週（${ws.getMonth() + 1}/${ws.getDate()}〜）</span>
          <div class="week-nums">
            <span class="big">${timeHtml(week.minutes)}</span>
            <span><span class="big">${week.pages}</span><small>ページ</small></span>
          </div>
        </div>
        ${compare ? `<span class="compare ${diff >= 0 ? 'up' : 'down'}">${compare}</span>` : ''}
        <div class="week-bars" aria-label="曜日ごとの読書分数">
          <div class="goal-line" style="bottom:${Math.round((goal / top) * barsH) + 22}px" aria-hidden="true"></div>
          ${bars}
        </div>
      </div>
    </div>

    ${dailyNoteHtml()}
    ${towerTeaserHtml()}

    <section class="section">
      <div class="section-head"><h2 class="section-title">読書中</h2>
        <button class="link-btn" data-action="go" data-view="books">本棚へ</button></div>
      ${reading.length ? `<div class="carousel">${reading.map(nowCardHtml).join('')}</div>`
        : `<p class="empty-small">読書中の本はありません。本棚から本を選んで「タイマーで読む」を押すと、ここに並びます。</p>`}
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">最近の記録</h2>
        ${data.sessions.length ? `<button class="link-btn" data-action="go" data-view="history">すべて見る</button>` : ''}
      </div>
      ${recent.length ? `<div class="list">${recent.map((s) => logItemHtml(s, true)).join('')}</div>`
        : `<p class="empty-small">まだ記録がありません。下の「＋」から始めよう。</p>`}
    </section>`;
}

// 「2時間5分」を、大きな数字＋小さな単位で表示
function timeHtml(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}<small>分</small>`;
  return `${h}<small>時間</small>${m ? `${m}<small>分</small>` : ''}`;
}

function nowCardHtml(b) {
  const f = forecastOf(b);
  return `
    <div class="now-card">
      <div data-action="open-book" data-id="${b.id}" style="cursor:pointer">${coverHtml(b)}</div>
      <div class="now-info">
        <span class="now-title" data-action="open-book" data-id="${b.id}">${esc(b.title)}</span>
        <span class="now-sub">${lastPageOf(b.id)} / ${b.totalPages}ページ${f ? `・${fmtMonthDay(f.date)}ごろ読了` : ''}</span>
        ${progressHtml(b)}
        <button class="btn btn-primary btn-small" data-action="start-timer" data-id="${b.id}">${ICONS.play}続きを読む</button>
      </div>
    </div>`;
}

function renderBooks() {
  const el = $('#view-books');
  const books = data.books
    .filter((b) => bookFilter === 'all' || b.status === bookFilter)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));
  const count = (id) => data.books.filter((b) => b.status === id).length;
  const filters = [{ id: 'all', label: 'すべて' }, ...STATUSES]
    .map((f) => `<button class="filter" data-action="filter" data-status="${f.id}" aria-pressed="${bookFilter === f.id}">${f.label} <span class="num">${f.id === 'all' ? data.books.length : count(f.id)}</span></button>`)
    .join('');

  const tabs = segHtml('shelf-mode', [{ id: 'books', label: `本 ${data.books.length}` }, { id: 'tower', label: 'タワー' }, { id: 'notes', label: `メモ ${data.notes.length}` }], shelfMode);
  if (shelfMode !== 'books') {
    el.innerHTML = `<div class="section-head"><h2 class="section-title">本棚</h2></div>${tabs}${shelfMode === 'notes' ? notesListHtml() : towerHtml()}`;
    return;
  }
  el.innerHTML = `
    <div class="section-head"><h2 class="section-title">本棚</h2></div>
    ${tabs}
    <div class="filters" role="toolbar" aria-label="状態で絞り込み">${filters}</div>
    ${books.length ? `<div class="shelf">${books.map((b) => `
        <button class="shelf-item" data-action="open-book" data-id="${b.id}">
          ${coverHtml(b)}
          <span class="shelf-title">${esc(b.title)}</span>
          ${b.status === 'reading' ? progressHtml(b)
            : `<span class="badge ${b.status === 'done' ? 'badge-done' : ''}">${labelOf(STATUSES, b.status)}</span>`}
          ${b.sample ? '<span class="badge badge-sample">サンプル</span>' : ''}
        </button>`).join('')}</div>`
      : `<p class="empty-small">${data.books.length ? 'この状態の本はありません。' : 'まだ本がありません。'}</p>`}
    <button class="btn btn-primary btn-block" data-action="add-book">＋ 本を登録する</button>
    ${data.books.some((b) => b.sample) ? `<button class="btn btn-danger btn-small" data-action="clear-sample">サンプルデータをすべて消す</button>` : ''}`;
}

function renderHistory() {
  const el = $('#view-history');
  const list = sortedSessions();
  if (!list.length) { el.innerHTML = `<p class="empty-small">まだ記録がありません。</p>`; return; }
  const groups = [];
  for (const s of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.date) last.items.push(s);
    else groups.push({ date: s.date, items: [s] });
  }
  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">記録の一覧（${list.length}件）</h2>
      <button class="link-btn" data-action="go" data-view="home">ホームへ戻る</button>
    </div>
    ${groups.map((g) => `
      <div class="log-group">
        <span class="log-date">${fmtDate(g.date)}・${fmtMinutes(g.items.reduce((a, s) => a + s.minutes, 0))}</span>
        ${g.items.map((s) => logItemHtml(s)).join('')}
      </div>`).join('')}`;
}

/* ---------- 知の版図（六角形の世界地図） ---------- */
// 18分野がそれぞれ「国」。国は六角形7マス（首都＋まわり6マス）。
// 本を読了するたびに、首都から外側へ領土が広がる。幹の本を読むと首都に城が建つ。
const SHORT = {
  '物理学・宇宙': '物理', '生物・進化': '生物', '化学・素材': '化学', '数学・統計': '数学', 'コンピュータ・AI': 'AI',
  '工学・エネルギー': '工学', '経済学': '経済', '金融・投資': '金融', '経営・起業': '経営', '心理学・認知科学': '心理',
  '社会学・人類学': '社会', '政治・公共政策': '政治', '歴史': '歴史', '哲学・倫理': '哲学', '宗教': '宗教',
  '文学・小説': '文学', '芸術・デザイン': '芸術', '医学・健康': '医学',
};
// 首都から広がる順番（首都→右→右上→左上→左→左下→右下）。六角形の座標は「軸座標(q, r)」。
const FLOWER = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const HEX_DIRS = FLOWER.slice(1);
// 大陸ごとの国の配置（格子の番号 a, b）。国どうしがすき間なく並び、大陸の間は海になる。
const WORLD = [
  { name: '人文・芸術', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 2]], fields: ['哲学・倫理', '歴史', '宗教', '文学・小説', '芸術・デザイン'] },
  { name: '自然科学', cells: [[4, -1], [5, -1], [3, 0], [4, 0], [3, 1]], fields: ['物理学・宇宙', '数学・統計', '化学・素材', '生物・進化', '医学・健康'] },
  { name: '社会・人間', cells: [[0, 3], [1, 3], [-1, 4], [0, 4], [1, 4], [-1, 5]], fields: ['心理学・認知科学', '社会学・人類学', '政治・公共政策', '経済学', '経営・起業', '金融・投資'] },
  { name: 'テクノロジー', cells: [[3, 3], [4, 3]], fields: ['コンピュータ・AI', '工学・エネルギー'] },
];
const TOTAL_HEX = FIELDS.length * 7;

// 歴史上の帝国（最盛期のおおよその面積）。知の世界全体を地球の陸地（約1億4890万km²）に見立てて比べる。
const EMPIRES = [
  { name: '古代エジプト（新王国）', era: '前15世紀', km2: 1.0 },
  { name: 'アッシリア帝国', era: '前7世紀', km2: 1.4 },
  { name: 'ローマ帝国', era: '2世紀', km2: 5.0 },
  { name: 'アレクサンドロス大王の帝国', era: '前4世紀', km2: 5.2 },
  { name: 'アケメネス朝ペルシア', era: '前5世紀', km2: 5.5 },
  { name: '漢', era: '前1世紀', km2: 6.0 },
  { name: 'ウマイヤ朝', era: '8世紀', km2: 11.1 },
  { name: 'スペイン帝国', era: '18世紀', km2: 13.7 },
  { name: '清', era: '18世紀', km2: 14.7 },
  { name: 'ロシア帝国', era: '19世紀', km2: 22.8 },
  { name: 'モンゴル帝国', era: '13世紀', km2: 24.0 },
  { name: '大英帝国', era: '20世紀', km2: 35.5 },
].map((e) => ({ ...e, pct: (e.km2 / 148.9) * 100 }));

// 今の版図がどの帝国を超えたか、次はどの帝国か
function empireCompare(conquered) {
  const pct = (conquered / TOTAL_HEX) * 100;
  const passed = [...EMPIRES].reverse().find((e) => e.pct <= pct);
  const next = EMPIRES.find((e) => e.pct > pct);
  const hexesTo = next ? Math.ceil((next.pct / 100) * TOTAL_HEX) - conquered : 0;
  const myKm2 = (pct / 100) * 148.9;
  return { pct, passed, next, hexesTo, myKm2 };
}

function empireHtml(conquered) {
  const c = empireCompare(conquered);
  const max = 30; // ものさしの右端（%）。大英帝国（約24%）が入る幅
  // 小さい帝国が集まっているので、平方根の目盛りにして間を広げる
  const pos = (p) => Math.min(100, Math.sqrt(p / max) * 100);
  const LABELED = ['古代エジプト（新王国）', 'ローマ帝国', 'ウマイヤ朝', '清', 'モンゴル帝国', '大英帝国'];
  const headline = !conquered ? 'まだ領土がありません。1冊読めば、古代エジプトを超えます。'
    : c.next ? `あなたの版図（約${Math.round(c.myKm2 * 100).toLocaleString()}万km²相当）は、${c.passed ? `<strong>${c.passed.name}</strong>（${c.passed.era}）を超えました。` : ''}次は<strong>${c.next.name}</strong>まで、あと${c.hexesTo}マス（読了およそ${c.hexesTo}冊分）。`
    : `人類史上のどの帝国よりも広い版図です。${conquered >= TOTAL_HEX ? '知の世界を統一しました！' : `残る未開の地は${TOTAL_HEX - conquered}マス。`}`;
  return `
    <section class="card empire-card">
      <div class="card-head"><h3>歴史の帝国とくらべる</h3><span class="field-hint">知の世界＝地球の陸地として</span></div>
      <p class="empire-head">${headline}</p>
      <div class="empire-ruler" aria-hidden="true">
        <div class="empire-track"><i style="width:${pos(c.pct)}%"></i></div>
        ${EMPIRES.map((e) => {
          const li = LABELED.indexOf(e.name);
          return `<span class="empire-tick ${e.pct <= c.pct ? 'passed' : ''} ${li % 2 === 1 ? 'low' : ''}" style="left:${pos(e.pct)}%"><b></b>${li >= 0 ? `<em>${e.name.replace(/（.*）/, '').replace('帝国', '')}</em>` : ''}</span>`;
        }).join('')}
        <span class="empire-me" style="left:${Math.min(88, Math.max(8, pos(c.pct)))}%">あなた</span>
      </div>
      <details class="empire-list"><summary>帝国の一覧（最盛期の面積）</summary>
        <ol>${EMPIRES.map((e) => `<li class="${e.pct <= c.pct ? 'passed' : ''}"><span>${e.name}<small>${e.era}</small></span><span class="num">${Math.round(e.km2 * 100).toLocaleString()}万km²・${e.pct.toFixed(1)}%</span></li>`).join('')}</ol>
        <p class="field-hint">面積は最盛期のおおよその値です。資料によって差があります。</p>
      </details>
    </section>`;
}

// 国ごとの状態：何マス制覇したか、城があるか、最前線（読書中）か、予定地（積読）か
function realmOf(s) {
  const conquered = s.done ? Math.min(7, 1 + s.done) : 0;
  return { conquered, castle: s.trunkDone, front: s.reading > 0 && conquered < 7, planned: !s.done && (s.tsundoku > 0 || s.reading > 0) };
}

function worldStats() {
  const stats = fieldStats();
  const realms = Object.fromEntries(stats.map((s) => [s.field, { ...s, ...realmOf(s) }]));
  const conquered = Object.values(realms).reduce((a, r) => a + r.conquered, 0);
  return { realms, conquered, pct: Math.round((conquered / TOTAL_HEX) * 100) };
}

// 六角形の地図をSVGで描く。mini=true はホーム用（文字なし・小さめ）
function worldMapSvg({ mini = false } = {}) {
  const { realms } = worldStats();
  const S = 10; // 六角形1つの大きさ
  const R3 = Math.sqrt(3);
  const px = (q, r) => [S * R3 * (q + r / 2), S * 1.5 * r];
  const corners = (x, y) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [x + S * Math.cos(a), y + S * Math.sin(a)];
  });
  const owner = new Map(); // "q,r" → 分野
  const tiles = [];
  for (const c of WORLD) {
    c.cells.forEach(([a, b], i) => {
      const field = c.fields[i];
      const cq = 2 * a - b, cr = a + 3 * b; // 国の首都の座標
      FLOWER.forEach(([dq, dr], k) => {
        const q = cq + dq, r = cr + dr;
        owner.set(`${q},${r}`, field);
        tiles.push({ q, r, field, k, continent: c.name });
      });
    });
  }
  const xs = [], ys = [];
  for (const t of tiles) { const [x, y] = px(t.q, t.r); xs.push(x); ys.push(y); }
  const pad = mini ? 8 : 26;
  const minX = Math.min(...xs) - S - pad, maxX = Math.max(...xs) + S + pad;
  const minY = Math.min(...ys) - S - pad, maxY = Math.max(...ys) + S + pad;

  const hexes = tiles.map((t) => {
    const realm = realms[t.field];
    const [x, y] = px(t.q, t.r);
    const pts = corners(x, y).map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const won = t.k < realm.conquered;
    const front = !won && realm.front && t.k === realm.conquered;
    const cls = won ? 'hx won' : front ? 'hx front' : realm.planned ? 'hx plan' : 'hx wild';
    const delay = won ? `style="--cover:${FIELD_COLORS[t.field]};animation-delay:${(t.k * 60)}ms"` : `style="--cover:${FIELD_COLORS[t.field]}"`;
    return `<polygon class="${cls}" points="${pts}" ${delay} data-action="open-field" data-field="${esc(t.field)}"/>`;
  }).join('');

  // 国境と海岸線：となりのマスが別の国（または海）なら、その辺に線を引く
  const borders = [], coast = [];
  for (const t of tiles) {
    const [x, y] = px(t.q, t.r);
    const cs = corners(x, y);
    HEX_DIRS.forEach(([dq, dr]) => {
      const n = owner.get(`${t.q + dq},${t.r + dr}`);
      if (n === t.field) return;
      // 方向(dq,dr)に向いた辺の両端の角を選ぶ
      const [nx, ny] = px(t.q + dq, t.r + dr);
      const ang = Math.atan2(ny - y, nx - x);
      const pick = cs.map((p, i) => ({ p, d: Math.abs(Math.atan2(Math.sin(Math.atan2(p[1] - y, p[0] - x) - ang), Math.cos(Math.atan2(p[1] - y, p[0] - x) - ang))) }))
        .sort((m, n2) => m.d - n2.d).slice(0, 2).map((m) => m.p);
      const seg = `M${pick[0][0].toFixed(1)},${pick[0][1].toFixed(1)}L${pick[1][0].toFixed(1)},${pick[1][1].toFixed(1)}`;
      (n ? borders : coast).push(seg);
    });
  }

  // 首都：城（幹を読了）または旗、国の名前
  const capitals = [];
  for (const c of WORLD) {
    c.cells.forEach(([a, b], i) => {
      const field = c.fields[i];
      const realm = realms[field];
      const [x, y] = px(2 * a - b, a + 3 * b);
      if (realm.castle) {
        // 城は首都のマスの上半分に小さく、国名はその下に
        capitals.push(`<path class="castle" d="M${x - 3.6},${y - 1}v-4h1.4v1.4h1.5v-2.2h1.4v2.2h1.5v-1.4h1.4v4z" />`);
      }
      if (!mini) {
        const label = SHORT[field];
        capitals.push(`<text class="realm-name ${realm.conquered ? 'on' : ''}" x="${x}" y="${y + (realm.castle ? 5.6 : 2.3)}" text-anchor="middle">${label}</text>`);
      }
    });
  }
  // 大陸の名前（海の上に）
  const continentLabels = mini ? '' : WORLD.map((c) => {
    const cx = c.cells.map(([a, b]) => px(2 * a - b, a + 3 * b));
    const x = cx.reduce((m, p) => m + p[0], 0) / cx.length;
    const y = Math.min(...cx.map((p) => p[1])) - S * 3.1;
    return `<text class="continent-name" x="${x}" y="${y}" text-anchor="middle">${c.name}</text>`;
  }).join('');

  return `<svg class="worldmap ${mini ? 'mini' : ''}" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}" role="img" aria-label="知の版図の地図">
      <defs>
        <pattern id="waves" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 8 q6 -4 12 0 t12 0" fill="none" class="wave"/></pattern>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="hatch"/></pattern>
      </defs>
      <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" class="sea"/>
      <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="url(#waves)"/>
      <path class="coast-glow" d="${coast.join('')}"/>
      ${hexes}
      <path class="border" d="${borders.join('')}"/>
      <path class="coast" d="${coast.join('')}"/>
      ${capitals.join('')}
      ${continentLabels}
    </svg>`;
}

/* ---------- 知の地図 ---------- */
function renderMap() {
  const el = $('#view-map');
  const stats = fieldStats();
  const byField = Object.fromEntries(stats.map((s) => [s.field, s]));
  const explored = stats.filter((s) => s.done > 0);
  const trunks = stats.filter((s) => s.trunkDone).length;
  const blanks = stats.filter((s) => s.done === 0 && s.reading === 0 && s.tsundoku === 0);

  const planned = stats.filter((s) => s.done === 0 && (s.tsundoku > 0 || s.reading > 0));
  const tile = (s) => {
    const level = s.done >= 4 ? 3 : s.done >= 2 ? 2 : s.done >= 1 ? 1 : 0;
    const plan = !level && (s.tsundoku || s.reading);
    return `
      <button class="land ${level ? 'land-on' : ''} ${plan ? 'land-plan' : ''}" style="--cover:${FIELD_COLORS[s.field]}" data-action="open-field" data-field="${esc(s.field)}"
        aria-label="${esc(s.field)}：読了${s.done}冊、幹${s.trunkDone ? 'あり' : 'まだ'}">
        <span class="land-name">${esc(s.field)}</span>
        <span class="land-count"><span class="big">${s.done}</span>冊</span>
        <span class="land-foot">
          <span class="trunk-mark ${s.trunkDone ? 'on' : ''}">幹${s.trunkDone ? '✓' : ''}</span>
          ${s.reading ? `<span class="land-reading">読書中${s.reading}</span>` : ''}
          ${s.tsundoku ? `<span class="land-stack">積読${s.tsundoku}</span>` : ''}
          ${level ? `<span class="land-level" aria-hidden="true">${'●'.repeat(level)}${'○'.repeat(3 - level)}</span>` : plan ? '<span class="land-blank">予定地</span>' : '<span class="land-blank">未開拓</span>'}
        </span>
      </button>`;
  };

  const world = worldStats();
  const ranking = Object.values(world.realms).filter((r) => r.conquered).sort((a, b) => b.conquered - a.conquered || b.done - a.done);
  el.innerHTML = `
    <section class="realm-hero">
      <div class="realm-head">
        <div><span class="tile-label">あなたの知の版図</span>
          <div class="map-big"><span class="big">${world.pct}</span><small>%を制覇</small></div></div>
        <div class="realm-nums">
          <span><span class="big">${explored.length}</span><small>／18か国</small></span>
          <span><span class="big">${trunks}</span><small>城</small></span>
        </div>
      </div>
      <div class="map-frame">${worldMapSvg()}</div>
      <p class="map-note">本を1冊読み終えるごとに、その分野の国の首都から領土が広がります。幹（入門・古典）を読むと首都に城が建ちます。
      ${blanks.length ? `<br>まだ霧の中：${blanks.slice(0, 3).map((b) => esc(b.field)).join('、')}${blanks.length > 3 ? ` ほか${blanks.length - 3}か国` : ''}` : ''}</p>
      <div class="legend-row legend-map" aria-label="見かた">
        <span><i class="lg lg-won"></i>制覇した領土</span><span><i class="lg lg-front"></i>最前線（読書中）</span>
        <span><i class="lg lg-plan"></i>予定地（積読）</span><span><i class="lg lg-wild"></i>未開の地</span>
        <span><svg class="lg-castle" viewBox="-6 -5 12 10" aria-hidden="true"><path class="castle" d="M-5,4v-6h2v2h2v-3h2v3h2v-2h2v6z"/></svg>城（幹を読了）</span>
      </div>
    </section>
    ${empireHtml(world.conquered)}
    ${ranking.length ? `<section class="card">
      <div class="card-head"><h3>領土の広い国</h3><span class="field-hint">${world.conquered}／${TOTAL_HEX}マス</span></div>
      <div class="hbars">${ranking.slice(0, 5).map((r) => `
        <div class="hbar"><span class="hbar-label">${esc(r.field)}</span>
          <span class="hbar-track"><i style="width:${(r.conquered / 7) * 100}%;--cover:${FIELD_COLORS[r.field]}"></i></span>
          <span class="hbar-val num">${r.conquered}/7</span></div>`).join('')}</div>
    </section>` : ''}
    <div class="section-head" style="margin-top:6px"><h2 class="section-title">国の一覧</h2></div>
    ${CONTINENTS.map((c) => `
      <section class="section continent">
        <h2 class="section-title">${c.name}<span class="num"> ${c.fields.filter((f) => byField[f].done).length}/${c.fields.length}</span></h2>
        <div class="lands">${c.fields.map((f) => tile(byField[f])).join('')}</div>
      </section>`).join('')}`;
}

function openFieldSheet(field) {
  const s = fieldStats().find((x) => x.field === field);
  const books = [...s.books].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const stack = s.books.filter((b) => b.status === 'want');
  const stackTrunk = stack.find((b) => b.position === 'trunk');
  const advice = s.done === 0 && stackTrunk ? `積読の「${stackTrunk.title}」が幹の本です。ここから開拓を始めよう。`
    : s.done === 0 && stack.length ? `積読が${stack.length}冊ある予定地です。まずは1冊、読み始めてみよう。`
    : s.done === 0 ? 'まだ空白の分野です。まずは「幹」になる入門書や古典から1冊どうでしょう。'
    : !s.trunkDone ? '読了はありますが、「幹」の本がまだです。土台になる1冊を足すと理解がつながります。'
    : '幹ができています。次は「枝」（応用）や「葉」（専門）で広げてみよう。';
  openSheet(field, `
    <div class="detail">
      <div class="forecast">${advice}</div>
      ${books.length ? `<div class="shelf">${books.map((b) => `
          <button class="shelf-item" data-action="open-book" data-id="${b.id}">${coverHtml(b)}
            <span class="shelf-title">${esc(b.title)}</span>
            <span class="badge ${b.status === 'done' ? 'badge-done' : ''}">${labelOf(STATUSES, b.status)}</span></button>`).join('')}</div>`
        : '<p class="empty-small">この分野の本はまだありません。</p>'}
      <button class="btn btn-primary btn-block" data-action="add-book" data-field="${esc(field)}">＋ この分野の本を登録</button>
    </div>`, 'detail');
}

/* ---------- グラフ ---------- */
let statsRange = 'week';            // 'week' か 'month'
const chartSel = { time: null, pages: null }; // タップで選んだ棒

// 棒グラフ（SVG）。values: 数値の配列、labels: 下のラベル、fmt: 値の書式
function barChartHtml(key, values, labels, fmt, extra = () => '', stepOf = niceStep) {
  const W = 340, H = 170, L = 40, R = 6, T = 12, B = 24;
  const max = Math.max(...values, 0);
  const step = stepOf(max / 3);
  const top = Math.max(step * 3, step * Math.ceil(max / step)) || 1;
  const bw = (W - L - R) / values.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const sel = chartSel[key] ?? values.length - 1;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const avg = values.reduce((a, v) => a + v, 0) / values.length;

  const bars = values.map((v, i) => {
    const x = L + i * bw + 2;
    const w = Math.max(2, bw - 4);
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, w / 2, h);
    const path = h > 0 ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + w - r} Q${x + w},${y(v)} ${x + w},${y(v) + r} V${y(0)} Z` : '';
    return `<g class="bar ${i === sel ? 'sel' : ''}">
        ${path ? `<path d="${path}"/>` : ''}
        <rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T}" data-action="bar" data-chart="${key}" data-i="${i}"><title>${labels[i].full}：${fmt(v)}</title></rect>
      </g>`;
  }).join('');

  const every = values.length > 8 ? 3 : 1;
  return `
    <p class="readout"><span class="readout-label">${labels[sel].full}</span><span class="big">${fmt(values[sel])}</span>${extra(sel)}</p>
    <div class="chart-wrap">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="棒グラフ">
        ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, true)}</text>`).join('')}
        ${bars}
        ${avg > 0 ? `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>` : ''}
        ${labels.map((lb, i) => (i % every === (values.length - 1) % every ? `<text class="axis" x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${lb.short}</text>` : '')).join('')}
      </svg>
    </div>
    <p class="chart-foot"><i class="avg-key"></i>平均 ${fmt(avg)}・棒をタップで詳しく</p>`;
}
// 時間（分）の目盛りは、15分・30分・1時間…の切りのいい区切りにする
function minuteStep(raw) {
  return [10, 15, 30, 60, 120, 180, 300, 600, 1200, 3000].find((m) => m >= raw) || Math.ceil(raw / 600) * 600;
}
function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// 直近12週／12か月のバケツ（期間）をつくる
function buckets(range, count = 12) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    if (range === 'week') {
      const s = addDays(weekStart(now), -7 * i);
      out.push({ start: s, days: 7, short: `${s.getMonth() + 1}/${s.getDate()}`, full: `${s.getMonth() + 1}/${s.getDate()}の週` });
    } else {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      out.push({ start: s, days: daysBetween(s, e), short: `${s.getMonth() + 1}月`, full: `${s.getFullYear()}年${s.getMonth() + 1}月`, ym: toDateStr(s).slice(0, 7) });
    }
  }
  return out;
}

function renderStats() {
  const el = $('#view-stats');
  const tb = buckets(statsRange);
  const timeVals = tb.map((b) => summarize(b.start, b.days).minutes);
  const hourFmt = (m, axis) => (axis ? (m >= 60 ? `${Math.round(m / 6) / 10}時間` : `${Math.round(m)}分`) : fmtMinutes(m));

  const mb = buckets('month');
  const pageVals = mb.map((b) => summarize(b.start, b.days).pages);
  const doneIn = (ym) => data.books.filter((b) => b.status === 'done' && b.finishedAt && b.finishedAt.startsWith(ym)).length;

  const fs = fieldStats().filter((s) => s.done > 0).sort((a, b) => b.done - a.done);
  const maxField = Math.max(1, ...fs.map((s) => s.done));
  const doneBooks = data.books.filter((b) => b.status === 'done');
  const pos = POSITIONS.map((p) => ({ ...p, n: doneBooks.filter((b) => b.position === p.id).length }));
  const totalMin = data.sessions.reduce((a, s) => a + s.minutes, 0);
  const totalPages = data.sessions.reduce((a, s) => a + sessionPages(s), 0);
  const en = doneBooks.filter((b) => b.lang === 'en').length;

  el.innerHTML = `
    <div class="section-head"><h2 class="section-title">グラフ</h2></div>
    <div class="kpis">
      <div><small>総読書時間</small><span class="big">${timeHtml(totalMin)}</span></div>
      <div><small>読了</small><span class="big">${doneBooks.length}<small>冊</small></span></div>
      <div><small>平均の速さ</small><span class="big">${speedOf(totalPages, totalMin)}<small>p/時</small></span></div>
    </div>

    <section class="card">
      <div class="card-head"><h3>読書時間</h3>
        <div class="seg seg-mini" role="radiogroup">
          ${[['week', '週ごと'], ['month', '月ごと']].map(([id, lb]) => `<input type="radio" id="sr-${id}" name="stats-range" value="${id}" ${statsRange === id ? 'checked' : ''}><label for="sr-${id}">${lb}</label>`).join('')}
        </div></div>
      ${barChartHtml('time', timeVals, tb, hourFmt, () => '', minuteStep)}
    </section>

    <section class="card">
      <div class="card-head"><h3>月ごとのページ数と読了冊数</h3></div>
      ${barChartHtml('pages', pageVals, mb, (v, axis) => (axis ? `${Math.round(v)}` : `${Math.round(v)}ページ`), (i) => `<span class="readout-extra">読了 ${doneIn(mb[i].ym)}冊</span>`)}
      <div class="done-row" aria-label="月ごとの読了冊数">${mb.map((b) => `<span title="${b.full}">${doneIn(b.ym) || ''}</span>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>分野別の読了冊数</h3></div>
      ${fs.length ? `<div class="hbars">${fs.map((s) => `
          <div class="hbar"><span class="hbar-label">${esc(s.field)}</span>
            <span class="hbar-track"><i style="width:${(s.done / maxField) * 100}%;--cover:${FIELD_COLORS[s.field]}"></i></span>
            <span class="hbar-val num">${s.done}</span></div>`).join('')}</div>
          <p class="chart-foot">0冊の分野は ${18 - fs.length}個。地図タブで確認できます。</p>`
        : '<p class="empty-small">読了した本が増えると、分野の偏りがここに出ます。</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h3>幹・枝・葉のバランス（読了本）</h3></div>
      ${doneBooks.length ? `
        <div class="stack" aria-hidden="true">${pos.filter((p) => p.n).map((p) => `<i class="pos-${p.id}" style="flex:${p.n}"></i>`).join('')}</div>
        <div class="stack-legend">${pos.map((p) => `<span><i class="lg pos-${p.id}"></i>${p.label}（${p.desc}）<strong class="num">${p.n}冊</strong></span>`).join('')}</div>
        <p class="chart-foot">日本語 ${doneBooks.length - en}冊・英語 ${en}冊</p>`
        : '<p class="empty-small">読了した本が増えると表示されます。</p>'}
    </section>`;
}

/* ---------- 6. ボトムシート ---------- */
let sheetMode = null; // いま開いているシートの種類（'timer' など）

function openSheet(title, html, mode = 'form') {
  sheetMode = mode;
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet-body').scrollTop = 0;
  $('#backdrop').hidden = false;
  $('#sheet').hidden = false;
  requestAnimationFrame(() => $('#sheet').classList.add('open'));
  renderPlayer();
}
function closeSheet() {
  sheetMode = null;
  $('#sheet').classList.remove('open');
  $('#backdrop').hidden = true;
  releaseWakeLock();
  setTimeout(() => { if (!sheetMode) { $('#sheet').hidden = true; $('#sheet-body').innerHTML = ''; } }, 240);
  renderPlayer();
}

function segHtml(name, options, value) {
  return `<div class="seg" role="radiogroup">${options.map((o) => `
    <input type="radio" id="${name}-${o.id}" name="${name}" value="${o.id}" ${String(o.id) === String(value) ? 'checked' : ''}>
    <label for="${name}-${o.id}">${o.label}${o.desc ? `<small>${o.desc}</small>` : ''}</label>`).join('')}
  </div>`;
}

// --- 本の登録・編集 ---
// 登録フォームで選んだ表紙（写真・ネット画像）を一時的に覚えておく
let formCover = {};

function openBookForm(id, presetField = '') {
  const b = id ? bookById(id) : { status: 'reading', lang: 'ja', position: 'trunk', field: presetField };
  formCover = { coverUrl: b.coverUrl || '', coverData: b.coverData || '', isbn: b.isbn || '' };
  openSheet(id ? '本を編集' : '本を登録', `
    <form class="form" id="book-form" data-id="${id || ''}" novalidate>
      <div class="search-box">
        <label class="field-label" for="bs-q">本をさがして自動入力</label>
        <div class="search-row">
          <input class="input" id="bs-q" type="search" placeholder="タイトル・著者・ISBN" enterkeyhint="search" autocomplete="off">
          <button type="button" class="btn btn-primary" data-action="book-search">検索</button>
        </div>
        <p class="field-hint" id="bs-status">候補を選ぶと、表紙・著者・ページ数・分野が入ります。</p>
        <div class="search-results" id="bs-results"></div>
      </div>
      <div class="cover-edit">
        <div id="bf-cover-preview">${coverHtml({ ...b, ...formCover })}</div>
        <div class="cover-edit-btns">
          <span class="field-label">表紙</span>
          <label class="btn btn-ghost btn-small" for="bf-photo">写真から選ぶ・撮る</label>
          <input id="bf-photo" type="file" accept="image/*" hidden>
          <button type="button" class="btn btn-ghost btn-small" data-action="remove-cover">表紙をはずす</button>
          <span class="field-hint">表紙がなくても、分野の色で自動の表紙をつくります。</span>
        </div>
      </div>
      <div class="field"><label for="bf-title">タイトル</label>
        <input class="input" id="bf-title" value="${esc(b.title)}" required autocomplete="off"></div>
      <div class="field"><label for="bf-author">著者</label>
        <input class="input" id="bf-author" value="${esc(b.author)}" autocomplete="off"></div>
      <div class="field-row">
        <div class="field"><label for="bf-field">分野</label>
          <select class="input" id="bf-field">
            <option value="">選んでください</option>
            ${FIELDS.map((f) => `<option ${f === b.field ? 'selected' : ''}>${f}</option>`).join('')}
          </select></div>
        <div class="field"><label for="bf-pages">総ページ数</label>
          <input class="input" id="bf-pages" type="number" inputmode="numeric" min="1" value="${b.totalPages || ''}"></div>
      </div>
      <div class="field"><label for="bf-price">値段（円・任意）</label>
        <input class="input" id="bf-price" type="number" inputmode="numeric" min="0" value="${b.price || ''}" placeholder="積読タワーの総額に使います"></div>
      <div class="field"><span class="field-label">状態</span>${segHtml('bf-status', STATUSES, b.status)}</div>
      <div class="field" id="bf-finished-wrap" ${b.status === 'done' ? '' : 'hidden'}>
        <label for="bf-finished">読了日</label>
        <input class="input" id="bf-finished" type="date" value="${b.finishedAt || todayStr()}"></div>
      <div class="field"><span class="field-label">木の中での位置</span>${segHtml('bf-pos', POSITIONS, b.position)}
        <span class="field-hint">その分野の土台になる本なら「幹」、応用なら「枝」、専門的な細部なら「葉」。表紙の模様が変わります。</span></div>
      <div class="field"><span class="field-label">言語</span>${segHtml('bf-lang', LANGS, b.lang)}</div>
      <p class="error" id="bf-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">${id ? '変更を保存' : '登録する'}</button>
    </form>`);
}

function submitBookForm(form) {
  const v = (sel) => form.querySelector(sel).value.trim();
  const checked = (name) => form.querySelector(`input[name="${name}"]:checked`).value;
  const title = v('#bf-title');
  const field = v('#bf-field');
  const pages = parseInt(v('#bf-pages'), 10);
  const problem = !title ? 'タイトルを入力してください。'
    : !field ? '分野を選んでください。'
    : !(pages > 0) ? '総ページ数を1以上の数字で入力してください。' : '';
  if (problem) { showError('#bf-error', problem); return; }

  const status = checked('bf-status');
  const values = {
    title, author: v('#bf-author'), field, totalPages: pages, status,
    position: checked('bf-pos'), lang: checked('bf-lang'),
    finishedAt: status === 'done' ? (v('#bf-finished') || todayStr()) : null,
    price: parseInt(v('#bf-price'), 10) || null,
    coverUrl: formCover.coverUrl || '', coverData: formCover.coverData || '', isbn: formCover.isbn || '',
  };
  const id = form.dataset.id;
  let target;
  const wasDone = id && bookById(id).status === 'done';
  if (id) {
    target = Object.assign(bookById(id), values);
    toast('変更を保存しました');
  } else {
    target = { id: newId(), createdAt: new Date().toISOString(), ...values };
    data.books.push(target);
    toast(`「${title}」を本棚に追加しました`);
  }
  save();
  render();
  // 読了にしたときは、感想とつながりを書く画面へ
  if (status === 'done' && !wasDone && !target.review) openReviewForm(target.id, true);
  else closeSheet();
}

// --- 本の検索 ---
// 3つの無料の本のデータベースを使う。
//   1. Google Books：表紙が多い。ただしAPIキーなしだと回数制限ですぐ使えなくなる
//   2. 国立国会図書館サーチ：日本の本に強い。分類番号（NDC）から分野を判定できる
//   3. Open Library：英語の本に強く、表紙も取れる
// Google Books が使えないときは、2と3を同時に検索する。
const GOOGLE_BOOKS_KEY = 'AIzaSyBBNe-e60G-DA9IC37rXfjS2_JOXBg2xZ0'; // Google Books のAPIキー（kazunorif07-dotcom.github.io からだけ使えるよう制限済み）
let searchResults = [];
let searchSeq = 0; // 古い検索結果が後から届いても無視するための番号

async function searchBooks() {
  const q = $('#bs-q').value.trim();
  const status = $('#bs-status');
  const list = $('#bs-results');
  if (!q) { status.textContent = '検索する言葉を入れてください。'; return; }
  const seq = ++searchSeq;
  status.textContent = 'さがしています…';
  list.innerHTML = '';
  const digits = q.replace(/[-\s]/g, '');
  const isbn = /^(\d{9}[\dX]|\d{13})$/i.test(digits) ? digits : '';
  const isJapanese = /[぀-ヿ㐀-鿿]/.test(q);

  // 3つのデータベースを同時に検索する（日本語の言葉では Open Library はほぼ見つからないので省く）
  const tasks = {
    google: searchGoogle(isbn ? `isbn:${isbn}` : q),
    ndl: searchNdl(q, isbn),
  };
  if (!isJapanese) tasks.ol = searchOpenLibrary(q, isbn);
  const names = Object.keys(tasks);
  const settled = await Promise.allSettled(Object.values(tasks));
  if (seq !== searchSeq) return;
  const got = {};
  for (const name of ['google', 'ndl', 'ol']) got[name] = [];
  names.forEach((name, i) => { got[name] = settled[i].status === 'fulfilled' ? settled[i].value.map((r) => ({ ...r, src: name })) : []; });
  if (settled.every((s) => s.status === 'rejected')) {
    status.textContent = '本のデータベースに接続できませんでした。電波を確認するか、下に手で入力してください。';
    return;
  }

  // 同じISBNの本は1つに合体させる。
  //   表紙：Google ＞ Open Library ＞ 国会図書館（国会図書館の表紙は出ないことが多い）
  //   分野・ページ数・タイトル：国会図書館（分類番号が正確）＞ Open Library ＞ Google
  const japaneseBook = isJapanese || /^(9784|4)/.test(isbn);
  const order = japaneseBook ? ['ndl', 'google', 'ol'] : ['google', 'ol', 'ndl'];
  const coverRank = { google: 0, ol: 1, ndl: 2 };
  const infoRank = { ndl: 0, ol: 1, google: 2 };
  const merged = [];
  const byIsbn = new Map();
  for (const name of order) {
    for (const r of got[name]) {
      const hit = r.isbn && byIsbn.get(r.isbn);
      if (!hit) {
        const rec = { ...r, coverSrc: r.coverUrl ? r.src : null };
        merged.push(rec);
        if (r.isbn) byIsbn.set(r.isbn, rec);
        continue;
      }
      if (r.coverUrl && (!hit.coverSrc || coverRank[r.src] < coverRank[hit.coverSrc])) { hit.coverUrl = r.coverUrl; hit.coverSrc = r.src; }
      const better = infoRank[r.src] < infoRank[hit.src];
      for (const k of ['field', 'pages', 'price', 'author']) if (r[k] && (better || !hit[k])) hit[k] = r[k];
      if (better) { hit.title = r.title; hit.src = r.src; }
    }
  }
  // ISBNがない版（電子書籍など）は、タイトルと巻（上・下）が同じ本に表紙だけ渡して1つにまとめる
  const volOf = (t) => (t.match(/(?:^|[\s（(])(上|中|下)(?=$|[\s）)])/) || [])[1] || '';
  const keyOf = (t) => t.replace(/(?:^|[\s（(])(上|中|下)(?=$|[\s）)])/g, ' ').toLowerCase().replace(/[\s・:：『』「」（）()［］\[\]―-]/g, '') + '|' + volOf(t);
  const byKey = new Map(merged.filter((r) => r.isbn).map((r) => [keyOf(r.title), r]));
  const results = merged.filter((r) => {
    if (r.isbn || !r.coverUrl) return true;
    const twin = byKey.get(keyOf(r.title));
    if (!twin) return true;
    if (!twin.coverSrc || twin.coverSrc === 'ndl') { twin.coverUrl = r.coverUrl; twin.coverSrc = r.src; }
    return false;
  });
  const source = names.filter((n) => got[n].length).map((n) => ({ google: 'Google Books', ndl: '国立国会図書館', ol: 'Open Library' }[n])).join('・');

  // タイトルが検索語に近い本を前に。セット・試し読み版などは後ろに。
  const seen = new Set();
  const norm = (t) => t.toLowerCase().replace(/[\s・:：『』「」（）()［］\[\]―-]/g, '');
  const nq = norm(q);
  const score = (r) => {
    const t = norm(r.title);
    const main = norm(r.title.split(/\s*[:：]\s*/)[0]); // 「本題 : 副題」の本題
    return (main === nq || t === nq ? 3 : t.startsWith(nq) ? 2 : t.includes(nq) ? 1 : 0)
      + (r.isbn ? 0.5 : 0) + (r.coverUrl && r.coverSrc !== 'ndl' ? 0.3 : 0)
      - (/セット|試し読み|特装|合本|全\d+巻|をどう読むか|まんが|マンガ|漫画/.test(r.title) ? 1.5 : 0);
  };
  searchResults = results.filter((r) => {
    const key = r.isbn || norm(r.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r).slice(0, 15);

  if (!searchResults.length) { status.textContent = '見つかりませんでした。言葉を短くするか、下に手で入力してください。'; return; }
  status.textContent = `${searchResults.length}件（${source}）。タップで自動入力。表紙がない本は自動の表紙になります。`;
  list.innerHTML = searchResults.map((r, i) => `
    <button type="button" class="result-card" data-action="pick-result" data-i="${i}">
      ${coverHtml({ title: r.title, author: r.author, field: r.field, position: 'trunk', coverUrl: r.coverUrl })}
      <span class="result-title">${esc(r.title)}</span>
      <span class="result-sub">${esc(r.author || '')}${r.pages ? `・${r.pages}p` : ''}</span>
    </button>`).join('');
}

async function searchGoogle(query) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books&country=JP`
    + '&fields=items(volumeInfo(title,subtitle,authors,pageCount,categories,imageLinks,industryIdentifiers,language))'
    + (GOOGLE_BOOKS_KEY ? `&key=${GOOGLE_BOOKS_KEY}` : '');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const json = await res.json();
  return (json.items || []).map((item) => {
    const v = item.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn = (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier || '';
    const title = [v.title, v.subtitle].filter(Boolean).join(' ');
    const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return {
      title, author: (v.authors || []).join('、'), pages: v.pageCount || '',
      lang: v.language === 'en' ? 'en' : 'ja',
      field: guessField(`${(v.categories || []).join(' ')} ${title}`),
      coverUrl: img ? img.replace(/^http:/, 'https:') : ndlThumb(isbn), isbn,
    };
  });
}

// 国立国会図書館サーチ（結果はXML）
async function searchNdl(q, isbn) {
  const base = 'https://ndlsearch.ndl.go.jp/api/opensearch?mediatype=books&cnt=15&';
  let items = await fetchNdl(base + (isbn ? `isbn=${isbn}` : `title=${encodeURIComponent(q)}`));
  if (!items.length && !isbn) items = await fetchNdl(base + `any=${encodeURIComponent(q)}`);
  return items;
}

async function fetchNdl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NDL ${res.status}`);
  const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
  return [...xml.getElementsByTagName('item')].map((item) => {
    const all = (tag) => [...item.getElementsByTagName(tag)];
    const text = (tag) => (all(tag)[0]?.textContent || '').trim();
    const typed = (tag, type) => all(tag).find((el) => (el.getAttribute('xsi:type') || '').endsWith(type))?.textContent.trim() || '';
    const isbn = typed('dc:identifier', 'ISBN').replace(/-/g, '');
    const ndc = typed('dc:subject', 'NDC10') || typed('dc:subject', 'NDC9') || typed('dc:subject', 'NDC8');
    const volume = text('dcndl:volume');
    const title = [text('dc:title'), volume].filter(Boolean).join(' ');
    // 「xii, 301p」のような書き方から、いちばん大きいページ数を取り出す
    const pageNums = (text('dc:extent').match(/(\d+)\s*p/g) || []).map((s) => parseInt(s, 10));
    return {
      title,
      author: all('dc:creator').slice(0, 2).map((el) => formatName(el.textContent)).join('、'),
      pages: pageNums.length ? Math.max(...pageNums) : '',
      lang: /[぀-ヿ㐀-鿿]/.test(title) ? 'ja' : 'en',
      field: fieldFromNdc(ndc) || guessField(`${all('dc:subject').map((el) => el.textContent).join(' ')} ${title}`),
      coverUrl: ndlThumb(isbn), isbn,
      price: parseInt(text('dcndl:price').replace(/[^0-9]/g, ''), 10) || '',
    };
  }).filter((r) => r.title);
}

// 「柴田, 裕之, 1959-」→「柴田裕之」、「Harari, Yuval N., 1976-」→「Yuval N. Harari」
function formatName(raw) {
  const parts = raw.split(/,\s*/).map((s) => s.trim()).filter((s) => s && !/^\d|^\d*-\d*$/.test(s));
  if (parts.length < 2) return parts[0] || '';
  return /[぀-ヿ㐀-鿿]/.test(parts[0]) ? parts[0] + parts[1] : `${parts[1]} ${parts[0]}`;
}

const ndlThumb = (isbn) => (/^97[89]\d{10}$/.test(isbn) ? `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg` : '');

// 日本十進分類法（NDC）の番号から、このアプリの分野を決める
function fieldFromNdc(ndc) {
  const n = parseFloat(ndc);
  if (Number.isNaN(n)) return '';
  const c = Math.floor(n); // 例：007.1 → 7
  if (c >= 7 && c < 8) return 'コンピュータ・AI';
  if (c < 100) return '';
  if (c >= 140 && c < 150) return '心理学・認知科学';
  if (c >= 160 && c < 200) return '宗教';
  if (c < 200) return '哲学・倫理';
  if (c < 300) return '歴史';
  if (c >= 310 && c < 330) return '政治・公共政策';
  if (c >= 390 && c < 400) return '政治・公共政策';
  if (c >= 338 && c < 339) return '金融・投資';
  if (c >= 335 && c < 337) return '経営・起業';
  if (c >= 330 && c < 350) return '経済学';
  if (c < 400) return '社会学・人類学';
  if (c >= 410 && c < 420) return '数学・統計';
  if ((c >= 420 && c < 430) || (c >= 440 && c < 460)) return '物理学・宇宙';
  if (c >= 430 && c < 440) return '化学・素材';
  if (c >= 460 && c < 490) return '生物・進化';
  if (c >= 490 && c < 500) return '医学・健康';
  if (c < 500) return '物理学・宇宙';
  if (c >= 547 && c < 549) return 'コンピュータ・AI';
  if (c >= 570 && c < 580) return '化学・素材';
  if (c >= 590 && c < 600) return '医学・健康';
  if (c < 600) return '工学・エネルギー';
  if (c >= 670 && c < 680) return '経営・起業';
  if (c < 700) return '経営・起業';
  if (c < 800) return '芸術・デザイン';
  return '文学・小説'; // 800番台（言語）と900番台（文学）
}

// Open Library（英語の本。表紙あり）
async function searchOpenLibrary(q, isbn) {
  const url = `https://openlibrary.org/search.json?${isbn ? `isbn=${isbn}` : `q=${encodeURIComponent(q)}`}&limit=10`
    + '&fields=title,subtitle,author_name,number_of_pages_median,isbn,cover_i,subject,language';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  const json = await res.json();
  return (json.docs || []).map((d) => {
    const title = [d.title, d.subtitle].filter(Boolean).join(': ');
    const isbn13 = (d.isbn || []).find((x) => /^97[89]\d{10}$/.test(x)) || '';
    const langs = d.language || [];
    return {
      title, author: (d.author_name || []).slice(0, 2).join('、'), pages: d.number_of_pages_median || '',
      lang: langs.includes('jpn') && !langs.includes('eng') ? 'ja' : 'en',
      field: guessField(`${(d.subject || []).slice(0, 15).join(' ')} ${title}`),
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '', isbn: isbn13,
    };
  });
}

function pickResult(i) {
  const r = searchResults[i];
  if (!r) return;
  $('#bf-title').value = r.title;
  $('#bf-author').value = r.author;
  if (r.pages) $('#bf-pages').value = r.pages;
  if (r.price) $('#bf-price').value = r.price;
  if (r.field) $('#bf-field').value = r.field;
  const lang = $(`#bf-lang-${r.lang}`);
  if (lang) lang.checked = true;
  formCover = { coverUrl: r.coverUrl, coverData: '', isbn: r.isbn };
  refreshCoverPreview();
  $('#bs-results').innerHTML = '';
  $('#bs-status').textContent = r.field ? '入力しました。分野と「幹・枝・葉」を確認してください。' : '入力しました。分野を選んでください。';
  $('#bf-title').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function refreshCoverPreview() {
  const form = $('#book-form');
  if (!form) return;
  const checked = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  $('#bf-cover-preview').innerHTML = coverHtml({
    title: $('#bf-title').value || 'タイトル', author: $('#bf-author').value,
    field: $('#bf-field').value, position: checked('bf-pos'), ...formCover,
  });
}

// 写真を小さく縮めて（幅240px）、端末に保存できる大きさにする
function loadPhoto(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const w = 240;
      const h = Math.round((img.height / img.width) * w);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      formCover = { ...formCover, coverData: cv.toDataURL('image/jpeg', 0.72), coverUrl: '' };
      refreshCoverPreview();
    };
    img.onerror = () => toast('この画像は読み込めませんでした');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function showError(sel, msg) {
  const err = $(sel);
  err.textContent = msg;
  err.hidden = false;
}

// --- 本の詳細 ---
function openBookDetail(id) {
  const b = bookById(id);
  if (!b) return;
  const pos = POSITIONS.find((p) => p.id === b.position);
  const logs = sortedSessions(data.sessions.filter((s) => s.bookId === id));
  const total = logs.reduce((a, s) => a + s.minutes, 0);
  const pages = logs.reduce((a, s) => a + sessionPages(s), 0);
  const f = forecastOf(b);
  const forecast = b.status === 'done' ? `<div class="forecast">${b.finishedAt ? `${fmtDate(b.finishedAt)}に` : ''}読了しました</div>`
    : f ? `<div class="forecast">このペース（1日約${Math.max(1, Math.round(f.perDay))}ページ）なら<br><strong>${fmtMonthDay(f.date)}</strong>ごろ読み終わります（あと${f.daysLeft}日）</div>`
    : `<div class="forecast">記録をつけると、読み終わる日を予測します。</div>`;

  openSheet('本の詳細', `
    <div class="detail">
      <div class="detail-top">
        ${coverHtml(b)}
        <div>
          <h3 class="detail-title">${esc(b.title)}</h3>
          <span class="now-sub">${esc(b.author || '著者未入力')}</span>
          <span class="badge ${b.status === 'done' ? 'badge-done' : ''}">${labelOf(STATUSES, b.status)}</span>
          <span class="now-sub num">${lastPageOf(id)} / ${b.totalPages}ページ</span>
          ${progressHtml(b)}
        </div>
      </div>
      ${forecast}
      <div class="btn-row">
        ${b.status !== 'done' ? `<button class="btn btn-primary" data-action="start-timer" data-id="${id}">${ICONS.play}タイマーで読む</button>` : ''}
        <button class="btn btn-ghost" data-action="record" data-id="${id}" data-mode="manual">手入力で記録</button>
      </div>
      <dl class="kv">
        <dt>分野</dt><dd>${esc(b.field)}</dd>
        <dt>位置</dt><dd>${pos ? `${pos.label}（${pos.desc}）` : '—'}</dd>
        <dt>言語</dt><dd>${labelOf(LANGS, b.lang)}</dd>
        <dt>読書時間</dt><dd>合計 ${fmtMinutes(total)}（${logs.length}回）</dd>
        <dt>平均の速さ</dt><dd>${speedOf(pages, total) ? `時速${speedOf(pages, total)}ページ` : '—'}</dd>
      </dl>
      ${bookNotesHtml(b)}
      <div class="section">
        <h4 class="section-title">この本の記録</h4>
        ${logs.length ? `<div class="list">${logs.map((s) => logItemHtml(s, true)).join('')}</div>` : '<p class="empty-small">まだ記録がありません。</p>'}
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-small" data-action="edit-book" data-id="${id}">本の情報を編集</button>
        <button class="btn btn-danger btn-small" data-action="delete-book" data-id="${id}">本と記録を削除</button>
      </div>
    </div>`, 'detail');
}

// --- 記録（タイマー／手入力）---
function pickDefaultBook() {
  const books = [...data.books].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const recent = bookById(sortedSessions()[0]?.bookId);
  return recent && recent.status !== 'done' ? recent.id : books[0].id;
}

function openRecordSheet(bookId, mode = 'timer') {
  if (data.timer) { openTimerSheet(); return; }
  if (!data.books.length) { toast('先に本を登録しよう'); openBookForm(); return; }
  const books = [...data.books].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const selected = bookId || pickDefaultBook();
  const start = lastPageOf(selected);

  openSheet('読書を記録', `
    <div class="form">
      ${segHtml('rs-mode', [{ id: 'timer', label: 'タイマー' }, { id: 'manual', label: '手入力' }], mode)}
      <div class="field"><label for="rs-book">本</label>
        <select class="input" id="rs-book">
          ${books.map((b) => `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${esc(b.title)}（${labelOf(STATUSES, b.status)}）</option>`).join('')}
        </select></div>

      <div id="panel-timer" class="form" ${mode === 'timer' ? '' : 'hidden'}>
        <p class="preview">前回の続き <em id="rs-from">${start}ページ</em> から。読み終わったら、何ページまで読んだかを入れるだけ。</p>
        <button class="btn btn-primary btn-block" data-action="start-timer" style="min-height:60px;font-size:17px">${ICONS.play}スタート</button>
      </div>

      <form id="log-form" class="form" ${mode === 'manual' ? '' : 'hidden'} novalidate>
        <div class="field-row">
          <div class="field"><label for="lf-date">日付</label>
            <input class="input" id="lf-date" type="date" value="${todayStr()}" max="${todayStr()}"></div>
          <div class="field"><label for="lf-min">読んだ時間（分）</label>
            <input class="input" id="lf-min" type="number" inputmode="numeric" min="1" placeholder="30"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="lf-start">前回までのページ</label>
            <input class="input" id="lf-start" type="number" inputmode="numeric" min="0" value="${start}"></div>
          <div class="field"><label for="lf-end">今回読み終えたページ</label>
            <input class="input" id="lf-end" type="number" inputmode="numeric" min="0" placeholder="${start + 20}"></div>
        </div>
        <p class="field-hint">例：前回30ページまで、今回52ページまでなら「30」と「52」。22ページ読んだことになります。</p>
        <p class="preview" id="lf-preview" hidden></p>
        <p class="error" id="lf-error" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">記録する</button>
      </form>
    </div>`);
}

function updateLogPreview() {
  const min = parseInt($('#lf-min').value, 10);
  const start = parseInt($('#lf-start').value, 10);
  const end = parseInt($('#lf-end').value, 10);
  const p = $('#lf-preview');
  if (min > 0 && end >= start) {
    p.innerHTML = `<em>${end - start}ページ</em>・${fmtMinutes(min)}・時速${speedOf(end - start, min)}ページ`;
    p.hidden = false;
  } else p.hidden = true;
}

function submitLogForm() {
  const book = bookById($('#rs-book').value);
  const date = $('#lf-date').value;
  const minutes = parseInt($('#lf-min').value, 10);
  const startPage = parseInt($('#lf-start').value, 10);
  const endPage = parseInt($('#lf-end').value, 10);
  const problem = !book ? '本を選んでください。'
    : !date ? '日付を入力してください。'
    : !(minutes > 0) ? '読んだ時間を1分以上で入力してください。'
    : !(startPage >= 0) ? '前回までのページを入力してください（初めてなら0）。'
    : !(endPage >= 0) ? '今回読み終えたページを入力してください。'
    : endPage < startPage ? '読み終えたページが、前回までのページより小さくなっています。'
    : endPage > book.totalPages ? `この本は${book.totalPages}ページまでです。総ページ数を直すときは本の編集から。` : '';
  if (problem) { showError('#lf-error', problem); return; }
  addSession({ book, date, minutes, startPage, endPage, source: 'manual' });
}

// 記録を1件追加する（タイマーと手入力の共通処理）。状態の自動更新とお祝いもここで。
function addSession({ book, date, minutes, startPage, endPage, source }) {
  const before = { streak: streakInfo().current, todayMin: minutesOn(todayStr()) };
  data.sessions.push({ id: newId(), bookId: book.id, date, minutes, startPage, endPage, source, createdAt: new Date().toISOString() });

  let msg = `${endPage - startPage}ページ・${fmtMinutes(minutes)}を記録しました`;
  let party = false;
  let finished = false;
  if (endPage >= book.totalPages && book.status !== 'done') {
    finished = true;
    book.status = 'done';
    book.finishedAt = date;
    msg = `読了おめでとう！「${book.field}」の版図が広がりました`;
    party = true;
  } else if (book.status === 'want' || book.status === 'wish' || book.status === 'paused') {
    book.status = 'reading';
  }
  const after = { streak: streakInfo().current, todayMin: minutesOn(todayStr()) };
  const goal = data.settings.dailyGoal;
  if (!party && before.todayMin < goal && after.todayMin >= goal) { msg = `今日の目標${goal}分を達成！`; party = true; }
  else if (!party && after.streak > before.streak && after.streak >= 2) { msg = `${after.streak}日連続！この調子`; }

  save();
  render();
  if (finished) openReviewForm(book.id, true); // 読了したら、感想とつながりを書く画面へ
  else closeSheet();
  toast(msg);
  if (party) celebrate();
}

// --- 目標の設定 ---
function openSettings() {
  const opts = [10, 15, 20, 30, 45, 60].map((n) => ({ id: n, label: `${n}分` }));
  openSheet('設定', `
    <form class="form" id="settings-form" novalidate>
      <div class="field"><span class="field-label">1日の読書目標</span>
        ${segHtml('st-daily', opts.slice(0, 3), data.settings.dailyGoal)}
        ${segHtml('st-daily', opts.slice(3), data.settings.dailyGoal)}
        <span class="field-hint">ホームのリングがいっぱいになる時間です。少なめから始めると続きやすいです。</span></div>
      <div class="field"><label for="st-year">今年の目標冊数</label>
        <input class="input" id="st-year" type="number" inputmode="numeric" min="1" value="${data.settings.yearGoal}">
        <span class="field-hint">ホームの「読書チャレンジ」に達成率が出ます。</span></div>
      <button class="btn btn-primary btn-block" type="submit">目標を保存する</button>
    </form>
    <div class="form backup">
      <h3 class="section-title">Markdownで書き出す</h3>
      <p class="field-hint">読了本の一覧・分野別の冊数・感想・メモをまとめます。ChatGPT や Claude などのAIに貼り付けると、次に読む本を相談できます（相談用の質問文つき）。</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="export-md">コピーする</button>
        <button class="btn btn-ghost" data-action="export-md-file">ファイルで保存</button>
      </div>
      <textarea class="input" id="md-text" rows="6" hidden readonly></textarea>
    </div>
    <div class="form backup">
      <h3 class="section-title">データの引っ越し・バックアップ</h3>
      <p class="field-hint">データはこの端末のこのブラウザの中だけにあります。機種変更や別の場所で使うときは、ここでコピーして、移った先で貼り付けてください。</p>
      <button class="btn btn-ghost btn-block" data-action="export-json">データをコピーする</button>
      <div class="field"><label for="bk-text">ここにデータを貼り付けて読み込む</label>
        <textarea class="input" id="bk-text" rows="4" placeholder="コピーしたデータを貼り付け"></textarea></div>
      <p class="error" id="bk-error" hidden></p>
      <button class="btn btn-danger btn-block" data-action="import-json">読み込む（今のデータと置き換え）</button>
    </div>`);
}

// 全データを文字にしてコピーする（コピーできない環境では、文字を表示して選択状態にする）
async function exportJson() {
  const text = JSON.stringify({ app: 'yomichi', exportedAt: new Date().toISOString(), data });
  const box = $('#bk-text');
  try {
    await navigator.clipboard.writeText(text);
    toast(`コピーしました（本${data.books.length}冊・記録${data.sessions.length}件）`);
  } catch (e) {
    box.value = text;
    box.focus();
    box.select();
    toast('自動でコピーできませんでした。表示した文字を全部選んでコピーしてください');
  }
}

function importJson() {
  try {
    const parsed = JSON.parse($('#bk-text').value.trim());
    const incoming = parsed.data || parsed;
    if (!Array.isArray(incoming.books) || !Array.isArray(incoming.sessions)) throw new Error('形式が違います');
    const base = emptyData();
    data = { ...base, ...incoming, settings: { ...base.settings, ...(incoming.settings || {}) } };
    save();
    closeSheet();
    render();
    toast(`読み込みました（本${data.books.length}冊・記録${data.sessions.length}件）`);
  } catch (e) {
    showError('#bk-error', '読み込めませんでした。「データをコピーする」でコピーした文字を、全部そのまま貼り付けてください。');
  }
}

function submitSettings(form) {
  const daily = form.querySelector('input[name="st-daily"]:checked');
  const year = parseInt($('#st-year').value, 10);
  if (daily) data.settings.dailyGoal = Number(daily.value);
  if (year > 0) data.settings.yearGoal = year;
  save();
  closeSheet();
  render();
  toast('目標を保存しました');
}

/* ---------- メモ・感想・ふりかえり・書き出し（段階4） ---------- */
const NOTE_TYPES = [
  { id: 'quote', label: '印象に残った文' },
  { id: 'thought', label: '自分の考え' },
];
const notesOf = (bookId) => data.notes.filter((n) => n.bookId === bookId).sort((a, b) => (a.page || 0) - (b.page || 0));

function noteHtml(n, withBook = false) {
  const b = bookById(n.bookId);
  return `
    <article class="note note-${n.type}">
      <p class="note-text">${esc(n.text)}</p>
      <div class="note-meta">
        <span class="note-tag">${labelOf(NOTE_TYPES, n.type)}</span>
        ${withBook && b ? `<button class="link-btn" data-action="open-book" data-id="${b.id}">${esc(b.title)}</button>` : ''}
        ${n.page ? `<span class="num">p.${n.page}</span>` : ''}
        <span class="note-actions">
          <button class="del-btn" data-action="edit-note" data-id="${n.id}">編集</button>
          <button class="del-btn" data-action="delete-note" data-id="${n.id}">削除</button>
        </span>
      </div>
    </article>`;
}

// --- メモの追加・編集 ---
let noteReturn = null; // メモを保存したあとに戻る画面（タイマーなど）

function openNoteForm(bookId, noteId) {
  const n = noteId ? data.notes.find((x) => x.id === noteId) : null;
  const book = bookById(n ? n.bookId : bookId);
  if (!book) return;
  noteReturn = sheetMode === 'timer' ? 'timer' : sheetMode === 'detail' ? 'detail' : null;
  const page = n ? n.page : (data.timer && data.timer.bookId === book.id ? '' : lastPageOf(book.id) || '');
  openSheet(n ? 'メモを編集' : 'メモを残す', `
    <form class="form" id="note-form" data-book="${book.id}" data-id="${n ? n.id : ''}" novalidate>
      <div class="focus-book">${coverHtml(book, 'xs')}<div><strong>${esc(book.title)}</strong><span>${esc(book.author || '')}</span></div></div>
      ${segHtml('nf-type', NOTE_TYPES, n ? n.type : 'quote')}
      <div class="field"><label for="nf-text">内容</label>
        <textarea class="input" id="nf-text" rows="5" placeholder="心に残った一文や、読んで考えたこと">${esc(n ? n.text : '')}</textarea></div>
      <div class="field"><label for="nf-page">ページ</label>
        <input class="input" id="nf-page" type="number" inputmode="numeric" min="0" max="${book.totalPages}" value="${page}"></div>
      <p class="error" id="nf-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">保存する</button>
    </form>`, 'note');
  setTimeout(() => $('#nf-text')?.focus(), 250);
}

function submitNoteForm(form) {
  const text = $('#nf-text').value.trim();
  if (!text) { showError('#nf-error', '内容を入力してください。'); return; }
  const page = parseInt($('#nf-page').value, 10) || null;
  const type = form.querySelector('input[name="nf-type"]:checked').value;
  const id = form.dataset.id;
  const bookId = form.dataset.book;
  if (id) Object.assign(data.notes.find((x) => x.id === id), { text, page, type });
  else data.notes.push({ id: newId(), bookId, type, text, page, createdAt: new Date().toISOString() });
  save();
  toast('メモを保存しました');
  afterNote(bookId);
}

function afterNote(bookId) {
  render();
  if (noteReturn === 'timer' && data.timer) openTimerSheet();
  else if (noteReturn === 'detail') openBookDetail(bookId);
  else closeSheet();
}

// --- 読了時の感想とつながり ---
function openReviewForm(bookId, celebrateFirst = false) {
  const b = bookById(bookId);
  if (!b) return;
  const others = data.books.filter((x) => x.id !== bookId && (x.status === 'done' || x.status === 'reading'));
  const linked = new Set(b.links || []);
  openSheet(celebrateFirst ? '読了おめでとう！' : '感想とつながり', `
    <form class="form" id="review-form" data-id="${bookId}" novalidate>
      <div class="focus-book">${coverHtml(b, 'xs')}<div><strong>${esc(b.title)}</strong><span>${b.finishedAt ? `${fmtDate(b.finishedAt)} 読了` : ''}</span></div></div>
      <div class="field"><label for="rv-text">一言感想</label>
        <input class="input" id="rv-text" maxlength="140" value="${esc(b.review || '')}" placeholder="例：人類史を「虚構を信じる力」で読み解く視点が新鮮">
        <span class="field-hint">自分の言葉で、ひとことだけ。</span></div>
      <div class="field"><label for="rv-conn">他の本・分野とのつながり</label>
        <textarea class="input" id="rv-conn" rows="3" placeholder="例：経済学の「信用」の話とつながる。次は宗教の幹の本を読みたい">${esc(b.connections || '')}</textarea></div>
      ${others.length ? `<div class="field"><span class="field-label">つながっている本</span>
        <div class="link-chips">${others.map((o) => `
          <input type="checkbox" id="rv-link-${o.id}" value="${o.id}" ${linked.has(o.id) ? 'checked' : ''}>
          <label for="rv-link-${o.id}" style="--cover:${FIELD_COLORS[o.field] || '#4A4F5C'}">${esc(o.title)}</label>`).join('')}</div>
        <span class="field-hint">選んだ本どうしが、お互いの詳細画面に表示されます。</span></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">保存する</button>
      ${celebrateFirst ? '<button type="button" class="btn btn-ghost btn-block" data-action="close-sheet">あとで書く</button>' : ''}
    </form>`, 'review');
}

function submitReviewForm(form) {
  const b = bookById(form.dataset.id);
  b.review = $('#rv-text').value.trim();
  b.connections = $('#rv-conn').value.trim();
  const picked = [...form.querySelectorAll('.link-chips input:checked')].map((el) => el.value);
  // つながりは両方向にする（Aを選んだら、Aの側にもこの本を足す／外したら消す）
  const before = new Set(b.links || []);
  b.links = picked;
  for (const other of data.books) {
    if (other.id === b.id) continue;
    const set = new Set(other.links || []);
    if (picked.includes(other.id)) set.add(b.id);
    else if (before.has(other.id)) set.delete(b.id);
    other.links = [...set];
  }
  save();
  toast('感想を保存しました');
  render();
  openBookDetail(b.id);
}

// 本の詳細に出す「感想・つながり・メモ」のかたまり
function bookNotesHtml(b) {
  const links = (b.links || []).map(bookById).filter(Boolean);
  const notes = notesOf(b.id);
  return `
    ${b.status === 'done' ? `
      <div class="section">
        <div class="section-head"><h4 class="section-title">感想とつながり</h4>
          <button class="link-btn" data-action="review" data-id="${b.id}">${b.review || b.connections ? '編集' : '書く'}</button></div>
        ${b.review ? `<p class="review-quote">${esc(b.review)}</p>` : ''}
        ${b.connections ? `<p class="review-conn">${esc(b.connections)}</p>` : ''}
        ${!b.review && !b.connections ? '<p class="empty-small">一言感想と、他の本とのつながりを残しておこう。</p>' : ''}
      </div>` : ''}
    ${links.length ? `
      <div class="section">
        <h4 class="section-title">つながっている本</h4>
        <div class="link-list">${links.map((o) => `<button class="link-book" data-action="open-book" data-id="${o.id}">${coverHtml(o, 'xs')}<span>${esc(o.title)}<small>${esc(o.field)}</small></span></button>`).join('')}</div>
      </div>` : ''}
    <div class="section">
      <div class="section-head"><h4 class="section-title">メモ（${notes.length}）</h4>
        <button class="link-btn" data-action="add-note" data-id="${b.id}">＋ メモを残す</button></div>
      ${notes.length ? `<div class="list">${notes.map((n) => noteHtml(n)).join('')}</div>` : '<p class="empty-small">印象に残った文や、自分の考えをページ番号つきで残せます。</p>'}
    </div>`;
}

// --- 今日のふりかえり（毎日1つ、過去のメモを表示） ---
let reviewOffset = 0; // 「別のメモ」を押した回数
function dailyNote() {
  if (!data.notes.length) return null;
  // 日付から決まる番号で選ぶので、同じ日は同じメモになる
  const seed = [...todayStr()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sorted = [...data.notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted[(seed + reviewOffset) % sorted.length];
}

function dailyNoteHtml() {
  const n = dailyNote();
  if (!n) {
    return data.books.length ? `
      <section class="daily daily-empty">
        <span class="tile-label">今日のふりかえり</span>
        <p>本のメモを残すと、ここに毎日1つ、過去のメモが出てきます。読んだことを忘れないための復習です。</p>
      </section>` : '';
  }
  const b = bookById(n.bookId);
  return `
    <section class="daily">
      <div class="daily-head"><span class="tile-label">今日のふりかえり</span>
        ${data.notes.length > 1 ? '<button class="link-btn" data-action="next-daily">別のメモ</button>' : ''}</div>
      <p class="daily-text">${esc(n.text)}</p>
      <div class="daily-meta">
        <span class="note-tag">${labelOf(NOTE_TYPES, n.type)}</span>
        ${b ? `<button class="link-btn" data-action="open-book" data-id="${b.id}">${esc(b.title)}${n.page ? `・p.${n.page}` : ''}</button>` : ''}
      </div>
    </section>`;
}

// --- 本棚の「メモ」一覧 ---
let noteQuery = '';
function notesListHtml() {
  const q = noteQuery.trim().toLowerCase();
  const list = [...data.notes]
    .filter((n) => !q || n.text.toLowerCase().includes(q) || (bookById(n.bookId)?.title || '').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <input class="input" id="note-q" type="search" placeholder="メモを検索（言葉・本の名前）" value="${esc(noteQuery)}" autocomplete="off">
    ${list.length ? `<div class="list" id="note-list">${list.map((n) => noteHtml(n, true)).join('')}</div>`
      : `<p class="empty-small">${data.notes.length ? '見つかりませんでした。' : 'まだメモがありません。本の詳細画面の「＋ メモを残す」から書けます。'}</p>`}`;
}

// --- Markdown 書き出し（別のAIに読ませて、次に読む本を相談する用） ---
function buildMarkdown() {
  const now = new Date();
  const done = data.books.filter((b) => b.status === 'done').sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''));
  const totalMin = data.sessions.reduce((a, s) => a + s.minutes, 0);
  const totalPages = data.sessions.reduce((a, s) => a + sessionPages(s), 0);
  const stats = fieldStats();
  const posLabel = (id) => { const p = POSITIONS.find((x) => x.id === id); return p ? `${p.label}（${p.desc}）` : ''; };
  const line = (s) => String(s || '').replace(/\n+/g, ' ');
  const L = [];
  L.push('# 私の読書記録（ヨミチ）', '', `書き出し日：${toDateStr(now)}`, '');
  L.push('## 概要', '');
  L.push(`- 読了：${done.length}冊（${now.getFullYear()}年：${yearGoalInfo().done}冊／目標${data.settings.yearGoal}冊）`);
  L.push(`- 総読書時間：${fmtMinutes(totalMin)}、総ページ：${totalPages}ページ、平均の速さ：時速${speedOf(totalPages, totalMin)}ページ`);
  L.push(`- 開拓した分野：${stats.filter((s) => s.done).length}／18分野、幹（入門・古典）を読んだ分野：${stats.filter((s) => s.trunkDone).length}`);
  L.push('- 分類の考え方：「幹」＝その分野の入門・古典、「枝」＝応用、「葉」＝専門・細部', '');
  L.push('## 分野別の読了冊数', '', '| 分野 | 読了 | 読書中 | 幹を読了 |', '|---|---|---|---|');
  for (const s of stats) L.push(`| ${s.field} | ${s.done} | ${s.reading} | ${s.trunkDone ? '○' : '—'} |`);
  L.push('', `まだ0冊の分野：${stats.filter((s) => !s.done).map((s) => s.field).join('、') || 'なし'}`, '');
  L.push('## 読了した本', '');
  if (!done.length) L.push('（まだありません）');
  for (const b of done) {
    L.push(`### ${b.title}`, '');
    L.push(`- 著者：${b.author || '—'}／分野：${b.field}／位置：${posLabel(b.position)}／${labelOf(LANGS, b.lang)}／${b.totalPages}ページ`);
    if (b.finishedAt) L.push(`- 読了日：${b.finishedAt}`);
    if (b.review) L.push(`- 一言感想：${line(b.review)}`);
    if (b.connections) L.push(`- つながり：${line(b.connections)}`);
    const links = (b.links || []).map(bookById).filter(Boolean);
    if (links.length) L.push(`- つながっている本：${links.map((o) => o.title).join('、')}`);
    L.push('');
  }
  const others = (st) => data.books.filter((b) => b.status === st);
  for (const [st, title] of [['reading', '読書中の本'], ['want', '積読（持っていてまだ読んでいない本）'], ['wish', '欲しい本（まだ持っていない本）'], ['paused', '中断した本']]) {
    if (!others(st).length) continue;
    L.push(`## ${title}`, '');
    for (const b of others(st)) L.push(`- ${b.title}（${b.author || '著者不明'}／${b.field}／${posLabel(b.position)}${st === 'reading' ? `／${progressOf(b)}%` : ''}）`);
    L.push('');
  }
  L.push('## メモ', '');
  if (!data.notes.length) L.push('（まだありません）', '');
  for (const b of data.books) {
    const ns = notesOf(b.id);
    if (!ns.length) continue;
    L.push(`### ${b.title}`, '');
    for (const n of ns) L.push(`- ${n.type === 'quote' ? '【引用】' : '【考え】'}${n.page ? `p.${n.page} ` : ''}${line(n.text)}`);
    L.push('');
  }
  L.push('---', '');
  L.push('この記録をもとに、次に読む本を3〜5冊提案してください。');
  L.push('- 0冊の分野や「幹」がまだの分野を優先して、知識の地図の空白を埋めたいです');
  L.push('- 私の感想やメモから、興味の方向性も読み取ってください');
  L.push('- それぞれ、分野・幹/枝/葉のどれにあたるか・選んだ理由を添えてください');
  return L.join('\n');
}

async function exportMarkdown(asFile) {
  const md = buildMarkdown();
  if (asFile) {
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `yomichi-${todayStr()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Markdownファイルを保存しました');
    return;
  }
  try {
    await navigator.clipboard.writeText(md);
    toast('コピーしました。AIとの会話に貼り付けて相談してみよう');
  } catch (e) {
    const box = $('#md-text');
    box.hidden = false;
    box.value = md;
    box.select();
    toast('自動でコピーできませんでした。表示した文字を全部選んでコピーしてください');
  }
}

/* ---------- 積読タワー ---------- */
// 本の厚みはページ数から推定する（1ページ約0.06mm＋表紙2mm）。重さも同じく推定。
const thicknessMm = (b) => Math.max(5, (b.totalPages || 0) * 0.06 + 2);
const weightG = (b) => (b.totalPages || 0) * 1.1 + 60;
// 高さくらべの目印（mm）
const LANDMARKS = [
  [150, 'スマホの縦の長さ'], [300, '30cmものさし'], [700, '学校の机'], [1000, '1メートル'],
  [1700, '大人の身長'], [3050, 'バスケットのゴール'], [6000, '2階建ての家'], [12000, '電柱'],
  [100000, '30階建てのビル'], [333000, '東京タワー'], [634000, '東京スカイツリー'],
];
let towerKind = 'want'; // 'want'（積読）か 'done'（読了）

function fmtLength(mm) {
  if (mm < 1000) return `${(mm / 10).toFixed(mm < 100 ? 1 : 0)}cm`;
  return `${(mm / 1000).toFixed(mm < 10000 ? 2 : 1)}m`;
}

function towerStats(kind) {
  const books = data.books.filter((b) => b.status === kind).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const height = books.reduce((a, b) => a + thicknessMm(b), 0);
  const priced = books.filter((b) => b.price > 0);
  const pages = books.reduce((a, b) => a + (b.totalPages || 0), 0);
  const passed = [...LANDMARKS].reverse().find(([h]) => h <= height);
  const next = LANDMARKS.find(([h]) => h > height);
  return {
    books, height, pages, priced,
    price: priced.reduce((a, b) => a + b.price, 0),
    weight: books.reduce((a, b) => a + weightG(b), 0),
    passed, next,
  };
}

function towerHtml() {
  const t = towerStats(towerKind);
  const kindSeg = segHtml('tower-kind', [{ id: 'want', label: '積読タワー' }, { id: 'done', label: '読了タワー' }], towerKind);
  if (!t.books.length) {
    return `${kindSeg}<p class="empty-small">${towerKind === 'want' ? '状態を「積読」にした本が、ここに積み上がります。' : '読了した本が、ここに積み上がります。'}</p>`;
  }
  // 読む速さ（これまでの平均）から、全部読むのにかかる時間を出す
  const totalMin = data.sessions.reduce((a, s) => a + s.minutes, 0);
  const speed = speedOf(data.sessions.reduce((a, s) => a + sessionPages(s), 0), totalMin) || 40;
  const hours = t.pages / speed;
  const days = Math.ceil((hours * 60) / data.settings.dailyGoal);
  const scale = Math.min(2.2, 460 / t.height); // 1mmを何pxで描くか
  const seed = (id) => [...id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5);
  const spines = t.books.map((b) => {
    const h = Math.max(4, thicknessMm(b) * scale);
    const r = seed(b.id);
    return `<button class="spine ${h < 15 ? 'thin' : ''}" data-action="open-book" data-id="${b.id}"
        style="height:${h}px;width:${64 + (r % 28)}%;margin-left:${(r >> 5) % 12}%;--cover:${FIELD_COLORS[b.field] || '#4A4F5C'}"
        title="${esc(b.title)}"><span>${esc(mainTitle(b.title))}</span>${b.position === 'trunk' ? '<i>幹</i>' : ''}</button>`;
  }).join('');

  return `
    ${kindSeg}
    <div class="tower-card">
      <div class="tower-head">
        <span class="tile-label">${towerKind === 'want' ? '積んだ本は、これから開拓する知の地図' : 'ここまで読んできた本の高さ'}</span>
        <div class="tower-big"><span class="big">${fmtLength(t.height)}</span><small>${t.books.length}冊</small></div>
        <p class="tower-compare">${t.passed ? `「${t.passed[1]}」を超えました。` : ''}${t.next ? `次は「${t.next[1]}」まで、あと${fmtLength(t.next[0] - t.height)}。` : '最高到達点です！'}</p>
      </div>
      <div class="tower" aria-label="本を積み上げた図">
        ${t.next ? `<div class="tower-goal" style="bottom:${Math.min(t.next[0] * scale, t.height * scale + 22) + 6}px"><span>${t.next[1]}</span></div>` : ''}
        <div class="tower-stack">${spines}</div>
        <div class="tower-floor"></div>
      </div>
    </div>
    <div class="kpis">
      <div><small>総額</small><span class="big">${t.price ? (t.price >= 10000 ? `${(t.price / 10000).toFixed(1)}<small>万円</small>` : `${t.price.toLocaleString()}<small>円</small>`) : '—'}</span>${t.priced.length < t.books.length ? `<small>値段未入力${t.books.length - t.priced.length}冊</small>` : ''}</div>
      <div><small>総ページ</small><span class="big">${t.pages.toLocaleString()}<small>p</small></span></div>
      <div><small>重さ（推定）</small><span class="big">${(t.weight / 1000).toFixed(1)}<small>kg</small></span></div>
    </div>
    ${towerKind === 'want' ? `<p class="forecast">あなたの速さ（時速${speed}ページ）なら、全部読むのに約<strong>${Math.round(hours)}時間</strong>。1日${data.settings.dailyGoal}分ずつなら<strong>${days}日</strong>で読み切れます。</p>` : ''}`;
}

function towerTeaserHtml() {
  const t = towerStats('want');
  if (!t.books.length) return '';
  return `
    <button class="tower-teaser" data-action="open-tower">
      <span class="teaser-spines" aria-hidden="true">${t.books.slice(-5).map((b) => `<i style="--cover:${FIELD_COLORS[b.field] || '#4A4F5C'}"></i>`).join('')}</span>
      <span class="teaser-text"><span class="tile-label">積読タワー</span><strong><span class="big">${fmtLength(t.height)}</span>・${t.books.length}冊</strong></span>
      <span class="teaser-go">見る</span>
    </button>`;
}

/* ---------- 7. 読書タイマー ---------- */
// タイマーの状態は data.timer に保存する。
//   accMs: 一時停止までにたまった時間 / startedAt: 最後にスタート（再開）した時刻
// こうしておくと、画面を閉じても「今の時刻 − 開始時刻」で正しい経過時間に戻せる。
function timerElapsed() {
  const t = data.timer;
  if (!t) return 0;
  return t.accMs + (t.running ? Date.now() - t.startedAt : 0);
}
// タイマー表示用：1文字ずつ同じ幅の箱に入れる（数字の幅で表示が揺れないように）
const clockHtml = (ms) => [...fmtClock(ms)].map((c) => `<span class="${c === ':' ? 'd colon' : 'd'}">${c}</span>`).join('');
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function startTimer(bookId) {
  if (data.timer) { openTimerSheet(); return; }
  const book = bookById(bookId);
  if (!book) return;
  data.timer = { bookId, startPage: lastPageOf(bookId), accMs: 0, startedAt: Date.now(), running: true, date: todayStr() };
  if (book.status !== 'reading') book.status = 'reading';
  save();
  openTimerSheet();
  render();
}

function toggleTimer() {
  const t = data.timer;
  if (!t) return;
  if (t.running) { t.accMs += Date.now() - t.startedAt; t.running = false; releaseWakeLock(); }
  else { t.startedAt = Date.now(); t.running = true; if (sheetMode === 'timer') requestWakeLock(); }
  save();
  if (sheetMode === 'timer') openTimerSheet(); else renderPlayer();
}

const FOCUS_R = 120;
const FOCUS_C = 2 * Math.PI * FOCUS_R;

function openTimerSheet() {
  const t = data.timer;
  const b = t && bookById(t.bookId);
  if (!b) { data.timer = null; save(); return; }
  openSheet('読書タイマー', `
    <div class="focus">
      <div class="focus-book">${coverHtml(b, 'xs')}<div><strong>${esc(b.title)}</strong><span>${t.startPage}ページから読書中</span></div></div>
      <div class="focus-ring">
        <svg viewBox="0 0 270 270" aria-hidden="true">
          <circle cx="135" cy="135" r="${FOCUS_R}" fill="none" stroke="var(--surface-2)" stroke-width="18"/>
          <circle id="focus-bar" cx="135" cy="135" r="${FOCUS_R}" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-dasharray="${FOCUS_C}" stroke-dashoffset="${FOCUS_C}"/>
        </svg>
        <div class="focus-center">
          <span class="big focus-digits ${t.running ? '' : 'paused'}" id="timer-digits" role="timer">${clockHtml(timerElapsed())}</span>
          <span class="focus-today" id="timer-today"></span>
        </div>
      </div>
      <div class="focus-controls">
        <div class="ctrl"><button class="round-btn" data-action="toggle-timer" aria-label="${t.running ? '一時停止' : '再開'}">${t.running ? ICONS.pause : ICONS.play}</button>${t.running ? '一時停止' : '再開'}</div>
        <div class="ctrl"><button class="round-btn small" data-action="finish-timer" aria-label="終了して記録">${ICONS.stop}</button>終了</div>
      </div>
      <button class="btn btn-ghost btn-small" data-action="add-note" data-id="${b.id}">＋ 読みながらメモする</button>
      <p class="field-hint">画面を閉じても、タイマーは裏で進み続けます。</p>
      <button class="del-btn" data-action="discard-timer">記録せずにタイマーを取り消す</button>
    </div>`, 'timer');
  tick();
  if (t.running) requestWakeLock();
}

// 「終了」を押したら：一時停止して、何ページまで読んだかを聞く
function openFinishForm() {
  const t = data.timer;
  if (!t) return;
  if (t.running) { t.accMs += Date.now() - t.startedAt; t.running = false; save(); }
  releaseWakeLock();
  const b = bookById(t.bookId);
  const minutes = Math.max(1, Math.round(t.accMs / 60000));
  openSheet('おつかれさま！', `
    <form class="form" id="finish-form" novalidate>
      <div class="focus-book">${coverHtml(b, 'xs')}<div><strong>${esc(b.title)}</strong><span>${fmtClock(t.accMs)}読みました（${t.startPage}ページから）</span></div></div>
      <div class="field"><label for="ff-end">何ページまで読んだ？</label>
        <div class="stepper">
          <button type="button" class="step-btn" data-action="step" data-n="-1" aria-label="1ページ減らす">−1</button>
          <input class="input" id="ff-end" type="number" inputmode="numeric" min="${t.startPage}" max="${b.totalPages}" value="${t.startPage}">
          <button type="button" class="step-btn" data-action="step" data-n="1" aria-label="1ページ増やす">＋1</button>
        </div>
        <div class="quick-steps">
          ${[5, 10, 20, 30].map((n) => `<button type="button" class="btn btn-ghost btn-small" data-action="step" data-n="${n}">＋${n}</button>`).join('')}
        </div>
      </div>
      <div class="result">
        <div><small>ページ</small><span class="big" id="ff-pages">0</span></div>
        <div><small>時間</small><span class="big">${minutes}<small>分</small></span></div>
        <div><small>時速</small><span class="big" id="ff-speed">0</span></div>
      </div>
      <p class="error" id="ff-error" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">記録する</button>
      <button type="button" class="btn btn-ghost btn-block" data-action="resume-timer">まだ読む（タイマーに戻る）</button>
    </form>`, 'finish');
  updateFinishPreview();
}

function updateFinishPreview() {
  const t = data.timer;
  const end = parseInt($('#ff-end').value, 10) || 0;
  const pages = Math.max(0, end - t.startPage);
  $('#ff-pages').textContent = pages;
  $('#ff-speed').textContent = speedOf(pages, Math.max(1, Math.round(t.accMs / 60000)));
}

function submitFinish() {
  const t = data.timer;
  const book = bookById(t.bookId);
  const endPage = parseInt($('#ff-end').value, 10);
  const problem = !(endPage >= 0) ? '読み終えたページを入力してください。'
    : endPage < t.startPage ? `読み始めた${t.startPage}ページより小さくなっています。`
    : endPage > book.totalPages ? `この本は${book.totalPages}ページまでです。` : '';
  if (problem) { showError('#ff-error', problem); return; }
  const minutes = Math.max(1, Math.round(t.accMs / 60000));
  const { startPage, date } = t;
  data.timer = null;
  addSession({ book, date, minutes, startPage, endPage, source: 'timer' });
}

// 1秒ごとに表示を更新（タイマーが動いているときだけ）
function tick() {
  const t = data.timer;
  if (!t) return;
  const ms = timerElapsed();
  const digits = $('#timer-digits');
  if (digits) {
    digits.innerHTML = clockHtml(ms);
    const goal = data.settings.dailyGoal;
    const total = minutesOn(todayStr()) + ms / 60000;
    $('#timer-today').textContent = `今日 ${Math.floor(total)}／${goal}分`;
    $('#focus-bar').setAttribute('stroke-dashoffset', FOCUS_C * (1 - Math.min(1, total / goal)));
  }
  const mini = $('#player-time');
  if (mini) mini.innerHTML = clockHtml(ms);
}
setInterval(tick, 500);

// ミニプレーヤー：タイマー中で、タイマー画面を開いていないときに出す
function renderPlayer() {
  const el = $('#player');
  const t = data.timer;
  const show = !!t && sheetMode !== 'timer' && sheetMode !== 'finish';
  el.hidden = !show;
  document.body.classList.toggle('has-player', show);
  if (!show) return;
  const b = bookById(t.bookId);
  if (!b) return;
  el.innerHTML = `
    ${coverHtml(b, 'xs')}
    <div class="player-main" data-action="open-timer">
      <span class="player-title">${esc(b.title)}</span>
      <span class="player-time ${t.running ? '' : 'paused'}" id="player-time">${clockHtml(timerElapsed())}</span>
    </div>
    <button class="player-btn" data-action="toggle-timer" aria-label="${t.running ? '一時停止' : '再開'}">${t.running ? ICONS.pause : ICONS.play}</button>`;
  el.dataset.action = 'open-timer';
}

// 読書中に画面が暗くならないようにする（対応している端末だけ）
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseWakeLock() {
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* 何もしない */ }
  wakeLock = null;
}

/* ---------- 8. お祝いとお知らせ ---------- */
function celebrate() {
  try { navigator.vibrate?.(40); } catch (e) { /* 対応していない端末は無視 */ }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.hidden = false;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--blue', '--coral', '--butter', '--mint'].map((v) => css.getPropertyValue(v).trim());
  const parts = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const startT = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (now - startT < 2200) requestAnimationFrame(frame);
    else { cv.hidden = true; ctx.setTransform(1, 0, 0, 1, 0, 0); }
  })(startT);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

// 削除は2回押しで確定（スマホでは確認ダイアログが出ない環境があるため）
function armOrRun(btn, run) {
  if (btn.dataset.armed === 'true') { run(); return; }
  btn.dataset.armed = 'true';
  const original = btn.textContent;
  btn.textContent = 'もう一度押すと確定';
  setTimeout(() => { if (document.body.contains(btn)) { btn.dataset.armed = 'false'; btn.textContent = original; } }, 3000);
}

/* ---------- サンプルデータ ---------- */
function loadSample() {
  const now = new Date();
  const ago = (n) => toDateStr(addDays(now, -n));
  const mk = (title, author, field, totalPages, status, position, lang = 'ja', finishedAt = null) => ({
    id: newId(), title, author, field, totalPages, status, position, lang, finishedAt, sample: true, createdAt: new Date().toISOString(),
  });
  const b1 = mk('サピエンス全史 上', 'ユヴァル・ノア・ハラリ', '歴史', 300, 'reading', 'trunk');
  const b2 = mk('ファスト&スロー 上', 'ダニエル・カーネマン', '心理学・認知科学', 420, 'reading', 'trunk');
  const b3 = mk('利己的な遺伝子', 'リチャード・ドーキンス', '生物・進化', 560, 'done', 'trunk', 'ja', ago(20));
  const b4 = mk('The Little Schemer', 'Friedman & Felleisen', 'コンピュータ・AI', 216, 'want', 'branch', 'en');
  const b5 = mk('ゲーデル、エッシャー、バッハ', 'ダグラス・ホフスタッター', '数学・統計', 760, 'want', 'leaf');
  const b6 = mk('国家はなぜ衰退するのか 上', 'アセモグル & ロビンソン', '経済学', 360, 'done', 'trunk', 'ja', ago(48));
  const b7 = mk('ソフィーの世界', 'ヨースタイン・ゴルデル', '哲学・倫理', 680, 'done', 'trunk', 'ja', ago(100));
  const b8 = mk('銃・病原菌・鉄 上', 'ジャレド・ダイアモンド', '歴史', 416, 'done', 'branch', 'ja', ago(140));
  const b9 = mk('イシューからはじめよ', '安宅和人', '経営・起業', 240, 'done', 'leaf', 'ja', ago(75));
  const b10 = mk('宇宙は何でできているのか', '村山斉', '物理学・宇宙', 270, 'want', 'trunk');
  const b11 = mk('利己的な遺伝子 40周年記念版', 'リチャード・ドーキンス', '生物・進化', 584, 'wish', 'trunk');
  const b12 = mk('ホモ・デウス 上', 'ユヴァル・ノア・ハラリ', '歴史', 304, 'want', 'branch');
  const b13 = mk('宗教の起源', 'ロビン・ダンバー', '宗教', 352, 'want', 'trunk');
  Object.assign(b4, { price: 4800 }); Object.assign(b5, { price: 6380 }); Object.assign(b10, { price: 836 });
  Object.assign(b11, { price: 2970 }); Object.assign(b12, { price: 2090 }); Object.assign(b13, { price: 2970 });
  data.books.push(b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13);
  const ses = (book, n, minutes, s, e) => ({
    id: newId(), bookId: book.id, date: ago(n), minutes, startPage: s, endPage: e,
    source: 'manual', sample: true, createdAt: new Date(Date.now() - n * 86400000).toISOString(),
  });
  data.sessions.push(
    // 過去の読了本：読了日までの数日に分けて記録
    ...[b6, b7, b8, b9].flatMap((bk) => {
      const end = daysBetween(parseDate(bk.finishedAt), now);
      const n = 6;
      return Array.from({ length: n }, (_, k) => ses(bk, end + (n - 1 - k) * 3, 40 + (k % 3) * 10,
        Math.round((bk.totalPages * k) / n), Math.round((bk.totalPages * (k + 1)) / n)));
    }),
    ses(b3, 24, 60, 480, 530), ses(b3, 20, 40, 530, 560),
    ses(b1, 9, 35, 0, 28), ses(b1, 6, 50, 28, 66), ses(b2, 5, 30, 0, 22), ses(b1, 4, 25, 66, 84),
    ses(b1, 3, 30, 84, 101), ses(b2, 2, 25, 22, 40), ses(b1, 1, 20, 101, 118),
  );
  b3.review = '生き物を「遺伝子の乗り物」と見る視点で、世界の見え方が変わった';
  b3.connections = '心理学の「人はなぜ協力するのか」の話とつながる。次は進化心理学の本へ';
  b3.links = [b2.id]; b2.links = [b3.id];
  b6.review = '国の豊かさを決めるのは地理より制度、という主張に納得';
  const note = (book, type, page, text, n) => ({ id: newId(), bookId: book.id, type, page, text, sample: true, createdAt: new Date(Date.now() - n * 86400000).toISOString() });
  data.notes.push(
    note(b1, 'quote', 41, '虚構のおかげで、私たちはたんに物事を想像するだけでなく、集団でそうすることができるようになった。', 6),
    note(b1, 'thought', 88, 'お金も国家も「みんなが信じている物語」だと考えると、経済学の本の読み方が変わりそう。', 3),
    note(b2, 'quote', 30, 'システム1は自動的に高速で働き、努力はまったく不要か、必要であってもわずかである。', 2),
    note(b3, 'thought', 540, '利他的に見える行動も、遺伝子の視点で見ると説明できる。人間の道徳はどこから来るのか、哲学の本でも考えたい。', 21),
  );
  save();
  render();
  toast('サンプルを入れました。本棚の一番下からいつでも消せます');
}

function clearSample() {
  const ids = new Set(data.books.filter((b) => b.sample).map((b) => b.id));
  data.books = data.books.filter((b) => !b.sample);
  data.sessions = data.sessions.filter((s) => !s.sample && !ids.has(s.bookId));
  data.notes = data.notes.filter((n) => !ids.has(n.bookId));
  for (const o of data.books) if (o.links) o.links = o.links.filter((x) => !ids.has(x));
  if (data.timer && ids.has(data.timer.bookId)) data.timer = null;
  save();
  render();
  toast('サンプルデータを消しました');
}

/* ---------- 9. ボタン操作の受け付けと起動 ---------- */
function go(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  document.querySelectorAll('.tab[data-view]').forEach((t) => {
    if (t.dataset.view === view || (view === 'history' && t.dataset.view === 'home')) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}

// data-action="..." がついた要素が押されたら、ここで処理を振り分ける
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'go': if (sheetMode) closeSheet(); go(el.dataset.view); break;
    case 'record': openRecordSheet(id, el.dataset.mode); break;
    case 'add-book': openBookForm(null, el.dataset.field || ''); break;
    case 'book-search': searchBooks(); break;
    case 'pick-result': pickResult(Number(el.dataset.i)); break;
    case 'remove-cover': formCover = { ...formCover, coverUrl: '', coverData: '' }; refreshCoverPreview(); break;
    case 'open-field': openFieldSheet(el.dataset.field); break;
    case 'bar': chartSel[el.dataset.chart] = Number(el.dataset.i); renderStats(); break;
    case 'edit-book': openBookForm(id); break;
    case 'open-book': openBookDetail(id); break;
    case 'close-sheet': closeSheet(); break;
    case 'settings': openSettings(); break;
    case 'export-json': exportJson(); break;
    case 'export-md': exportMarkdown(false); break;
    case 'export-md-file': exportMarkdown(true); break;
    case 'add-note': openNoteForm(id); break;
    case 'edit-note': openNoteForm(null, id); break;
    case 'review': openReviewForm(id); break;
    case 'open-tower': shelfMode = 'tower'; towerKind = 'want'; go('books'); break;
    case 'next-daily': reviewOffset++; renderHome(); break;
    case 'delete-note':
      armOrRun(el, () => {
        const n = data.notes.find((x) => x.id === id);
        data.notes = data.notes.filter((x) => x.id !== id);
        save();
        render();
        if (sheetMode === 'detail' && n) openBookDetail(n.bookId);
        toast('メモを削除しました');
      });
      break;
    case 'import-json': armOrRun(el, importJson); break;
    case 'filter': bookFilter = el.dataset.status; renderBooks(); break;
    case 'load-sample': loadSample(); break;
    case 'clear-sample': armOrRun(el, clearSample); break;
    case 'start-timer': e.stopPropagation(); startTimer(id || $('#rs-book')?.value); break;
    case 'toggle-timer': e.stopPropagation(); toggleTimer(); break;
    case 'open-timer': openTimerSheet(); break;
    case 'finish-timer': openFinishForm(); break;
    case 'resume-timer': toggleTimer(); openTimerSheet(); break;
    case 'step': {
      const input = $('#ff-end');
      const t = data.timer;
      const max = bookById(t.bookId).totalPages;
      input.value = Math.min(max, Math.max(t.startPage, (parseInt(input.value, 10) || 0) + Number(el.dataset.n)));
      updateFinishPreview();
      break;
    }
    case 'discard-timer':
      armOrRun(el, () => { data.timer = null; save(); closeSheet(); render(); toast('タイマーを取り消しました'); });
      break;
    case 'delete-session':
      armOrRun(el, () => {
        data.sessions = data.sessions.filter((s) => s.id !== id);
        save();
        if (sheetMode === 'detail') closeSheet();
        render();
        toast('記録を削除しました');
      });
      break;
    case 'delete-book':
      armOrRun(el, () => {
        const b = bookById(id);
        data.books = data.books.filter((x) => x.id !== id);
        data.sessions = data.sessions.filter((s) => s.bookId !== id);
        data.notes = data.notes.filter((n) => n.bookId !== id);
        for (const o of data.books) if (o.links) o.links = o.links.filter((x) => x !== id);
        if (data.timer && data.timer.bookId === id) data.timer = null;
        save();
        closeSheet();
        render();
        toast(`「${b.title}」を削除しました`);
      });
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetMode) closeSheet();
  // 検索欄でEnterを押したら、フォームを送信せずに検索する
  if (e.key === 'Enter' && e.target.id === 'bs-q') { e.preventDefault(); searchBooks(); }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'book-form') submitBookForm(e.target);
  if (e.target.id === 'log-form') submitLogForm();
  if (e.target.id === 'finish-form') submitFinish();
  if (e.target.id === 'settings-form') submitSettings(e.target);
  if (e.target.id === 'note-form') submitNoteForm(e.target);
  if (e.target.id === 'review-form') submitReviewForm(e.target);
});

document.addEventListener('input', (e) => {
  if (e.target.closest('#log-form')) updateLogPreview();
  if (e.target.id === 'ff-end') updateFinishPreview();
  if (e.target.id === 'note-q') {
    noteQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderBooks();
    const box = $('#note-q');
    box.focus();
    box.setSelectionRange(pos, pos);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'rs-book') {
    const start = lastPageOf(e.target.value);
    $('#lf-start').value = start;
    $('#rs-from').textContent = `${start}ページ`;
    updateLogPreview();
  }
  if (e.target.name === 'rs-mode') {
    $('#panel-timer').hidden = e.target.value !== 'timer';
    $('#log-form').hidden = e.target.value !== 'manual';
  }
  if (e.target.name === 'bf-status') $('#bf-finished-wrap').hidden = e.target.value !== 'done';
  if (e.target.id === 'bf-photo') loadPhoto(e.target.files[0]);
  if (e.target.id === 'bf-field' || e.target.name === 'bf-pos') refreshCoverPreview();
  if (e.target.name === 'shelf-mode') { shelfMode = e.target.value; renderBooks(); }
  if (e.target.name === 'tower-kind') { towerKind = e.target.value; renderBooks(); }
  if (e.target.name === 'stats-range') { statsRange = e.target.value; chartSel.time = null; renderStats(); }
});

// 別のアプリから戻ってきたとき、日付が変わっていれば表示を更新
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { render(); tick(); }
});

// 表紙画像が読み込めなかったら（通信できない等）、自動の表紙に切り替える
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.parentElement?.classList.contains('cover-img')) img.parentElement.classList.add('img-failed');
}, true);

// 起動
render();
