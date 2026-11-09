/* =========================================================
   ヨミチ — 交流機能（タイムライン・いいね・コメント・フォロー・プロフィール）
   Firebase（Googleのサーバー）を使う。読書記録と知の版図だけを共有し、
   メモ・感想・積読などは今までどおりスマホの中だけに置く。
   app.js の関数（render, openSheet, esc など）をそのまま使う。
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut, connectAuthEmulator,
  deleteUser, reauthenticateWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, increment, writeBatch, getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAG8Tvn6MbgnhN6S-uaC4aLaqEPTY_jbxw',
  authDomain: 'yomichi-79af4.firebaseapp.com',
  projectId: 'yomichi-79af4',
  storageBucket: 'yomichi-79af4.firebasestorage.app',
  messagingSenderId: '57386378025',
  appId: '1:57386378025:web:64fb9efd1ad9c5872a4d38',
};

// テスト用：URLに ?emu を付けると、本番ではなく練習用のFirebase（エミュレーター）につなぐ
const EMU = new URLSearchParams(location.search).has('emu');
const fbApp = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-yomichi' } : firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

// 交流機能の状態
const S = {
  ready: false,      // ログイン状態がわかったか
  user: null,        // ログイン中のユーザー
  profile: null,     // 自分のプロフィール
  following: new Set(),
  feed: 'all',       // 'all'（みんな）か 'following'（フォロー中）
  posts: [],
  liked: new Set(),
  blocked: new Set(), // 自分がブロックした人
  admin: false,       // 管理者かどうか
  reports: [],        // 管理者が見る通報の一覧
  loading: false,
  error: '',
};
// 通報して自分の画面から隠した投稿・コメント（この端末に覚えておく）
const hidden = () => (data.settings.hiddenItems = data.settings.hiddenItems || []);
const isHidden = (id) => hidden().includes(id);
const REASONS = ['嫌がらせ・悪口', 'スパム・宣伝', '不適切な内容', 'なりすまし', 'その他'];

const sharing = () => data.settings.shareTimeline !== false;
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : Date.now());

function timeAgo(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  const dt = new Date(ms);
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

function avatarHtml(name, photo, size = 40) {
  const initial = esc((name || '?').slice(0, 1));
  return photo
    ? `<img class="avatar" src="${esc(photo)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="avatar avatar-initial" style="width:${size}px;height:${size}px">${initial}</span>`;
}

/* ---------- ログイン ---------- */
async function login() {
  S.error = '';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    const code = e.code || '';
    S.error = code === 'auth/popup-blocked' ? 'ログイン画面が開けませんでした。ブラウザのポップアップを許可してから、もう一度どうぞ。'
      : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? ''
      : code === 'auth/unauthorized-domain' ? 'このサイトからのログインがまだ許可されていません（Firebaseの承認済みドメインの設定が必要です）。'
      : 'ログインできませんでした。電波を確認して、もう一度どうぞ。';
    rerender();
  }
}

// テスト用：エミュレーターで、Googleログインのふりをする
async function testLogin(sub, name) {
  if (!EMU) return;
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name }));
  await signInWithCredential(auth, cred);
}

onAuthStateChanged(auth, async (u) => {
  S.user = u;
  S.profile = null;
  S.following = new Set();
  S.blocked = new Set();
  S.admin = false;
  S.posts = [];
  if (u) {
    try {
      await ensureProfile();
      await loadFollowing();
      await loadBlocks();
      S.admin = await getDoc(doc(db, 'admins', u.uid)).then((d) => d.exists()).catch(() => false);
      await syncProfile();
    } catch (e) { S.error = '交流機能のデータを読み込めませんでした。'; }
  }
  S.ready = true;
  rerender();
  if (u && currentView === 'social') loadFeed();
});

async function ensureProfile() {
  const ref = doc(db, 'users', S.user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) { S.profile = snap.data(); return; }
  S.profile = {
    name: (S.user.displayName || '読書家').slice(0, 30),
    photo: S.user.photoURL || '',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, S.profile);
}

// 自分の公開プロフィール（連続日数・読了冊数・今週の時間・知の版図）を最新にする
async function syncProfile() {
  if (!S.user || !S.profile) return;
  const world = worldStats();
  const realm = {};
  for (const [field, r] of Object.entries(world.realms)) if (r.conquered || r.castle) realm[field] = { c: r.conquered, k: r.castle ? 1 : 0 };
  const emp = empireCompare(world.conquered);
  const patch = {
    name: S.profile.name,
    photo: S.profile.photo || '',
    streak: streakInfo().current,
    doneCount: data.books.filter((b) => b.status === 'done').length,
    weekMinutes: summarize(weekStart(new Date()), 7).minutes,
    realm, realmPct: world.pct, countries: Object.values(world.realms).filter((r) => r.conquered).length,
    empire: emp.passed ? emp.passed.name : '',
    // 教養の称号と知のかたち
    title: knowledgeShape().title.name, shape: knowledgeShape().type.name,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', S.user.uid), patch, { merge: true });
  Object.assign(S.profile, patch);
}

async function loadBlocks() {
  const snap = await getDocs(collection(db, 'users', S.user.uid, 'blocks'));
  S.blocked = new Set(snap.docs.map((d) => d.id));
}

async function loadFollowing() {
  const snap = await getDocs(query(collection(db, 'follows'), where('from', '==', S.user.uid)));
  S.following = new Set(snap.docs.map((d) => d.data().to));
}

/* ---------- 投稿（読書を記録したとき app.js から呼ばれる） ---------- */
async function afterSession({ book, minutes, pages, finished }) {
  if (!S.user) return;
  try {
    if (sharing()) {
      await addDoc(collection(db, 'posts'), {
        uid: S.user.uid, name: S.profile.name, photo: S.profile.photo || '',
        title: knowledgeShape().title.name,
        kind: finished ? 'finish' : 'read',
        // 写真で撮った表紙は大きいので共有しない（ネットの表紙だけ）
        book: { title: book.title, author: book.author || '', field: book.field || '', position: book.position || '', cover: /^https:/.test(book.coverUrl || '') ? book.coverUrl : '' },
        minutes, pages,
        likeCount: 0, commentCount: 0, createdAt: serverTimestamp(),
      });
    }
    await syncProfile();
    if (currentView === 'social') loadFeed();
  } catch (e) { /* 電波がないときは投稿しない（記録自体はスマホに保存済み） */ }
}

/* ---------- タイムライン ---------- */
async function loadFeed() {
  if (!S.user) return;
  S.loading = true;
  rerender();
  try {
    let posts = [];
    if (S.feed === 'all') {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40)));
      posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      const ids = [...S.following, S.user.uid];
      for (let i = 0; i < ids.length; i += 30) {
        const snap = await getDocs(query(collection(db, 'posts'), where('uid', 'in', ids.slice(i, i + 30)), limit(80)));
        posts.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      posts.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
      posts = posts.slice(0, 40);
    }
    // ブロックした人の投稿と、通報して隠した投稿は出さない
    S.posts = posts.filter((p) => !S.blocked.has(p.uid) && !isHidden(p.id));
    posts = S.posts;
    if (S.admin) await loadReports();
    // 自分がいいねした投稿を調べる
    const likes = await Promise.all(posts.map((p) => getDoc(doc(db, 'posts', p.id, 'likes', S.user.uid)).then((s) => s.exists()).catch(() => false)));
    S.liked = new Set(posts.filter((p, i) => likes[i]).map((p) => p.id));
    S.error = '';
  } catch (e) {
    S.error = 'タイムラインを読み込めませんでした。電波を確認して、下に引っ張るか「更新」を押してください。';
  }
  S.loading = false;
  rerender();
}

function postHtml(p) {
  const mine = p.uid === S.user.uid;
  const b = p.book || {};
  const pos = POSITIONS.find((x) => x.id === b.position);
  const text = p.kind === 'finish'
    ? `<strong>『${esc(b.title)}』</strong>を<strong class="finish">読了</strong>しました${p.minutes ? `（最後は${fmtMinutes(p.minutes)}・${p.pages}ページ）` : ''}`
    : `<strong>『${esc(b.title)}』</strong>を<strong>${fmtMinutes(p.minutes)}</strong>・<strong>${p.pages}ページ</strong>読みました`;
  return `
    <article class="post ${p.kind === 'finish' ? 'post-finish' : ''}">
      <button class="post-user" data-action="sx-profile" data-uid="${esc(p.uid)}">${avatarHtml(p.name, p.photo)}</button>
      <div class="post-body">
        <div class="post-head">
          <button class="post-name" data-action="sx-profile" data-uid="${esc(p.uid)}">${esc(p.name)}</button>
          ${p.title ? `<span class="title-chip small">${esc(p.title)}</span>` : ''}
          <span class="post-time">${timeAgo(tsMs(p.createdAt))}</span>
        </div>
        <p class="post-text">${text}</p>
        <div class="post-book">
          ${coverHtml({ title: b.title, author: b.author, field: b.field, position: b.position || 'trunk', coverUrl: b.cover }, 'xs')}
          <span class="chips">${b.field ? `<span class="chip" style="--cover:${FIELD_COLORS[b.field] || '#4A4F5C'}">${esc(b.field)}</span>` : ''}${pos ? `<span class="chip chip-pos">${pos.label}</span>` : ''}</span>
        </div>
        <div class="post-actions">
          <button class="post-act ${S.liked.has(p.id) ? 'on' : ''}" data-action="sx-like" data-id="${p.id}" aria-pressed="${S.liked.has(p.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>${p.likeCount || 0}</button>
          <button class="post-act" data-action="sx-comments" data-id="${p.id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>${p.commentCount || 0}</button>
          ${mine ? `<button class="del-btn" data-action="sx-delete-post" data-id="${p.id}">削除</button>`
            : `<button class="post-more" data-action="sx-menu" data-id="${p.id}" data-uid="${esc(p.uid)}" aria-label="通報・ブロック">…</button>`}
        </div>
      </div>
    </article>`;
}

function render() {
  const el = $('#view-social');
  if (!S.ready) { el.innerHTML = '<p class="empty-small">読み込み中…</p>'; return; }
  if (!S.user) {
    el.innerHTML = `
      <section class="social-hero">
        <span class="tile-label">みんなの読書</span>
        <h2>読んでいるのは、あなただけじゃない。</h2>
        <p>Googleアカウントでログインすると、みんなの読書記録が流れるタイムラインに参加できます。いいねやコメントで励まし合ったり、他の人の「知の版図」をのぞいたりできます。</p>
        <ul class="social-points">
          <li>共有されるのは、読書記録（本・時間・ページ）と知の版図だけ</li>
          <li>メモ・感想・積読は、今までどおりスマホの中だけ</li>
          <li>見られるのは、ログインした人だけ</li>
        </ul>
        <p class="field-hint">ログインすると、<a href="privacy.html" target="_blank" rel="noopener">プライバシーとみんなのルール</a>に同意したことになります。</p>
        ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
        <button class="btn btn-primary btn-block" data-action="sx-login">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 5.9 12 5.9z"/></svg>
          Googleでログイン</button>
      </section>`;
    return;
  }
  const tabs = segHtml('sx-feed', [{ id: 'all', label: 'みんな' }, { id: 'following', label: `フォロー中 ${S.following.size}` }], S.feed);
  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">みんなの読書</h2>
      <button class="link-btn" data-action="sx-profile" data-uid="${S.user.uid}">自分のプロフィール</button>
    </div>
    ${tabs}
    ${!sharing() ? '<p class="empty-small">今は記録をタイムラインに投稿しない設定です（右上の歯車から変えられます）。</p>' : ''}
    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
    ${adminHtml()}
    <div class="feed">
      ${S.loading && !S.posts.length ? '<p class="empty-small">読み込み中…</p>'
        : S.posts.length ? S.posts.map(postHtml).join('')
        : `<p class="empty-small">${S.feed === 'following' ? 'フォローしている人の記録はまだありません。「みんな」から気になる人をフォローしてみよう。' : 'まだ誰も投稿していません。読書を記録すると、ここに流れます。'}</p>`}
    </div>
    <button class="btn btn-ghost btn-block" data-action="sx-refresh">${S.loading ? '読み込み中…' : '更新'}</button>`;
}

function rerender() {
  if (currentView === 'social') render();
}

/* ---------- いいね ---------- */
async function toggleLike(id) {
  const p = S.posts.find((x) => x.id === id);
  if (!p) return;
  const on = !S.liked.has(id);
  // 先に画面を変えて、あとからサーバーに保存する
  if (on) S.liked.add(id); else S.liked.delete(id);
  p.likeCount = Math.max(0, (p.likeCount || 0) + (on ? 1 : -1));
  render();
  try {
    const batch = writeBatch(db);
    const likeRef = doc(db, 'posts', id, 'likes', S.user.uid);
    if (on) batch.set(likeRef, { createdAt: serverTimestamp() }); else batch.delete(likeRef);
    batch.update(doc(db, 'posts', id), { likeCount: increment(on ? 1 : -1) });
    await batch.commit();
  } catch (e) {
    if (on) S.liked.delete(id); else S.liked.add(id);
    p.likeCount = Math.max(0, p.likeCount + (on ? -1 : 1));
    render();
    toast('いいねできませんでした');
  }
}

/* ---------- コメント ---------- */
let openPostId = null;

async function openComments(id) {
  openPostId = id;
  const p = S.posts.find((x) => x.id === id) || (await getDoc(doc(db, 'posts', id)).then((s) => ({ id, ...s.data() })));
  openSheet('コメント', `
    <div class="comments-wrap">
      ${postSummary(p)}
      <div class="comments" id="sx-comments"><p class="empty-small">読み込み中…</p></div>
      <form class="comment-form" id="sx-comment-form" novalidate>
        <textarea class="input" id="sx-comment-text" rows="2" maxlength="300" placeholder="コメントを書く（300文字まで）"></textarea>
        <button class="btn btn-primary" type="submit">送信</button>
      </form>
    </div>`, 'comments');
  await loadComments(p);
}

function postSummary(p) {
  return `<div class="focus-book">${avatarHtml(p.name, p.photo, 32)}<div><strong>${esc(p.name)}</strong><span>『${esc(p.book?.title || '')}』${p.kind === 'finish' ? 'を読了' : `・${fmtMinutes(p.minutes)}・${p.pages}ページ`}</span></div></div>`;
}

async function loadComments(p) {
  const box = $('#sx-comments');
  if (!box) return;
  try {
    const snap = await getDocs(query(collection(db, 'posts', p.id, 'comments'), orderBy('createdAt', 'asc'), limit(100)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !S.blocked.has(c.uid) && !isHidden(c.id));
    box.innerHTML = list.length ? list.map((c) => `
      <div class="comment">
        ${avatarHtml(c.name, c.photo, 32)}
        <div class="comment-body">
          <div class="post-head"><strong class="post-name">${esc(c.name)}</strong><span class="post-time">${timeAgo(tsMs(c.createdAt))}</span></div>
          <p>${esc(c.text)}</p>
          <div class="comment-actions">
            ${c.uid === S.user.uid || p.uid === S.user.uid || S.admin ? `<button class="del-btn" data-action="sx-delete-comment" data-id="${c.id}">削除</button>` : ''}
            ${c.uid !== S.user.uid ? `<button class="del-btn" data-action="sx-report" data-type="comment" data-id="${c.id}" data-uid="${esc(c.uid)}" data-post="${p.id}">通報</button>` : ''}
          </div>
        </div>
      </div>`).join('') : '<p class="empty-small">まだコメントはありません。最初のひとことをどうぞ。</p>';
  } catch (e) {
    box.innerHTML = '<p class="error">コメントを読み込めませんでした。</p>';
  }
}

async function sendComment() {
  const box = $('#sx-comment-text');
  const text = box.value.trim();
  if (!text) return;
  const id = openPostId;
  box.disabled = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'posts', id, 'comments')), {
      uid: S.user.uid, name: S.profile.name, photo: S.profile.photo || '', text: text.slice(0, 300), createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts', id), { commentCount: increment(1) });
    await batch.commit();
    const p = S.posts.find((x) => x.id === id);
    if (p) p.commentCount = (p.commentCount || 0) + 1;
    box.value = '';
    await loadComments(p || { id, uid: '' });
  } catch (e) {
    toast('コメントを送れませんでした');
  }
  box.disabled = false;
}

async function deleteComment(cid) {
  const id = openPostId;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'posts', id, 'comments', cid));
    batch.update(doc(db, 'posts', id), { commentCount: increment(-1) });
    await batch.commit();
    const p = S.posts.find((x) => x.id === id);
    if (p) p.commentCount = Math.max(0, (p.commentCount || 1) - 1);
    await loadComments(p || { id, uid: '' });
    toast('コメントを削除しました');
  } catch (e) { toast('削除できませんでした'); }
}

async function deletePost(id) {
  try {
    await deleteDoc(doc(db, 'posts', id));
    S.posts = S.posts.filter((p) => p.id !== id);
    render();
    toast('投稿を削除しました');
  } catch (e) { toast('削除できませんでした'); }
}

/* ---------- プロフィール ---------- */
async function openProfile(uid) {
  openSheet('プロフィール', '<p class="empty-small">読み込み中…</p>', 'profile');
  try {
    const [snap, followers, followingCount, postsSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getCountFromServer(query(collection(db, 'follows'), where('to', '==', uid))),
      getCountFromServer(query(collection(db, 'follows'), where('from', '==', uid))),
      getDocs(query(collection(db, 'posts'), where('uid', '==', uid), limit(50))),
    ]);
    if (sheetMode !== 'profile') return;
    if (!snap.exists()) { $('#sheet-body').innerHTML = '<p class="empty-small">このユーザーは見つかりませんでした。</p>'; return; }
    const u = snap.data();
    const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 10);
    const me = uid === S.user.uid;
    const isFollowing = S.following.has(uid);
    // 知の版図：保存されている国ごとの領土から地図を描く
    const realms = {};
    for (const f of FIELDS) {
      const r = (u.realm || {})[f] || {};
      realms[f] = { conquered: r.c || 0, castle: !!r.k, front: false, planned: false };
    }
    $('#sheet-body').innerHTML = `
      <div class="profile">
        <div class="profile-top">
          ${avatarHtml(u.name, u.photo, 64)}
          <div>
            <h3 class="detail-title">${esc(u.name)}</h3>
            ${u.title ? `<span class="title-chip">${esc(u.title)}${u.shape ? `・${esc(u.shape)}` : ''}</span>` : ''}
            <span class="now-sub">フォロワー ${followers.data().count}・フォロー中 ${followingCount.data().count}</span>
          </div>
        </div>
        ${me ? '<button class="btn btn-ghost btn-small" data-action="settings">名前や投稿の設定を変える</button>'
          : S.blocked.has(uid) ? `<p class="empty-small">このユーザーをブロックしています。</p><button class="btn btn-ghost btn-block" data-action="sx-unblock" data-uid="${esc(uid)}">ブロックを解除</button>`
          : `<button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'} btn-block" data-action="sx-follow" data-uid="${esc(uid)}">${isFollowing ? 'フォロー中（押すと解除）' : 'フォローする'}</button>`}
        <div class="kpis">
          <div><small>連続読書</small><span class="big">${u.streak || 0}<small>日</small></span></div>
          <div><small>読了</small><span class="big">${u.doneCount || 0}<small>冊</small></span></div>
          <div><small>今週</small><span class="big">${timeHtml(u.weekMinutes || 0)}</span></div>
        </div>
        <section class="realm-hero">
          <div class="realm-head">
            <div><span class="tile-label">${esc(u.name)}さんの知の版図</span>
              <div class="map-big"><span class="big">${u.realmPct || 0}</span><small>%を制覇</small></div></div>
            <div class="realm-nums"><span><span class="big">${u.countries || 0}</span><small>／18か国</small></span></div>
          </div>
          <div class="map-frame">${worldMapSvg({ realms, interactive: false })}</div>
          ${u.empire ? `<p class="map-note"><strong>${esc(u.empire)}</strong>を超える版図を築いています。</p>` : ''}
        </section>
        <div class="section">
          <h4 class="section-title">最近の記録</h4>
          ${S.blocked.has(uid) ? '' : posts.length ? `<div class="list">${posts.map((p) => `<div class="mini-post"><span>『${esc(p.book?.title || '')}』${p.kind === 'finish' ? 'を読了' : `・${fmtMinutes(p.minutes)}・${p.pages}p`}</span><span class="post-time">${timeAgo(tsMs(p.createdAt))}</span></div>`).join('')}</div>` : '<p class="empty-small">まだ記録がありません。</p>'}
        </div>
        ${me ? '' : `<div class="btn-row profile-safety">
          ${S.blocked.has(uid) ? '' : `<button class="btn btn-ghost btn-small" data-action="sx-block" data-uid="${esc(uid)}">ブロックする</button>`}
          <button class="btn btn-ghost btn-small" data-action="sx-report" data-type="user" data-id="${esc(uid)}" data-uid="${esc(uid)}">通報する</button>
        </div>`}
      </div>`;
  } catch (e) {
    if (sheetMode === 'profile') $('#sheet-body').innerHTML = '<p class="error">プロフィールを読み込めませんでした。</p>';
  }
}

async function toggleFollow(uid) {
  const id = `${S.user.uid}_${uid}`;
  try {
    if (S.following.has(uid)) {
      await deleteDoc(doc(db, 'follows', id));
      S.following.delete(uid);
      toast('フォローを解除しました');
    } else {
      await setDoc(doc(db, 'follows', id), { from: S.user.uid, to: uid, createdAt: serverTimestamp() });
      S.following.add(uid);
      toast('フォローしました');
    }
    openProfile(uid);
    rerender();
  } catch (e) { toast('フォローできませんでした'); }
}

/* ---------- 通報・ブロック ---------- */
function openPostMenu(id, uid) {
  const p = S.posts.find((x) => x.id === id);
  openSheet('この投稿について', `
    <div class="form">
      ${p ? postSummary(p) : ''}
      <button class="btn btn-ghost btn-block" data-action="sx-report" data-type="post" data-id="${id}" data-uid="${esc(uid)}">この投稿を通報する</button>
      <button class="btn btn-ghost btn-block" data-action="sx-block" data-uid="${esc(uid)}">${esc(p ? p.name : 'このユーザー')}さんをブロックする</button>
      <p class="field-hint">ブロックすると、相手の投稿とコメントがあなたに表示されなくなり、相手はあなたの投稿にコメント・いいね・フォローができなくなります。ブロックしたことは相手に通知されません。</p>
    </div>`, 'menu');
}

function openReport(type, id, uid, postId) {
  const what = { post: '投稿', comment: 'コメント', user: 'ユーザー' }[type];
  openSheet(`${what}を通報`, `
    <form class="form" id="sx-report-form" data-type="${type}" data-id="${esc(id)}" data-uid="${esc(uid)}" data-post="${esc(postId || '')}" novalidate>
      <div class="field"><span class="field-label">理由</span>
        <div class="reason-list">${REASONS.map((r, i) => `
          <label class="reason"><input type="radio" name="sx-reason" value="${r}" ${i === 0 ? 'checked' : ''}><span>${r}</span></label>`).join('')}</div></div>
      <div class="field"><label for="sx-report-note">くわしく（任意・300文字まで）</label>
        <textarea class="input" id="sx-report-note" rows="3" maxlength="300"></textarea></div>
      <p class="field-hint">通報は管理者だけが見ます。相手に、あなたが通報したことは伝わりません。${type !== 'user' ? 'この' + what + 'は、あなたの画面からすぐに見えなくなります。' : ''}</p>
      <button class="btn btn-primary btn-block" type="submit">通報する</button>
    </form>`, 'report');
}

async function submitReport(form) {
  const { type, id, uid, post } = form.dataset;
  const reason = form.querySelector('input[name="sx-reason"]:checked').value;
  const note = $('#sx-report-note').value.trim().slice(0, 300);
  // 管理者が判断できるよう、通報した時点の内容も一緒に送る
  let snippet = '';
  if (type === 'post') { const p = S.posts.find((x) => x.id === id); snippet = p ? `『${p.book?.title || ''}』${p.kind === 'finish' ? '読了' : `${p.minutes}分`}` : ''; }
  if (type === 'comment') snippet = ($(`[data-action="sx-report"][data-id="${id}"]`)?.closest('.comment-body')?.querySelector('p')?.textContent || '').slice(0, 300);
  try {
    await addDoc(collection(db, 'reports'), {
      reporter: S.user.uid, type, targetId: id, targetUid: uid, postId: post || '', reason, note, snippet, createdAt: serverTimestamp(),
    });
    if (type !== 'user') { hidden().push(id); save(); }
    S.posts = S.posts.filter((p) => !isHidden(p.id));
    closeSheet();
    render();
    toast('通報しました。ご協力ありがとうございます');
  } catch (e) { toast('通報を送れませんでした。電波を確認してください'); }
}

async function blockUser(uid) {
  if (uid === S.user.uid) return;
  try {
    // お互いのフォローも外す（フォローがあるときだけ。ないものを消そうとするとルールで止められる）
    const mine = doc(db, 'follows', `${S.user.uid}_${uid}`);
    const theirs = doc(db, 'follows', `${uid}_${S.user.uid}`);
    const [m, t] = await Promise.all([getDoc(mine), getDoc(theirs)]);
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', S.user.uid, 'blocks', uid), { createdAt: serverTimestamp() });
    if (m.exists()) batch.delete(mine);
    if (t.exists()) batch.delete(theirs);
    await batch.commit();
    S.blocked.add(uid);
    S.following.delete(uid);
    S.posts = S.posts.filter((p) => p.uid !== uid);
    closeSheet();
    render();
    toast('ブロックしました');
  } catch (e) { toast('ブロックできませんでした'); }
}

async function unblockUser(uid) {
  try {
    await deleteDoc(doc(db, 'users', S.user.uid, 'blocks', uid));
    S.blocked.delete(uid);
    toast('ブロックを解除しました');
    if (sheetMode === 'profile') openProfile(uid); else if (sheetMode) openSettings();
    loadFeed();
  } catch (e) { toast('解除できませんでした'); }
}

/* ---------- 管理者：通報の確認 ---------- */
async function loadReports() {
  try {
    const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50)));
    S.reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { S.reports = []; }
}

function adminHtml() {
  if (!S.admin) return '';
  return `
    <details class="card admin-card" ${S.reports.length ? 'open' : ''}>
      <summary><strong>管理者：通報 ${S.reports.length}件</strong></summary>
      ${S.reports.length ? S.reports.map((r) => `
        <div class="report-item">
          <div class="report-head"><span class="badge">${{ post: '投稿', comment: 'コメント', user: 'ユーザー' }[r.type]}</span><strong>${esc(r.reason)}</strong><span class="post-time">${timeAgo(tsMs(r.createdAt))}</span></div>
          ${r.snippet ? `<p class="report-snippet">${esc(r.snippet)}</p>` : ''}
          ${r.note ? `<p class="report-note">メモ：${esc(r.note)}</p>` : ''}
          <div class="btn-row">
            ${r.type === 'post' ? `<button class="btn btn-danger btn-small" data-action="sx-admin-del-post" data-id="${esc(r.targetId)}" data-report="${r.id}">投稿を削除</button>` : ''}
            ${r.type === 'comment' ? `<button class="btn btn-danger btn-small" data-action="sx-admin-del-comment" data-id="${esc(r.targetId)}" data-post="${esc(r.postId)}" data-report="${r.id}">コメントを削除</button>` : ''}
            <button class="btn btn-ghost btn-small" data-action="sx-profile" data-uid="${esc(r.targetUid)}">相手を見る</button>
            <button class="btn btn-ghost btn-small" data-action="sx-admin-dismiss" data-report="${r.id}">対応済みにする</button>
          </div>
        </div>`).join('') : '<p class="empty-small">未対応の通報はありません。</p>'}
    </details>`;
}

async function adminAct(action, el) {
  const { id, post, report } = el.dataset;
  try {
    const batch = writeBatch(db);
    if (action === 'post') batch.delete(doc(db, 'posts', id));
    if (action === 'comment') { batch.delete(doc(db, 'posts', post, 'comments', id)); batch.update(doc(db, 'posts', post), { commentCount: increment(-1) }); }
    batch.delete(doc(db, 'reports', report));
    await batch.commit();
    S.reports = S.reports.filter((r) => r.id !== report);
    toast(action === 'dismiss' ? '対応済みにしました' : '削除しました');
    loadFeed();
  } catch (e) {
    // 投稿がもう消えていた場合などは、通報だけ片付ける
    try { await deleteDoc(doc(db, 'reports', report)); S.reports = S.reports.filter((r) => r.id !== report); render(); } catch (e2) { /* 何もしない */ }
    toast('対象はすでに削除されていました');
  }
}

/* ---------- アカウントと共有データの削除 ---------- */
async function deleteAccount() {
  const uid = S.user.uid;
  toast('削除しています…');
  try {
    // 自分の投稿・フォロー・ブロック・プロフィールを消す
    const [posts, fromMe, toMe, blocks] = await Promise.all([
      getDocs(query(collection(db, 'posts'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'follows'), where('from', '==', uid))),
      getDocs(query(collection(db, 'follows'), where('to', '==', uid))),
      getDocs(collection(db, 'users', uid, 'blocks')),
    ]);
    const refs = [...posts.docs, ...fromMe.docs, ...toMe.docs, ...blocks.docs].map((d) => d.ref);
    refs.push(doc(db, 'users', uid));
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    // ログインの情報も消す（しばらく前にログインした場合は、もう一度ログインの確認が出る）
    try { await deleteUser(auth.currentUser); }
    catch (e) {
      if (e.code === 'auth/requires-recent-login' && !EMU) { await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider()); await deleteUser(auth.currentUser); }
      else if (!EMU) throw e;
      else await signOut(auth);
    }
    data.settings.shareTimeline = true;
    save();
    closeSheet();
    toast('アカウントと共有データを削除しました。スマホの中の記録は残っています');
  } catch (e) {
    toast('削除を最後まで終えられませんでした。もう一度お試しください');
  }
}

/* ---------- 設定画面に出すアカウントの欄 ---------- */
function settingsHtml() {
  if (!S.user) {
    return `<div class="form backup"><h3 class="section-title">みんなの読書（交流機能）</h3>
      <p class="field-hint">ログインすると、読書記録と知の版図をみんなと共有できます。</p>
      <button class="btn btn-ghost btn-block" data-action="sx-login">Googleでログイン</button>
      <a class="link-btn" href="privacy.html" target="_blank" rel="noopener">プライバシーとみんなのルール</a></div>`;
  }
  return `<div class="form backup">
    <h3 class="section-title">みんなの読書（交流機能）</h3>
    <div class="field"><label for="sx-name">表示する名前</label>
      <div class="search-row"><input class="input" id="sx-name" maxlength="30" value="${esc(S.profile?.name || '')}"><button class="btn btn-ghost" data-action="sx-save-name">保存</button></div>
      <span class="field-hint">本名でなくても大丈夫です。</span></div>
    <label class="switch-row"><input type="checkbox" id="sx-share" ${sharing() ? 'checked' : ''}><span>読書を記録したら、タイムラインに投稿する</span></label>
    <div class="field"><span class="field-label">ブロックしたユーザー（${S.blocked.size}人）</span>
      <div id="sx-blocked-list" class="list"><p class="field-hint">${S.blocked.size ? '読み込み中…' : 'いません。'}</p></div></div>
    <a class="link-btn" href="privacy.html" target="_blank" rel="noopener">プライバシーとみんなのルール</a>
    <div class="btn-row">
      <button class="btn btn-ghost btn-small" data-action="sx-logout">ログアウト</button>
      <button class="btn btn-danger btn-small" data-action="sx-delete-account">アカウントと共有データを削除</button>
    </div>
    <p class="field-hint">削除すると、タイムラインの投稿・プロフィール・フォローが消えます。スマホの中の記録やメモは残ります。</p>
    <p class="field-hint uid-line">あなたのユーザーID：<code>${esc(S.user.uid)}</code></p>
  </div>`;
}

// 設定画面のブロック一覧に、名前を入れる
async function fillBlockedList() {
  const box = $('#sx-blocked-list');
  if (!box || !S.user || !S.blocked.size) return;
  const users = await Promise.all([...S.blocked].map((uid) => getDoc(doc(db, 'users', uid)).then((d) => ({ uid, name: d.exists() ? d.data().name : '（退会したユーザー）' })).catch(() => ({ uid, name: '？' }))));
  box.innerHTML = users.map((u) => `<div class="mini-post"><span>${esc(u.name)}</span><button class="del-btn" data-action="sx-unblock" data-uid="${esc(u.uid)}">解除</button></div>`).join('');
}

async function saveName() {
  const name = $('#sx-name').value.trim().slice(0, 30);
  if (!name) { toast('名前を入れてください'); return; }
  try {
    await updateDoc(doc(db, 'users', S.user.uid), { name });
    S.profile.name = name;
    toast('名前を保存しました');
  } catch (e) { toast('保存できませんでした'); }
}

/* ---------- ボタン操作 ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action^="sx-"]');
  if (!el) return;
  const { id, uid } = el.dataset;
  switch (el.dataset.action) {
    case 'sx-login': login(); break;
    case 'sx-logout': signOut(auth).then(() => { closeSheet(); toast('ログアウトしました'); }); break;
    case 'sx-refresh': loadFeed(); break;
    case 'sx-like': toggleLike(id); break;
    case 'sx-comments': openComments(id); break;
    case 'sx-profile': openProfile(uid); break;
    case 'sx-follow': toggleFollow(uid); break;
    case 'sx-save-name': saveName(); break;
    case 'sx-delete-post': armOrRun(el, () => deletePost(id)); break;
    case 'sx-delete-comment': armOrRun(el, () => deleteComment(id)); break;
    case 'sx-menu': openPostMenu(id, uid); break;
    case 'sx-report': openReport(el.dataset.type, id, uid, el.dataset.post); break;
    case 'sx-block': armOrRun(el, () => blockUser(uid)); break;
    case 'sx-unblock': unblockUser(uid); break;
    case 'sx-admin-del-post': armOrRun(el, () => adminAct('post', el)); break;
    case 'sx-admin-del-comment': armOrRun(el, () => adminAct('comment', el)); break;
    case 'sx-admin-dismiss': adminAct('dismiss', el); break;
    case 'sx-delete-account': armOrRun(el, deleteAccount); break;
  }
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'sx-feed') { S.feed = e.target.value; loadFeed(); }
  if (e.target.id === 'sx-share') { data.settings.shareTimeline = e.target.checked; save(); toast(e.target.checked ? 'タイムラインに投稿します' : 'タイムラインに投稿しません'); }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'sx-comment-form') { e.preventDefault(); sendComment(); }
  if (e.target.id === 'sx-report-form') { e.preventDefault(); submitReport(e.target); }
});

// app.js から使えるように公開
window.social = {
  render, afterSession, settingsHtml, afterSettings: fillBlockedList, onShow: () => { render(); if (S.user) loadFeed(); },
  isLoggedIn: () => !!S.user, testLogin,
};
rerender();
