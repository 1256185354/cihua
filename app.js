/* =========================================================
   词话 · 背单词 练口语
   纯前端：localStorage 存储 + Web Speech 发音 + MediaRecorder 录音
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     常量与工具
     --------------------------------------------------------- */
  const LS_KEY = 'cihua.v1';
  const DAY = 86400000;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const dayKey = (t = new Date()) => {
    const d = new Date(t);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const ICON = {
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.8" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2h9.2L17.5 7"/></svg>',
  };

  /* ---------------------------------------------------------
     内置示例词库
     --------------------------------------------------------- */
  const DEMO = [
    { term: 'abundant', phonetic: '/əˈbʌndənt/', meaning: 'adj. 大量的；丰富的', example: 'The region has abundant natural resources.', exampleZh: '这个地区自然资源丰富。' },
    { term: 'acknowledge', phonetic: '/əkˈnɒlɪdʒ/', meaning: 'v. 承认；致谢', example: 'She acknowledged that she had been wrong.', exampleZh: '她承认自己错了。' },
    { term: 'compromise', phonetic: '/ˈkɒmprəmaɪz/', meaning: 'n./v. 妥协；折中', example: 'Both sides had to make a compromise.', exampleZh: '双方都必须做出让步。' },
    { term: 'dilemma', phonetic: '/dɪˈlemə/', meaning: 'n. 困境；进退两难', example: 'He faced the dilemma of work or family.', exampleZh: '他面临工作与家庭的两难。' },
    { term: 'essential', phonetic: '/ɪˈsenʃl/', meaning: 'adj. 必不可少的；本质的', example: 'Water is essential to life.', exampleZh: '水对生命必不可少。' },
    { term: 'fragile', phonetic: '/ˈfrædʒaɪl/', meaning: 'adj. 易碎的；脆弱的', example: 'Handle the glass, it is very fragile.', exampleZh: '小心拿这杯子，它很易碎。' },
    { term: 'genuine', phonetic: '/ˈdʒenjuɪn/', meaning: 'adj. 真正的；真诚的', example: 'He showed a genuine interest in my work.', exampleZh: '他对我的工作表现出真诚的兴趣。' },
    { term: 'hesitate', phonetic: '/ˈhezɪteɪt/', meaning: 'v. 犹豫；踌躇', example: "Don't hesitate to ask if you need help.", exampleZh: '需要帮助就尽管开口。' },
    { term: 'inevitable', phonetic: '/ɪnˈevɪtəbl/', meaning: 'adj. 不可避免的', example: 'Some delay was inevitable.', exampleZh: '有些延误是不可避免的。' },
    { term: 'modest', phonetic: '/ˈmɒdɪst/', meaning: 'adj. 谦虚的；适度的', example: 'She is modest about her achievements.', exampleZh: '她对自己的成就很谦虚。' },
    { term: 'persuade', phonetic: '/pəˈsweɪd/', meaning: 'v. 说服；劝说', example: 'I tried to persuade him to stay.', exampleZh: '我试着劝他留下。' },
    { term: 'reluctant', phonetic: '/rɪˈlʌktənt/', meaning: 'adj. 不情愿的；勉强的', example: 'She was reluctant to speak in public.', exampleZh: '她不愿意当众讲话。' },
    { term: 'threshold', phonetic: '/ˈθreʃhəʊld/', meaning: 'n. 门槛；临界点', example: 'Income above this threshold is taxed.', exampleZh: '超过这一门槛的收入需要缴税。' },
    { term: 'vivid', phonetic: '/ˈvɪvɪd/', meaning: 'adj. 生动的；鲜明的', example: 'I have a vivid memory of that day.', exampleZh: '我对那天的记忆非常鲜明。' },
  ];

  const DEFAULT_SETTINGS = {
    dailyNew: 10,
    autoSpeak: true,
    rate: 0.9,
    voiceURI: '',
    reminderOn: false,
    reminderTime: '20:00',
    lastReminded: '',
    onboarded: false,
    lastBackup: 0,
  };

  /* ---------------------------------------------------------
     状态与存储
     --------------------------------------------------------- */
  let DATA = null;
  let VOICES = [];
  const session = { queue: [], idx: 0, done: 0, word: null, revealed: false, results: [], running: false };
  let editingId = null;
  let activeFilter = 'all';
  let activeTag = '';
  let searchTerm = '';

  const newSrs = () => ({ reps: 0, ef: 2.5, interval: 0, due: 0, lapses: 0, seen: false });

  function makeWord(src) {
    return {
      id: src.id || uid(),
      term: src.term,
      phonetic: src.phonetic || '',
      meaning: src.meaning || '',
      definition: src.definition || '',
      example: src.example || '',
      exampleZh: src.exampleZh || '',
      tags: Array.isArray(src.tags) ? src.tags.filter(Boolean) : [],
      createdAt: src.createdAt || Date.now(),
      updatedAt: Number(src.updatedAt) || Number(src.createdAt) || Date.now(),
      srs: src.srs || newSrs(),
    };
  }

  function seedDemo(force = false) {
    const existing = new Set(DATA.words.map((w) => w.term.toLowerCase()));
    let added = 0;
    DEMO.forEach((d, i) => {
      if (existing.has(d.term.toLowerCase())) return;
      const w = makeWord(d);
      w.createdAt = Date.now() - (DEMO.length - i) * 60000;
      DATA.words.push(w);
      added++;
    });
    if (force && added === 0) toast('常用词已经在词库里了');
    return added;
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) DATA = JSON.parse(raw);
    } catch (err) {
      DATA = null;
    }
    if (!DATA || !Array.isArray(DATA.words)) {
      DATA = { version: 1, words: [], logs: {}, settings: { ...DEFAULT_SETTINGS } };
      DATA.words = [];
      seedDemo();
      save();
    }
    DATA.logs = DATA.logs || {};
    DATA.deleted = Array.isArray(DATA.deleted) ? DATA.deleted : [];
    DATA.settings = Object.assign({}, DEFAULT_SETTINGS, DATA.settings || {});
    DATA.words = DATA.words.map(makeWord);
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(DATA));
    } catch (err) {
      toast('保存失败，可能是浏览器存储已满');
    }
  }

  const getWord = (id) => DATA.words.find((w) => w.id === id);

  function parseTags(str) {
    const list = String(str || '')
      .split(/[,，;；\s]+/)
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean);
    return Array.from(new Set(list)).slice(0, 8);
  }

  function allTags() {
    const map = new Map();
    DATA.words.forEach((w) => (w.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }

  /* ---------------------------------------------------------
     间隔重复（SM-2 简化版）
     --------------------------------------------------------- */
  const GRADES = { 0: '忘记', 1: '模糊', 2: '记住' };

  function nextInterval(srs, grade) {
    const reps = srs.reps || 0;
    const interval = srs.interval || 0;
    const ef = srs.ef || 2.5;
    if (grade === 0) return 0;
    // 新词：模糊 1 天、记住 3 天；第二次：3 天 / 7 天；之后按记忆强度乘系数
    if (reps === 0) return grade === 1 ? 1 : 3;
    if (reps === 1) return grade === 1 ? 3 : 7;
    return Math.min(365, Math.max(1, Math.round(interval * ef * (grade === 1 ? 0.75 : 1))));
  }

  function schedule(word, grade) {
    const q = [2, 4, 5][grade];
    const srs = word.srs || newSrs();
    const ef = Math.max(1.3, (srs.ef || 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    const days = nextInterval(srs, grade);

    if (q < 3) {
      word.srs = { reps: 0, ef, interval: 0, due: Date.now() + 10 * 60000, lapses: (srs.lapses || 0) + 1, seen: true };
    } else {
      word.srs = {
        reps: (srs.reps || 0) + 1,
        ef,
        interval: days,
        due: Date.now() + days * DAY,
        lapses: srs.lapses || 0,
        seen: true,
      };
    }
    return word.srs;
  }

  function previewLabel(word, grade) {
    if (grade === 0) return '10 分钟后';
    const days = nextInterval(word.srs || newSrs(), grade);
    if (days >= 30) return `${Math.round(days / 30)} 个月后`;
    return `${days} 天后`;
  }

  const isDue = (w) => !!(w.srs && w.srs.seen && w.srs.due <= Date.now());
  const isNew = (w) => !(w.srs && w.srs.seen);
  const isMastered = (w) => !!(w.srs && w.srs.seen && w.srs.interval >= 21);

  /* ---------------------------------------------------------
     统计
     --------------------------------------------------------- */
  function todayLog() {
    const k = dayKey();
    DATA.logs[k] = DATA.logs[k] || { count: 0, new: 0, review: 0 };
    return DATA.logs[k];
  }

  function streakCount() {
    let streak = 0;
    const cursor = new Date();
    if (!(DATA.logs[dayKey(cursor)] || {}).count) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      const log = DATA.logs[dayKey(cursor)];
      if (log && log.count > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
      if (streak > 3650) break;
    }
    return streak;
  }

  function weekCount() {
    let n = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const log = DATA.logs[dayKey(d)];
      n += log ? log.count : 0;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------------------------------------------------------
     渲染 · 今日
     --------------------------------------------------------- */
  function renderToday() {
    const now = new Date();
    $('#todayLabel').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEK[now.getDay()]}`;

    const due = DATA.words.filter(isDue).length;
    const fresh = DATA.words.filter(isNew).length;
    const planNew = Math.min(fresh, Math.max(0, DATA.settings.dailyNew));
    const log = DATA.logs[dayKey()] || { count: 0 };

    $('#statNew').textContent = planNew;
    $('#statDue').textContent = due;
    $('#statDone').textContent = log.count || 0;
    $('#streakNum').textContent = streakCount();
    $('#btnDictate').hidden = !DATA.words.length;
    $('#btnSpeak').hidden = !DATA.words.length;
    $('#btnCloze').hidden = !DATA.words.length;

    const total = planNew + due;
    const btn = $('#btnStart');
    const label = $('#startLabel');

    if (!DATA.words.length) {
      label.textContent = '添加第一个单词';
      btn.classList.add('alt');
      $('#taskHint').textContent = '把今天遇到的一个生词放进来，就可以开始了';
    } else if (total === 0) {
      label.textContent = '今日已完成，再来一轮';
      btn.classList.add('alt');
      const streak = streakCount();
      $('#taskHint').textContent = streak > 0
        ? `已连续 ${streak} 天 · 词库共 ${DATA.words.length} 个词`
        : `词库共 ${DATA.words.length} 个词`;
    } else {
      label.textContent = '开始学习';
      btn.classList.remove('alt');
      const mins = Math.max(1, Math.round(total * 0.45));
      $('#taskHint').textContent = `约 ${mins} 分钟 · ${planNew} 个新词 + ${due} 个复习`;
    }

    const done = log.count || 0;
    const target = total > 0 ? total : done > 0 ? done : 1;
    $('#dayProgress').style.width = `${Math.min(100, (done / target) * 100)}%`;
    $('#dayProgress').parentElement.hidden = done === 0;
    const insecure = $('#insecureNote');
    if (insecure) insecure.hidden = window.isSecureContext !== false;
    renderTip();
    renderRecent();
  }

  function renderTip() {
    const title = $('#tipTitle');
    const body = $('#tipBody');
    const action = $('#tipAction');
    if (!title) return;
    if (!DATA.settings.onboarded) {
      title.textContent = '第一次用？三步就够了';
      body.innerHTML =
        '① 点「加个生词」，把今天遇到的词收进来<br />② 每天点「开始学习」过一遍，记不住选「忘记」<br />③ 想练嘴就用听写 / 口语 / 精听';
      action.hidden = false;
      action.textContent = '知道了';
      $('#tipCard').classList.add('onboard');
    } else {
      title.textContent = '跟读小贴士';
      body.textContent = '听一遍原音 → 跟着读 3 遍 → 录下来自己听。开口一次，比默看十次记得牢。';
      action.hidden = true;
      $('#tipCard').classList.remove('onboard');
    }
  }

  function renderRecent() {
    const list = $('#recentList');
    const words = [...DATA.words].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
    if (!words.length) {
      list.innerHTML = `<li class="word-item"><span class="wi-main"><span class="wi-term">还没有单词</span><span class="wi-meaning">点右上角「加个生词」开始</span></span></li>`;
      return;
    }
    list.innerHTML = words.map((w) => itemHtml(w, false)).join('');
  }

  function statusOf(w) {
    if (isDue(w)) return { cls: 'due', text: '该复习了' };
    if (isNew(w)) return { cls: 'new', text: '还没学' };
    if (isMastered(w)) return { cls: 'ok', text: '已掌握' };
    return { cls: 'ok', text: dueText(w) };
  }

  function dueText(w) {
    const diff = w.srs.due - Date.now();
    if (diff <= 0) return '现在复习';
    const days = Math.ceil(diff / DAY);
    if (days <= 1) return '明天复习';
    return `${days} 天后复习`;
  }

  function itemHtml(w, withDelete) {
    const st = statusOf(w);
    const tags = (w.tags || [])
      .map((t) => `<span class="tag" data-act="tag" data-tag="${esc(t)}">${esc(t)}</span>`)
      .join('');
    return `<li class="word-item" data-id="${w.id}">
      <button class="wi-main" data-act="edit">
        <span class="wi-term">${esc(w.term)}${w.phonetic ? `<span class="wi-phon">${esc(w.phonetic)}</span>` : ''}</span>
        <span class="wi-meaning">${esc(w.meaning)}</span>
        <span class="wi-meta"><span class="dot ${st.cls}"></span>${esc(st.text)}${tags}</span>
      </button>
      <button class="wi-btn" data-act="speak" aria-label="朗读 ${esc(w.term)}">${ICON.speaker}</button>
      ${withDelete ? `<button class="wi-btn del" data-act="del" aria-label="删除 ${esc(w.term)}">${ICON.trash}</button>` : ''}
    </li>`;
  }

  /* ---------------------------------------------------------
     渲染 · 词库
     --------------------------------------------------------- */
  function renderTagChips() {
    const box = $('#libTags');
    const tags = allTags();
    if (!tags.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML =
      `<button class="chip ${activeTag ? '' : 'is-active'}" data-tag="">全部标签</button>` +
      tags
        .map(
          ([t, n]) =>
            `<button class="chip ${activeTag === t ? 'is-active' : ''}" data-tag="${esc(t)}">${esc(t)}<i>${n}</i></button>`
        )
        .join('');
  }

  function renderLibrary() {
    renderTagChips();
    const total = DATA.words.length;
    $('#libCount').textContent = total ? `共 ${total} 个词 · 待复习 ${DATA.words.filter(isDue).length} 个` : '还没有单词';

    let words = DATA.words.slice();
    if (activeFilter === 'due') words = words.filter(isDue);
    if (activeFilter === 'new') words = words.filter(isNew);
    if (activeFilter === 'mastered') words = words.filter(isMastered);
    if (activeTag) words = words.filter((w) => (w.tags || []).includes(activeTag));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      words = words.filter(
        (w) =>
          w.term.toLowerCase().includes(q) ||
          (w.meaning || '').toLowerCase().includes(q) ||
          (w.phonetic || '').toLowerCase().includes(q) ||
          (w.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    words.sort((a, b) => {
      const da = isDue(a) ? 0 : isNew(a) ? 1 : 2;
      const db = isDue(b) ? 0 : isNew(b) ? 1 : 2;
      if (da !== db) return da - db;
      return b.createdAt - a.createdAt;
    });

    const list = $('#libList');
    list.innerHTML = words.map((w) => itemHtml(w, true)).join('');
    $('#libEmpty').hidden = words.length > 0;
    if (!words.length && total > 0) {
      $('#libEmpty').querySelector('p:nth-child(2)').innerHTML = '这个筛选下没有单词';
      $('#btnEmptyAdd').textContent = '换个筛选看看';
    } else if (total === 0) {
      $('#libEmpty').querySelector('p:nth-child(2)').innerHTML = '这里还没有词。<br />把今天遇到的生词加进来吧。';
      $('#btnEmptyAdd').textContent = '添加生词';
    }
  }

  /* ---------------------------------------------------------
     渲染 · 我的
     --------------------------------------------------------- */
  function renderMe() {
    $('#mTotal').textContent = DATA.words.length;
    $('#mMastered').textContent = DATA.words.filter(isMastered).length;
    $('#mStreak').textContent = streakCount();
    $('#mWeek').textContent = weekCount();

    $('#setDailyNew').value = DATA.settings.dailyNew;
    $('#setAutoSpeak').checked = !!DATA.settings.autoSpeak;
    $('#setRate').value = DATA.settings.rate;
    $('#setReminder').checked = !!DATA.settings.reminderOn;
    $('#setReminderTime').value = DATA.settings.reminderTime || '20:00';
    renderNotify();
    renderHeatmap();
    renderDueChart();
    renderBackupNote();
    renderInstall();
    renderSyncForm();
  }

  function renderDueChart() {
    const box = $('#dueChart');
    if (!box) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ date: d, count: 0 });
    }
    DATA.words.forEach((w) => {
      if (!w.srs || !w.srs.seen) return;
      const due = new Date(w.srs.due);
      due.setHours(0, 0, 0, 0);
      const idx = Math.round((due - start) / 86400000);
      if (idx <= 0) days[0].count += 1;
      else if (idx < 7) days[idx].count += 1;
    });
    const max = Math.max(1, ...days.map((d) => d.count));
    const short = ['今', '明', '后'];
    box.innerHTML = days
      .map((d, i) => {
        const label = i < 3 ? short[i] : WEEK[d.date.getDay()].slice(1);
        const h = d.count ? Math.max(10, (d.count / max) * 100) : 2;
        return `<div class="due-col" title="${dayKey(d.date)} · ${d.count} 个">
          <div class="due-track"><i style="height:${h}%"></i></div>
          <em>${label}</em>
        </div>`;
      })
      .join('');
    const sum = days.reduce((s, d) => s + d.count, 0);
    const note = $('#dueNote');
    if (note) note.textContent = sum ? `未来 7 天要复习 ${sum} 个词` : '未来 7 天没有到期的词，可以学新词';
  }

  function renderBackupNote() {
    const el = $('#backupNote');
    if (!el) return;
    const last = Number(DATA.settings.lastBackup) || 0;
    if (!last) {
      el.textContent = '还没备份过 —— 建议先导出一份';
      el.classList.add('warn');
      return;
    }
    const days = Math.floor((Date.now() - last) / 86400000);
    el.textContent = days <= 0 ? '上次备份：今天' : `上次备份：${days} 天前`;
    el.classList.toggle('warn', days >= 14);
  }

  let installPrompt = null;
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function renderInstall() {
    const card = $('#installCard');
    if (!card) return;
    if (isStandalone()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const sub = $('#installSub');
    const btn = $('#btnInstall');
    if (installPrompt) {
      sub.textContent = '全屏打开，离线也能用';
      btn.textContent = '安装';
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      sub.textContent = 'Safari：点底部「分享」→ 添加到主屏幕';
      btn.textContent = '知道了';
    } else {
      sub.textContent = '浏览器菜单 → 安装应用 / 添加到主屏';
      btn.textContent = '知道了';
    }
  }

  function renderHeatmap() {
    const box = $('#heatmap');
    if (!box) return;
    const days = 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));

    let cells = '';
    let total = 0;
    for (let i = 0; i < days; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const key = dayKey(cur);
      const n = Number((DATA.logs[key] || {}).count) || 0;
      total += n;
      const level = n === 0 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : n <= 14 ? 3 : 4;
      cells += `<span class="hm-cell l${level}" title="${key} · ${n} 次"></span>`;
    }
    box.innerHTML = cells;
    const note = $('#heatmapNote');
    if (note) note.textContent = `最近 30 天共练习 ${total} 次 · 当前连续 ${streakCount()} 天`;
  }

  function renderAll() {
    renderToday();
    renderLibrary();
    renderMe();
  }

  /* ---------------------------------------------------------
     发音（TTS）
     --------------------------------------------------------- */
  function shortVoiceName(v) {
    let n = (v.name || 'Voice')
      .replace(/^Microsoft\s+/i, '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\s*Online.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (n.length > 22) n = n.slice(0, 21) + '…';
    return n;
  }

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    VOICES = (speechSynthesis.getVoices() || []).filter((v) => /^en/i.test(v.lang || ''));
    if (!VOICES.length) VOICES = speechSynthesis.getVoices() || [];
    const sel = $('#setVoice');
    if (!sel) return;
    if (!VOICES.length) {
      sel.innerHTML = '<option value="">系统默认</option>';
      return;
    }
    sel.innerHTML = VOICES.map((v) => `<option value="${esc(v.voiceURI)}">${esc(shortVoiceName(v))} · ${esc(v.lang || '')}</option>`).join('');
    const wanted = DATA.settings.voiceURI;
    if (wanted && VOICES.some((v) => v.voiceURI === wanted)) sel.value = wanted;
    else {
      const pick = VOICES.find((v) => /^(Samantha|Google US English|Microsoft Aria|Microsoft Jenny|Zira|Daniel)/i.test(v.name)) || VOICES.find((v) => /en-US/i.test(v.lang)) || VOICES[0];
      sel.value = pick.voiceURI;
      DATA.settings.voiceURI = pick.voiceURI;
    }
  }

  function pickVoice() {
    const uri = DATA.settings.voiceURI;
    if (uri) {
      const exact = VOICES.find((v) => v.voiceURI === uri);
      if (exact) return exact;
    }
    return VOICES.find((v) => /en-US/i.test(v.lang)) || VOICES[0] || null;
  }

  function speak(text, opts = {}) {
    if (!('speechSynthesis' in window) || !text) {
      toast('这个浏览器不支持语音朗读');
      if (opts.onend) opts.onend();
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = opts.rate || Number(DATA.settings.rate) || 0.9;
    u.pitch = 1;
    const v = pickVoice();
    if (v) u.voice = v;
    if (opts.onend) u.onend = opts.onend;
    speechSynthesis.speak(u);
  }

  /* ---------------------------------------------------------
     录音
     --------------------------------------------------------- */
  const rec = { mr: null, stream: null, chunks: [], url: null, blob: null, timer: null, auto: null, startedAt: 0 };

  function setRecStatus(text, isRec) {
    const el = $('#recStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('rec', !!isRec);
  }

  async function startRecord() {
    if (window.isSecureContext === false) {
      toast('麦克风需要 https 地址，当前是 http');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('这个浏览器不支持录音，建议用 Chrome / Safari');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      toast('这个浏览器不支持录音');
      return;
    }
    speechSynthesis.cancel();
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      toast(err && err.name === 'NotAllowedError' ? '需要麦克风权限才能跟读' : '打不开麦克风，检查一下设备');
      return;
    }

    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));

    const chunks = [];
    const mr = new MediaRecorder(rec.stream, mime ? { mimeType: mime } : undefined);
    rec.chunks = chunks;
    rec.mr = mr;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    mr.onstop = () => {
      // 卡已经换掉或实例被替换时，直接丢弃这次录音
      if (rec.mr !== mr) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      if (rec.url) URL.revokeObjectURL(rec.url);
      rec.blob = blob;
      rec.url = URL.createObjectURL(blob);
      rec.mr = null;
      const btn = $('#btnPlayMine');
      if (btn) btn.disabled = false;
      setRecStatus('录好了，点「我的」听听', false);
      stopStream();
      clearInterval(rec.timer);
      rec.timer = null;
      clearTimeout(rec.auto);
      const rb = $('#btnRecord');
      if (rb) {
        rb.classList.remove('is-rec');
        rb.innerHTML = ICON.mic;
      }
    };

    mr.start();
    rec.startedAt = Date.now();
    const rb = $('#btnRecord');
    if (rb) {
      rb.classList.add('is-rec');
      rb.innerHTML = '<span class="rec-stop"></span>';
    }
    const tick = () => {
      const s = Math.floor((Date.now() - rec.startedAt) / 1000);
      setRecStatus(`正在录 ${s}s · 再点一下结束`, true);
    };
    tick();
    rec.timer = setInterval(tick, 250);
    rec.auto = setTimeout(() => {
      if (rec.mr && rec.mr.state === 'recording') rec.mr.stop();
    }, 10000);
  }

  function stopStream() {
    if (rec.stream) {
      rec.stream.getTracks().forEach((t) => t.stop());
      rec.stream = null;
    }
  }

  function resetRecording() {
    clearInterval(rec.timer);
    rec.timer = null;
    clearTimeout(rec.auto);
    rec.auto = null;
    if (rec.mr) {
      // 无论录着还是已经停了，都先摘掉回调，避免迟到的 onstop 写坏状态
      rec.mr.onstop = null;
      rec.mr.ondataavailable = null;
      if (rec.mr.state === 'recording') {
        try {
          rec.mr.stop();
        } catch (err) {
          /* 忽略 */
        }
      }
    }
    stopStream();
    if (rec.url) {
      URL.revokeObjectURL(rec.url);
      rec.url = null;
    }
    rec.blob = null;
    rec.chunks = [];
    rec.mr = null;
    const btn = $('#btnPlayMine');
    if (btn) btn.disabled = true;
  }

  function toggleRecord() {
    if (rec.mr && rec.mr.state === 'recording') {
      rec.mr.stop();
    } else {
      startRecord();
    }
  }

  function playMine() {
    if (!rec.url) {
      toast('先录一段');
      return;
    }
    speechSynthesis.cancel();
    const audio = new Audio(rec.url);
    audio.play().catch(() => toast('播放失败，再录一次试试'));
  }

  /* ---------------------------------------------------------
     语音评测（浏览器语音识别 + 编辑距离相似度）
     --------------------------------------------------------- */
  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function similarity(said, target) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
    const a = norm(said);
    const b = norm(target);
    if (!a || !b) return 0;
    const dist = levenshtein(a, b);
    return Math.max(0, 1 - dist / Math.max(a.length, b.length, 1));
  }

  /* 整句按词匹配（能指出漏了哪些词），单词按字符编辑距离 */
  function matchScore(said, target) {
    const words = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z' ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    const t = words(target);
    const s = words(said);
    if (t.length <= 1 || s.length <= 1) {
      return { score: similarity(said, target), missing: [] };
    }
    const pool = s.slice();
    let hit = 0;
    const missing = [];
    t.forEach((word) => {
      const i = pool.indexOf(word);
      if (i >= 0) {
        hit += 1;
        pool.splice(i, 1);
      } else missing.push(word);
    });
    return { score: t.length ? hit / t.length : 0, missing };
  }

  function assessTarget() {
    const w = session.word;
    if (!w) return '';
    return session.mode === 'speak' ? shadowText(w) : w.term;
  }

  function setAssess(html, tone) {
    const box = $('#assessBox');
    if (!box) return;
    box.hidden = false;
    box.className = 'assess' + (tone ? ' ' + tone : '');
    box.innerHTML = html;
  }

  function startAssess() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setAssess('这个浏览器没有语音评测能力，可以用 Chrome / Edge 再试；录音对比仍然可用。', 'bad');
      return;
    }
    if (rec.mr && rec.mr.state === 'recording') rec.mr.stop();
    speechSynthesis.cancel();

    const target = assessTarget();
    const isSentence = target.trim().split(/\s+/).length > 2;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 4;
    r.continuous = false;

    let settled = false;
    setAssess(isSentence ? '正在听…请把整句读一遍' : '正在听…请读一遍这个词', '');

    r.onresult = (e) => {
      const alts = Array.from(e.results[0]).map((x) => (x.transcript || '').trim());
      let best = { score: 0, text: alts[0] || '', missing: [] };
      alts.forEach((t) => {
        const m = matchScore(t, target);
        if (m.score > best.score) best = { score: m.score, text: t, missing: m.missing };
      });
      const pct = Math.round(best.score * 100);
      const tone = pct >= 85 ? 'good' : pct >= 60 ? 'mid' : 'bad';
      let advice;
      if (isSentence) {
        advice =
          pct >= 85
            ? '整句很顺，接着练下一句。'
            : best.missing.length
            ? `漏掉或没听清：${best.missing.slice(0, 5).join('、')}`
            : '再听一遍原句，尽量跟上语速。';
      } else {
        advice =
          pct >= 85
            ? '发音很清楚，保持这个状态。'
            : pct >= 60
            ? '已经很接近了，再听一次原音，注意重音位置。'
            : '差得有点多，放慢速度、一个音节一个音节地跟读。';
      }
      setAssess(`听到 <b>${esc(best.text || '（无）')}</b> · 匹配 <b>${pct}%</b><br />${advice}`, tone);
      settled = true;
    };

    r.onerror = (e) => {
      settled = true;
      const map = {
        'not-allowed': '需要麦克风权限才能评测。',
        'no-speech': '没有听到声音，靠近麦克风再试一次。',
        network: '语音识别需要联网，检查一下网络。',
        aborted: '',
      };
      const msg = map[e.error];
      if (msg === '') return;
      setAssess(msg || '评测失败了，再试一次。', 'bad');
    };

    r.onend = () => {
      if (!settled) setAssess('没有听清，再试一次吧。', 'bad');
    };

    try {
      r.start();
    } catch (err) {
      setAssess('评测启动失败，再试一次。', 'bad');
    }
  }

  /* ---------------------------------------------------------
     学习流程
     --------------------------------------------------------- */
  function buildQueue(mode = 'read') {
    const pool = mode === 'cloze' ? DATA.words.filter((w) => (w.example || '').trim()) : DATA.words;
    const due = pool.filter(isDue).sort((a, b) => a.srs.due - b.srs.due);
    const fresh = pool.filter(isNew).slice(0, Math.max(0, DATA.settings.dailyNew));
    let queue = [...due, ...fresh].map((w) => w.id);
    if (!queue.length) {
      queue = pool
        .filter((w) => w.srs.seen)
        .sort(() => Math.random() - 0.5)
        .slice(0, 10)
        .map((w) => w.id);
    }
    return queue;
  }

  function startStudy(mode = 'read') {
    if (!DATA.words.length) {
      openAdd();
      return;
    }
    if (mode === 'cloze' && !DATA.words.some((w) => (w.example || '').trim())) {
      toast('还没有带例句的词，先补几句例句');
      return;
    }
    const queue = buildQueue(mode);
    if (!queue.length) {
      toast('还没有可学的词');
      return;
    }
    Object.assign(session, {
      queue,
      idx: 0,
      done: 0,
      word: null,
      revealed: false,
      results: [],
      running: true,
      mode,
      lastIdx: -1,
      dict: null,
      cloze: null,
      shadowTarget: 'word',
      dictStats: { right: 0, wrong: 0 },
    });
    $('#study').hidden = false;
    document.body.classList.add('lock');
    renderStudy();
  }

  function closeStudy() {
    if (rec.mr && rec.mr.state === 'recording') rec.mr.stop();
    resetRecording();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    session.running = false;
    $('#study').hidden = true;
    $('#gradeBar').hidden = true;
    $('#speakBar').hidden = true;
    document.body.classList.remove('lock');
    renderAll();
  }

  function renderStudy() {
    if (session.idx >= session.queue.length) {
      renderDone();
      return;
    }
    const w = getWord(session.queue[session.idx]);
    if (!w) {
      session.idx++;
      renderStudy();
      return;
    }

    // 换了一张卡：重置本卡状态
    if (session.lastIdx !== session.idx) {
      session.lastIdx = session.idx;
      session.revealed = false;
      session.dict = null;
      session.cloze = null;
      session.shadowTarget = w.example ? 'sentence' : 'word';
      resetRecording();
    }
    session.word = w;

    if (session.mode === 'dictate' && !session.dict) renderDictate(w);
    else if (session.mode === 'cloze' && !session.dict) renderCloze(w);
    else if (session.mode === 'speak') renderSpeak(w);
    else renderCard(w, session.revealed);
  }

  /* ---------- 精听：听句子，填缺的那个词 ---------- */
  function clozePick(w) {
    const ex = String(w.example || '').trim();
    if (!ex) return null;
    const tokens = ex.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    if (!tokens.length) return null;

    const term = w.term.toLowerCase();
    let target = tokens.find((t) => {
      const lt = t.toLowerCase();
      return lt === term || lt.startsWith(term) || term.startsWith(lt);
    });
    // 例句里没有这个词，就挖最长的那个词
    if (!target) target = tokens.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (!target || target.length < 2) return null;

    const at = ex.indexOf(target);
    if (at < 0) return null;
    return {
      target,
      before: ex.slice(0, at),
      after: ex.slice(at + target.length),
      width: Math.max(4, target.length),
    };
  }

  function renderCloze(w) {
    const pick = clozePick(w);
    if (!pick) {
      session.idx += 1;
      renderStudy();
      return;
    }
    session.cloze = pick;

    $('#studyBody').innerHTML = `
      <div class="wordcard cloze-card">
        <div class="wc-top">
          <p class="wc-tag">精听</p>
          <button class="speak-btn" id="btnSpeakWord" aria-label="再听一遍">${ICON.speaker}</button>
        </div>
        <p class="cloze-sentence">
          ${esc(pick.before)}<span class="cloze-blank" style="min-width:${pick.width}ch"></span>${esc(pick.after)}
        </p>
        <p class="cloze-hint">提示：${esc(w.meaning) || '（没有释义）'}</p>
        <input class="dict-input" id="clozeInput" type="text" placeholder="填出缺的那个词"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <button class="primary-btn" id="btnClozeSubmit">提交</button>
        <p class="dict-hint">听不清就点右上角重播</p>
      </div>
    `;
    $('#gradeBar').hidden = true;
    $('#speakBar').hidden = true;
    updateProgress();

    const input = $('#clozeInput');
    const submit = () => {
      const typed = input.value.trim();
      if (!typed) {
        toast('先写一下再提交');
        input.focus();
        return;
      }
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z'’]/g, '');
      const a = norm(pick.target);
      const t = norm(typed);
      const ok = a === t || (t.length >= 4 && (a.startsWith(t) || t.startsWith(a)));
      session.dict = { typed, ok, answer: pick.target };
      session.revealed = true;
      renderCard(w, true);
    };

    $('#btnSpeakWord').addEventListener('click', () => speak(w.example));
    $('#btnClozeSubmit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    setTimeout(() => input.focus(), 160);
    setTimeout(() => speak(w.example), 260);
  }

  /* ---------- 只练口语 ---------- */
  function shadowText(w) {
    return session.shadowTarget === 'sentence' && w.example ? w.example : w.term;
  }

  function renderSpeak(w) {
    const hasSentence = !!w.example;
    const target = session.shadowTarget;

    $('#studyBody').innerHTML = `
      <div class="wordcard speak-card">
        <div class="wc-top">
          <p class="wc-tag free">口语</p>
          <button class="speak-btn" id="btnSpeakWord" aria-label="朗读单词">${ICON.speaker}</button>
        </div>
        <h2 class="wc-term">${esc(w.term)}</h2>
        ${w.phonetic ? `<p class="wc-phon">${esc(w.phonetic)}</p>` : ''}
        <p class="wc-meaning">${esc(w.meaning) || '<span class="muted">（没有释义）</span>'}</p>
        ${w.definition ? `<p class="wc-def">${esc(w.definition)}</p>` : ''}
        ${
          hasSentence
            ? `<div class="wc-ex">
                 <p class="ex-en">${esc(w.example)}</p>
                 ${w.exampleZh ? `<p class="ex-zh">${esc(w.exampleZh)}</p>` : ''}
               </div>`
            : ''
        }
      </div>

      <div class="shadow-box">
        <div class="seg small" id="shadowSeg">
          <button data-target="word" class="${target === 'word' ? 'is-active' : ''}">念单词</button>
          <button data-target="sentence" class="${target === 'sentence' ? 'is-active' : ''}" ${hasSentence ? '' : 'disabled'}>念整句</button>
        </div>
        <div class="shadow-head">
          <p class="shadow-title">跟读</p>
          <span class="shadow-status" id="recStatus">点麦克风开录</span>
        </div>
        <div class="rec-wrap">
          <button class="rec-btn" id="btnRecord" aria-label="开始录音">${ICON.mic}</button>
        </div>
        <div class="pill-row">
          <button class="pill" id="btnPlayMine" disabled>${ICON.play}我的</button>
          <button class="pill" id="btnPlayOrig">${ICON.play}原音</button>
          <button class="pill accent" id="btnAssess">🎧 评测</button>
        </div>
        <button class="wide-ghost" id="btnShadow">🎬 影子跟读：原音响起就跟着说</button>
        <div class="assess" id="assessBox" hidden></div>
      </div>
    `;

    $('#gradeBar').hidden = true;
    $('#speakBar').hidden = false;
    updateProgress();

    $('#btnSpeakWord').addEventListener('click', () => speak(w.term));
    $('#btnPlayOrig').addEventListener('click', () => speak(shadowText(w)));
    $('#btnPlayMine').addEventListener('click', playMine);
    $('#btnRecord').addEventListener('click', toggleRecord);
    $('#btnAssess').addEventListener('click', startAssess);
    $('#btnShadow').addEventListener('click', () => startShadow(w));
    $('#shadowSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-target]');
      if (!b || b.disabled) return;
      if (b.dataset.target === session.shadowTarget) return;
      session.shadowTarget = b.dataset.target;
      resetRecording();
      renderSpeak(w);
    });

    const pm = $('#btnPlayMine');
    if (pm) pm.disabled = !rec.url;

    if (DATA.settings.autoSpeak) setTimeout(() => speak(w.term), 120);
  }

  /* 影子跟读：原音响起就开始录，跟着说（不是听完再说） */
  function startShadow(w) {
    if (rec.mr && rec.mr.state === 'recording') {
      toast('先点一下结束这次录音');
      return;
    }
    speak(shadowText(w));
    setTimeout(() => {
      if (!rec.mr || rec.mr.state !== 'recording') startRecord();
    }, 600);
  }

  /* ---------- 听写模式 ---------- */
  function renderDictate(w) {
    $('#studyBody').innerHTML = `
      <div class="wordcard dictate">
        <div class="wc-top">
          <p class="wc-tag">听写</p>
          <button class="speak-btn" id="btnSpeakWord" aria-label="再听一遍">${ICON.speaker}</button>
        </div>
        <p class="dict-prompt">听发音，写出这个单词</p>
        <input class="dict-input" id="dictInput" type="text" placeholder="在这里输入…"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <button class="primary-btn" id="btnDictSubmit">提交</button>
        <p class="dict-hint">不确定就再听一遍，别急着看答案</p>
      </div>
    `;
    $('#gradeBar').hidden = true;
    $('#speakBar').hidden = true;
    updateProgress();

    const input = $('#dictInput');
    const submit = () => {
      const typed = input.value.trim();
      if (!typed) {
        toast('先写一下再提交');
        input.focus();
        return;
      }
      checkDictation(w, typed);
    };
    $('#btnSpeakWord').addEventListener('click', () => speak(w.term));
    $('#btnDictSubmit').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    setTimeout(() => input.focus(), 160);
    setTimeout(() => speak(w.term), 260);
  }

  function checkDictation(w, typed) {
    const norm = (s) =>
      String(s)
        .toLowerCase()
        .replace(/[^a-z' -]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const ok = norm(typed) === norm(w.term);
    session.dict = { typed, ok };
    session.revealed = true;
    if (ok) session.dictStats.right += 1;
    else session.dictStats.wrong += 1;
    renderCard(w, true);
  }

  /* ---------- 认词卡 ---------- */
  function renderCard(w, revealed) {
    const tag = isNew(w) ? ['新词', ''] : isDue(w) ? ['待复习', 'review'] : ['巩固', 'free'];
    const dict = session.dict;
    const answer = dict && dict.answer ? dict.answer : w.term;
    const dictBanner = dict
      ? `<div class="dict-result ${dict.ok ? 'ok' : 'bad'}">${
          dict.ok
            ? dict.answer
              ? '✓ 听对了'
              : '✓ 拼写正确'
            : `✗ 应该是「${esc(answer)}」，你写的是「${esc(dict.typed)}」`
        }</div>`
      : '';

    $('#studyBody').innerHTML = `
      <div class="wordcard">
        <div class="wc-top">
          <p class="wc-tag ${tag[1]}">${tag[0]}</p>
          <button class="speak-btn" id="btnSpeakWord" aria-label="朗读单词">${ICON.speaker}</button>
        </div>
        <h2 class="wc-term">${esc(w.term)}</h2>
        ${w.phonetic ? `<p class="wc-phon">${esc(w.phonetic)}</p>` : ''}
        <div class="reveal" id="wcReveal" ${revealed ? '' : 'hidden'}>
          ${dictBanner}
          <p class="wc-meaning">${esc(w.meaning) || '<span class="muted">（没有释义）</span>'}</p>
          ${w.definition ? `<p class="wc-def">${esc(w.definition)}</p>` : ''}
          ${
            w.example
              ? `<div class="wc-ex">
                   <p class="ex-en">${esc(w.example)}</p>
                   ${w.exampleZh ? `<p class="ex-zh">${esc(w.exampleZh)}</p>` : ''}
                   <div class="ex-actions"><button class="mini-btn" id="btnSpeakEx">▶ 朗读例句</button></div>
                 </div>`
              : ''
          }
        </div>
        <button class="reveal-btn" id="btnReveal" ${revealed ? 'hidden' : ''}>想不起来？显示释义</button>
      </div>

      <div class="shadow-box">
        <div class="shadow-head">
          <p class="shadow-title">跟读</p>
          <span class="shadow-status" id="recStatus">点麦克风开录</span>
        </div>
        <div class="rec-wrap">
          <button class="rec-btn" id="btnRecord" aria-label="开始录音">${ICON.mic}</button>
        </div>
        <div class="pill-row">
          <button class="pill" id="btnPlayMine" disabled>${ICON.play}我的</button>
          <button class="pill" id="btnPlayOrig">${ICON.play}原音</button>
          <button class="pill accent" id="btnAssess">🎧 评测</button>
        </div>
        <div class="assess" id="assessBox" hidden></div>
        <p class="shadow-note" id="shadowNote">先听原音，再录下自己的声音对比</p>
      </div>
    `;

    $('#btnSpeakWord').addEventListener('click', () => speak(w.term));
    $('#btnReveal').addEventListener('click', revealCard);
    $('#btnRecord').addEventListener('click', toggleRecord);
    $('#btnPlayMine').addEventListener('click', playMine);
    $('#btnPlayOrig').addEventListener('click', () => speak(w.term));
    $('#btnAssess').addEventListener('click', startAssess);
    const ex = $('#btnSpeakEx');
    if (ex) ex.addEventListener('click', () => speak(w.example));
    const pm = $('#btnPlayMine');
    if (pm) pm.disabled = !rec.url;

    updateProgress();

    if (revealed) {
      const bar = $('#gradeBar');
      bar.hidden = false;
      $('#speakBar').hidden = true;
      $$('[data-preview]').forEach((el) => {
        el.textContent = previewLabel(w, Number(el.dataset.preview));
      });
    } else {
      $('#gradeBar').hidden = true;
      $('#speakBar').hidden = true;
      if (DATA.settings.autoSpeak) setTimeout(() => speak(w.term), 120);
    }
  }

  function revealCard() {
    const box = $('#wcReveal');
    const btn = $('#btnReveal');
    if (box) box.hidden = false;
    if (btn) btn.hidden = true;
    session.revealed = true;

    const bar = $('#gradeBar');
    bar.hidden = false;
    const w = session.word;
    if (w) {
      $$('[data-preview]').forEach((el) => {
        el.textContent = previewLabel(w, Number(el.dataset.preview));
      });
    }
  }

  function updateProgress() {
    const total = Math.max(1, session.queue.length);
    const pct = Math.min(100, (session.idx / total) * 100);
    $('#progressFill').style.width = pct + '%';
    $('#progressNum').textContent = `${Math.min(session.idx + 1, total)}/${total}`;
  }

  function grade(g) {
    const w = session.word;
    if (!w) return;
    const wasSeen = !isNew(w);

    schedule(w, g);
    w.updatedAt = Date.now();
    const log = (DATA.logs[dayKey()] = DATA.logs[dayKey()] || { count: 0, new: 0, review: 0 });
    log.count += 1;
    if (wasSeen) log.review += 1;
    else log.new += 1;

    session.results.push({ id: w.id, grade: g, isNew: !wasSeen });
    save();

    if (g === 0) session.queue.push(w.id);

    session.idx += 1;
    session.done += 1;
    $('#gradeBar').hidden = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    renderStudy();
  }

  function renderDone() {
    const newCount = session.results.filter((r) => r.isNew).length;
    const reviewCount = session.results.filter((r) => !r.isNew).length;
    const isDictate = session.mode === 'dictate';
    const isSpeak = session.mode === 'speak';
    const dictLine = isDictate
      ? `<p class="done-dict">听写对 <b>${session.dictStats.right}</b> 个 · 错 <b>${session.dictStats.wrong}</b> 个</p>`
      : '';
    const statsHtml = isSpeak
      ? `<div class="done-stats"><div><b>${session.queue.length}</b><span>练过的词</span></div></div>`
      : `<div class="done-stats">
           <div><b>${newCount}</b><span>新词</span></div>
           <div><b>${reviewCount}</b><span>复习</span></div>
           <div><b>${session.results.length}</b><span>次判定</span></div>
         </div>`;
    $('#gradeBar').hidden = true;
    $('#speakBar').hidden = true;
    $('#progressFill').style.width = '100%';
    $('#progressNum').textContent = `${session.queue.length}/${session.queue.length}`;
    $('#studyBody').innerHTML = `
      <div class="done">
        <svg class="done-mark" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22.5" fill="#e4ede7" stroke="#cfe0d6" />
          <path d="M14 25l7 7 13-14" fill="none" stroke="#2f6b57" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <h2>这一轮完成了</h2>
        <p>${
          isDictate
            ? '能听出来、写对，才是真的记住了。'
            : isSpeak
            ? '嘴动过一次，下次开口就顺一点。'
            : '开口读过的词，下次听到时会更快想起来。'
        }</p>
        ${statsHtml}
        ${dictLine}
        <button class="primary-btn" id="btnAgain">再来一轮</button>
        <button class="ghost-btn" id="btnBackHome">回到今日</button>
      </div>
    `;
    $('#btnAgain').addEventListener('click', () => {
      const queue = buildQueue();
      if (!queue.length) {
        toast('今天没有更多要复习的词了');
        return;
      }
      Object.assign(session, {
        queue, idx: 0, done: 0, results: [], lastIdx: -1, dict: null, revealed: false,
        dictStats: { right: 0, wrong: 0 },
      });
      renderStudy();
    });
    $('#btnBackHome').addEventListener('click', closeStudy);
  }

  /* ---------------------------------------------------------
     添加 / 编辑生词
     --------------------------------------------------------- */
  function openAdd(word) {
    editingId = word ? word.id : null;
    $('#addTitle').textContent = word ? '编辑生词' : '添加生词';
    $('#addSeg').hidden = !!word;
    if (word) {
      $$('#addSeg button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'one'));
      $('#formOne').hidden = false;
      $('#formMany').hidden = true;
    }

    $('#formOne').reset();
    $('#lookupStatus').hidden = true;
    $('#lookupStatus').className = 'lookup-status';
    if (word) {
      $('#fTerm').value = word.term;
      $('#fPhon').value = word.phonetic || '';
      $('#fMeaning').value = word.meaning || '';
      $('#fDefinition').value = word.definition || '';
      $('#fExample').value = word.example || '';
      $('#fExampleZh').value = word.exampleZh || '';
      $('#fTags').value = (word.tags || []).join(' ');
    }
    $('#addModal').hidden = false;
    document.body.classList.add('lock');
    if (!word) setTimeout(() => $('#fTerm').focus(), 180);
  }

  function closeAdd() {
    $('#addModal').hidden = true;
    editingId = null;
    document.body.classList.remove('lock');
  }

  function submitOne(e) {
    e.preventDefault();
    const term = $('#fTerm').value.trim();
    const pos = $('#fPos').value.trim();
    let meaning = $('#fMeaning').value.trim();
    if (!term) {
      toast('先填单词');
      return;
    }
    if (!meaning) {
      toast('再补一个中文释义');
      return;
    }
    if (pos && !meaning.startsWith(pos)) meaning = `${pos} ${meaning}`;

    const payload = {
      term,
      phonetic: $('#fPhon').value.trim(),
      meaning,
      definition: $('#fDefinition').value.trim(),
      example: $('#fExample').value.trim(),
      exampleZh: $('#fExampleZh').value.trim(),
      tags: parseTags($('#fTags').value),
    };

    if (editingId) {
      const w = getWord(editingId);
      if (w) {
        Object.assign(w, payload);
        w.updatedAt = Date.now();
        save();
        toast('已更新');
      }
      closeAdd();
      renderAll();
      return;
    }

    if (DATA.words.some((w) => w.term.toLowerCase() === term.toLowerCase())) {
      toast('词库里已经有这个词了');
      return;
    }

    DATA.words.push(makeWord(payload));
    save();
    renderAll();
    toast(`已加入「${term}」`);

    ['#fTerm', '#fPhon', '#fPos', '#fMeaning', '#fDefinition', '#fExample', '#fExampleZh', '#fTags'].forEach(
      (s) => ($(s).value = '')
    );
    $('#lookupStatus').hidden = true;
    $('#fTerm').focus();
  }

  function parseLines(text) {
    const out = [];
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      let parts = line.split(/\s*[|\t]\s*/).filter((p) => p !== '');
      if (parts.length === 1) {
        parts = line.split(/\s{2,}/).filter((p) => p !== '');
      }
      if (parts.length === 1) {
        const m = line.match(/^([A-Za-z][A-Za-z'’\- ]*?)\s+(.+)$/);
        if (m) parts = [m[1], m[2]];
      }
      const term = (parts[0] || '').trim();
      if (!term || !/[A-Za-z]/.test(term)) return;

      const rest = parts.slice(1).map((p) => p.trim());
      let phonetic = '';
      let meaning = '';
      const exParts = [];
      rest.forEach((p) => {
        if (!phonetic && /^\/.*\/$/.test(p)) phonetic = p;
        else if (!meaning && /[\u4e00-\u9fa5]/.test(p)) meaning = p;
        else exParts.push(p);
      });
      if (!meaning && rest.length) meaning = rest[0];
      out.push({ term, phonetic, meaning, example: exParts[0] || '' });
    });
    return out;
  }

  function submitMany(e) {
    e.preventDefault();
    const rows = parseLines($('#fLines').value);
    if (!rows.length) {
      toast('没解析出单词，检查一下格式');
      return;
    }
    const exist = new Set(DATA.words.map((w) => w.term.toLowerCase()));
    const batchTags = parseTags($('#fBatchTags').value);
    let added = 0;
    let skipped = 0;
    rows.forEach((r) => {
      if (exist.has(r.term.toLowerCase())) {
        skipped++;
        return;
      }
      exist.add(r.term.toLowerCase());
      DATA.words.push(makeWord({ ...r, tags: batchTags }));
      added++;
    });
    save();
    renderAll();
    $('#fLines').value = '';
    $('#fBatchTags').value = '';
    toast(added ? `已添加 ${added} 个词${skipped ? `，跳过 ${skipped} 个重复的` : ''}` : '这些词都已经在词库里了');
    if (added) closeAdd();
  }

  /* ---------------------------------------------------------
     在线查词（音标 / 词性 / 英文释义 / 中文释义）
     数据源：Datamuse（无 key、支持 CORS）+ MyMemory 翻译
     --------------------------------------------------------- */
  let lookupBusy = false;
  let lastLookupTerm = '';

  // ARPAbet → IPA，Datamuse 给的是 ARPAbet，需要一个对照表转成学习者看得懂的音标
  const ARPA_IPA = {
    AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ', D: 'd',
    DH: 'ð', EH: 'e', ER: 'ɝ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h', IH: 'ɪ', IY: 'i',
    JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', OW: 'oʊ', OY: 'ɔɪ', P: 'p',
    R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', UH: 'ʊ', UW: 'u', V: 'v', W: 'w',
    Y: 'j', Z: 'z', ZH: 'ʒ',
  };

  function arpaToIpa(arpa) {
    const tokens = String(arpa || '').trim().split(/\s+/);
    let out = '';
    tokens.forEach((tok) => {
      const m = tok.match(/^([A-Z]+)([012])?$/);
      if (!m) return;
      const ph = m[1];
      const stress = m[2];
      let ipa = ARPA_IPA[ph];
      if (!ipa) return;
      if (ph === 'AH' && stress === '0') ipa = 'ə';
      if (ph === 'ER' && stress === '0') ipa = 'ɚ';
      if (stress === '1') out += 'ˈ';
      else if (stress === '2') out += 'ˌ';
      out += ipa;
    });
    return out ? `/${out}/` : '';
  }

  function decodeEntities(s) {
    const el = document.createElement('textarea');
    el.innerHTML = s;
    return el.value;
  }

  // 中文释义：MyMemory 免费接口，失败就留空让用户自己填
  async function translateZh(term) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|zh-CN`,
        { signal: ctrl.signal }
      );
      if (!res.ok) return '';
      const data = await res.json();
      let text = decodeEntities(String((data && data.responseData && data.responseData.translatedText) || '')).trim();
      // 去掉翻译结果里自带的词性标注，词性由 Datamuse 提供
      text = text.replace(/^(n|v|vt|vi|adj|adv|prep|pron|conj|num|art|int)\.\s*/i, '');
      if (!text || text.toLowerCase() === term.toLowerCase()) return '';
      return text;
    } catch (err) {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookupWord(rawTerm) {
    const term = (rawTerm || '').trim();
    const status = $('#lookupStatus');
    const setStatus = (text, tone) => {
      status.hidden = false;
      status.className = 'lookup-status' + (tone ? ' ' + tone : '');
      status.textContent = text;
    };

    if (!/^[A-Za-z][A-Za-z' -]*$/.test(term)) {
      setStatus('只能查英文单词', 'bad');
      return;
    }
    if (lookupBusy) return;
    lookupBusy = true;
    lastLookupTerm = term;
    setStatus(`正在查「${term}」…`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(term.toLowerCase())}&md=dr&max=6`,
        { signal: ctrl.signal }
      );
      if (!res.ok) throw new Error('http ' + res.status);
      const list = await res.json();
      const hit = (Array.isArray(list) ? list : []).find(
        (x) => x && String(x.word || '').toLowerCase() === term.toLowerCase()
      );

      if (!hit) {
        const guess = Array.isArray(list) && list[0] ? `，你可能想查「${list[0].word}」` : '';
        setStatus(`没查到这个词${guess}`, 'bad');
        return;
      }

      const pronTag = (hit.tags || []).find((t) => String(t).startsWith('pron:')) || '';
      const phonetic = arpaToIpa(String(pronTag).slice(5));

      const firstDef = String((hit.defs || [])[0] || '');
      const [rawPos, ...defRest] = firstDef.split('\t');
      const posMap = { n: 'n.', v: 'v.', adj: 'adj.', adv: 'adv.', u: '', interj: 'int.' };
      const pos = posMap[rawPos] || '';
      const definition = defRest.join(' ').trim();

      // 只填空着的字段，不覆盖用户已经写的内容
      const fill = (sel, value) => {
        const el = $(sel);
        if (el && value && !el.value.trim()) el.value = value;
      };
      fill('#fPhon', phonetic);
      fill('#fPos', pos);
      fill('#fDefinition', definition);

      // 音标和释义先落地，中文翻译慢的话不用干等
      setStatus('音标和英文释义已填好，正在补中文…', 'ok');

      const zh = await translateZh(term);
      fill('#fMeaning', zh);

      setStatus(zh ? '已从词典填充，核对一下再保存' : '中文释义没查到，自己补一下', 'ok');
    } catch (err) {
      setStatus('查词失败，检查网络或手动填写', 'bad');
    } finally {
      clearTimeout(timer);
      lookupBusy = false;
    }
  }

  /* ---------------------------------------------------------
     导入导出
     --------------------------------------------------------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportData() {
    download(`cihua-${dayKey()}.json`, JSON.stringify(DATA, null, 2), 'application/json');
    DATA.settings.lastBackup = Date.now();
    save();
    renderBackupNote();
    toast('备份已导出');
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildCsv() {
    const head = ['单词', '音标', '释义', '英文释义', '例句', '例句翻译', '标签', '下次复习', '复习次数', '状态'];
    const rows = DATA.words.map((w) => [
      w.term,
      w.phonetic,
      w.meaning,
      w.definition,
      w.example,
      w.exampleZh,
      (w.tags || []).join(' '),
      w.srs.seen ? new Date(w.srs.due).toISOString().slice(0, 10) : '',
      w.srs.reps || 0,
      isNew(w) ? '未学' : isMastered(w) ? '已掌握' : '学习中',
    ]);
    // BOM：Excel 打开中文 CSV 不乱码
    return '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function buildAnki() {
    const lines = ['#separator:tab', '#html:true', '#deck:词话'];
    DATA.words.forEach((w) => {
      const front = `${esc(w.term)}${w.phonetic ? `<br><span style="color:#888;font-size:90%">${esc(w.phonetic)}</span>` : ''}`;
      const back = [
        w.meaning ? `<div>${esc(w.meaning)}</div>` : '',
        w.definition ? `<div style="color:#666;font-size:92%"><i>${esc(w.definition)}</i></div>` : '',
        w.example ? `<div style="margin-top:8px">${esc(w.example)}</div>` : '',
        w.exampleZh ? `<div style="color:#888;font-size:92%">${esc(w.exampleZh)}</div>` : '',
        (w.tags || []).length ? `<div style="color:#999;font-size:85%">${esc((w.tags || []).join(' · '))}</div>` : '',
      ].join('');
      lines.push(`${front}\t${back}`);
    });
    return lines.join('\n');
  }

  function exportCsv() {
    if (!DATA.words.length) {
      toast('还没有单词可以导出');
      return;
    }
    download(`cihua-${dayKey()}.csv`, buildCsv(), 'text/csv;charset=utf-8');
    toast(`已导出 ${DATA.words.length} 个词的 CSV`);
  }

  function exportAnki() {
    if (!DATA.words.length) {
      toast('还没有单词可以导出');
      return;
    }
    download(`cihua-anki-${dayKey()}.txt`, buildAnki(), 'text/plain;charset=utf-8');
    toast('Anki 文件已导出，导入时选「制表符分隔」');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = Array.isArray(parsed) ? parsed : parsed.words;
        if (!Array.isArray(incoming)) throw new Error('bad');
        const exist = new Set(DATA.words.map((w) => w.term.toLowerCase()));
        let added = 0;
        incoming.forEach((raw) => {
          if (!raw || !raw.term || !raw.meaning) return;
          if (exist.has(String(raw.term).toLowerCase())) return;
          exist.add(String(raw.term).toLowerCase());
          DATA.words.push(makeWord(raw));
          added++;
        });
        if (parsed && parsed.logs && typeof parsed.logs === 'object') {
          Object.keys(parsed.logs).forEach((k) => {
            if (!DATA.logs[k]) DATA.logs[k] = parsed.logs[k];
          });
        }
        save();
        renderAll();
        toast(`导入了 ${added} 个词`);
      } catch (err) {
        toast('文件格式不对，需要词话导出的 JSON');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------
     云同步（Supabase / 任意 PostgREST，可选）
     数据表只有一行：id / value(jsonb) / updated_at
     --------------------------------------------------------- */
  const SYNC_LS = 'cihua.sync';
  let SYNC = { url: '', key: '', id: '', lastSync: 0 };
  let syncing = false;

  function loadSync() {
    try {
      const raw = localStorage.getItem(SYNC_LS);
      if (raw) SYNC = Object.assign(SYNC, JSON.parse(raw));
    } catch (err) {
      /* 忽略坏数据 */
    }
  }

  function saveSync() {
    try {
      localStorage.setItem(SYNC_LS, JSON.stringify(SYNC));
    } catch (err) {
      /* 忽略 */
    }
  }

  const syncConfigured = () => !!(SYNC.url && SYNC.key && SYNC.id);
  const syncBase = () => String(SYNC.url || '').replace(/\/+$/, '');

  function syncHeaders() {
    return { 'Content-Type': 'application/json', apikey: SYNC.key, Authorization: `Bearer ${SYNC.key}` };
  }

  function setSyncStatus(text, tone) {
    const el = $('#syncStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'row-label sync-' + (tone || 'idle');
  }

  async function syncPull() {
    const url = `${syncBase()}/rest/v1/cihua?id=eq.${encodeURIComponent(SYNC.id)}&select=value,updated_at`;
    const res = await fetch(url, { headers: syncHeaders() });
    if (!res.ok) throw new Error(`读取失败 ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0].value : null;
  }

  async function syncPush() {
    const url = `${syncBase()}/rest/v1/cihua`;
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign(syncHeaders(), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        id: SYNC.id,
        value: { words: DATA.words, logs: DATA.logs, deleted: DATA.deleted },
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`写入失败 ${res.status}`);
  }

  /* 合并：同 id 取较新的；删除用墓碑，避免「删了又回来」；打卡记录取最大值 */
  function mergeRemote(remote) {
    if (!remote || !Array.isArray(remote.words)) {
      return { words: DATA.words, logs: DATA.logs, deleted: DATA.deleted || [] };
    }
    const tomb = new Map();
    [...(DATA.deleted || []), ...(remote.deleted || [])].forEach((d) => {
      if (!d || !d.id) return;
      const at = Number(d.at) || 0;
      if (!tomb.has(d.id) || tomb.get(d.id) < at) tomb.set(d.id, at);
    });

    const byId = new Map();
    const add = (w) => {
      if (!w || !w.id) return;
      const cur = byId.get(w.id);
      if (!cur || (Number(w.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) byId.set(w.id, w);
    };
    DATA.words.forEach(add);
    remote.words.forEach(add);

    const words = Array.from(byId.values()).filter((w) => {
      const at = tomb.get(w.id);
      return !(at && at > (Number(w.updatedAt) || 0));
    });

    // 两台设备各自加过同一个词（id 不同）：按 term 去重，保留较新的，旧 id 记墓碑防止再回来
    const byTerm = new Map();
    const unique = [];
    words.forEach((w) => {
      const key = String(w.term || '').toLowerCase().trim();
      if (!key) {
        unique.push(w);
        return;
      }
      const cur = byTerm.get(key);
      if (!cur) {
        byTerm.set(key, w);
        unique.push(w);
        return;
      }
      const newer = (Number(w.updatedAt) || 0) >= (Number(cur.updatedAt) || 0) ? w : cur;
      const older = newer === w ? cur : w;
      tomb.set(older.id, Math.max(tomb.get(older.id) || 0, Number(newer.updatedAt) || Date.now()));
      const idx = unique.indexOf(older);
      if (idx >= 0) unique[idx] = newer;
      byTerm.set(key, newer);
    });

    const logs = Object.assign({}, DATA.logs);
    Object.keys(remote.logs || {}).forEach((k) => {
      const r = remote.logs[k] || {};
      const l = logs[k];
      if (!l) {
        logs[k] = r;
        return;
      }
      logs[k] = {
        count: Math.max(Number(l.count) || 0, Number(r.count) || 0),
        new: Math.max(Number(l.new) || 0, Number(r.new) || 0),
        review: Math.max(Number(l.review) || 0, Number(r.review) || 0),
      };
    });

    const deleted = Array.from(tomb.entries())
      .map(([id, at]) => ({ id, at }))
      .sort((a, b) => a.at - b.at)
      .slice(-500);

    return { words: unique, logs, deleted };
  }

  async function syncNow(opts = {}) {
    if (!syncConfigured()) {
      setSyncStatus('先填地址、Key 和同步 ID', 'bad');
      if (!opts.silent) toast('还没配置同步');
      return false;
    }
    if (syncing) return false;
    syncing = true;
    setSyncStatus('同步中…', 'idle');
    try {
      const remote = await syncPull();
      const merged = mergeRemote(remote);
      DATA.words = merged.words.map(makeWord);
      DATA.logs = merged.logs;
      DATA.deleted = merged.deleted;
      save();
      await syncPush();
      SYNC.lastSync = Date.now();
      saveSync();
      setSyncStatus(`上次同步 ${new Date(SYNC.lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
      renderAll();
      if (!opts.silent) toast('同步完成');
      return true;
    } catch (err) {
      setSyncStatus(`同步失败：${err.message || '网络错误'}`, 'bad');
      if (!opts.silent) toast('同步失败，检查地址和 Key');
      return false;
    } finally {
      syncing = false;
    }
  }

  function renderSyncForm() {
    const url = $('#syncUrl');
    if (!url) return;
    url.value = SYNC.url || '';
    $('#syncKey').value = SYNC.key || '';
    $('#syncId').value = SYNC.id || '';
    if (syncConfigured()) {
      setSyncStatus(
        SYNC.lastSync ? `上次同步 ${new Date(SYNC.lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '已配置，待同步',
        SYNC.lastSync ? 'ok' : 'idle'
      );
    } else {
      setSyncStatus('未连接', 'idle');
    }
  }

  /* ---------------------------------------------------------
     每日提醒
     --------------------------------------------------------- */
  function notifyStatusText() {
    if (!('Notification' in window)) return '这个浏览器不支持通知';
    if (Notification.permission === 'granted') return '通知已开启';
    if (Notification.permission === 'denied') return '通知被拒绝，请到浏览器设置里打开';
    return '通知权限：未开启';
  }

  function renderNotify() {
    const st = $('#notifyStatus');
    const btn = $('#btnNotifyPerm');
    if (!st || !btn) return;
    st.textContent = notifyStatusText();
    btn.hidden = 'Notification' in window && Notification.permission === 'granted';
  }

  async function requestNotify() {
    if (!('Notification' in window)) {
      toast('这个浏览器不支持通知');
      return;
    }
    if (Notification.permission === 'granted') {
      toast('通知已经开着了');
      return;
    }
    const p = await Notification.requestPermission();
    renderNotify();
    toast(p === 'granted' ? '通知已开启' : '没有拿到通知权限，会改为页面内提醒');
    if (p === 'granted') checkReminder();
  }

  async function fireNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, { body, icon: 'icon.svg', tag: 'cihua-daily' });
          return;
        }
      } catch (err) {
        /* 落到下面的方案 */
      }
      try {
        new Notification(title, { body, icon: 'icon.svg' });
        return;
      } catch (err) {
        /* 落到页面内提示 */
      }
    }
    toast(`${title} · ${body}`);
  }

  function checkReminder() {
    const s = DATA.settings;
    if (!s.reminderOn) return;
    const [h, m] = String(s.reminderTime || '20:00').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (now < target) return;

    const k = dayKey();
    if ((DATA.logs[k] || {}).count > 0) return;
    if (s.lastReminded === k) return;

    s.lastReminded = k;
    save();
    fireNotification('今天的单词还没练', '花 5 分钟过一遍，别断了连续记录');
  }

  function startReminderLoop() {
    checkReminder();
    setInterval(checkReminder, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkReminder();
    });
  }

  /* ---------------------------------------------------------
     轻提示
     --------------------------------------------------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------------------------------------------------------
     导航与事件绑定
     --------------------------------------------------------- */
  function switchTab(tab) {
    $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${tab}`));
    $('#btnLibAdd').hidden = tab !== 'library';
    if (tab === 'today') renderToday();
    if (tab === 'library') renderLibrary();
    if (tab === 'me') renderMe();
    window.scrollTo({ top: 0 });
  }

  function bind() {
    $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    $('#btnStart').addEventListener('click', () => startStudy('read'));
    $('#tipAction').addEventListener('click', () => {
      DATA.settings.onboarded = true;
      save();
      renderTip();
    });
    $('#btnInstall').addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        try {
          await installPrompt.userChoice;
        } catch (err) {
          /* 忽略 */
        }
        installPrompt = null;
        renderInstall();
      } else {
        toast('在浏览器菜单里选「安装应用」或「添加到主屏幕」');
      }
    });
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      renderInstall();
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      renderInstall();
      toast('已添加到主屏');
    });
    $('#btnDictate').addEventListener('click', () => startStudy('dictate'));
    $('#btnSpeak').addEventListener('click', () => startStudy('speak'));
    $('#btnCloze').addEventListener('click', () => startStudy('cloze'));
    $('#btnSpeakNext').addEventListener('click', () => {
      if (!session.running) return;
      session.idx += 1;
      renderStudy();
    });
    $('#btnQuickAdd').addEventListener('click', () => openAdd());
    $('#btnLibAdd').addEventListener('click', () => openAdd());
    $('#btnEmptyAdd').addEventListener('click', () => {
      if (activeFilter === 'all' && !searchTerm && !activeTag) openAdd();
      else {
        activeFilter = 'all';
        activeTag = '';
        searchTerm = '';
        $('#searchInput').value = '';
        $$('#libFilters .chip').forEach((c) => c.classList.toggle('is-active', c.dataset.filter === 'all'));
        renderLibrary();
      }
    });

    // 列表事件（今日 + 词库共用逻辑）
    ['#recentList', '#libList'].forEach((sel) => {
      $(sel).addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        const li = e.target.closest('.word-item');
        if (!btn || !li) return;
        const w = getWord(li.dataset.id);
        if (!w) return;
        const act = btn.dataset.act;
        if (act === 'speak') {
          speak(w.term);
          btn.classList.add('speaking');
          setTimeout(() => btn.classList.remove('speaking'), 900);
        } else if (act === 'tag') {
          activeTag = btn.dataset.tag || '';
          switchTab('library');
        } else if (act === 'del') {
          if (!confirm(`删除「${w.term}」？`)) return;
          DATA.words = DATA.words.filter((x) => x.id !== w.id);
          DATA.deleted = DATA.deleted || [];
          DATA.deleted.push({ id: w.id, at: Date.now() });
          if (DATA.deleted.length > 500) DATA.deleted = DATA.deleted.slice(-500);
          save();
          renderAll();
          toast('已删除');
        } else if (act === 'edit') {
          openAdd(w);
        }
      });
    });

    $('#libFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      activeFilter = chip.dataset.filter;
      $$('#libFilters .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      renderLibrary();
    });

    $('#libTags').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      activeTag = chip.dataset.tag || '';
      renderLibrary();
    });

    $('#searchInput').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderLibrary();
    });

    $('#btnCloseStudy').addEventListener('click', closeStudy);

    $('#gradeBar').addEventListener('click', (e) => {
      const b = e.target.closest('.grade');
      if (!b) return;
      grade(Number(b.dataset.grade));
    });

    // 添加弹层
    $('#btnAddClose').addEventListener('click', closeAdd);
    $('#addModal').addEventListener('click', (e) => {
      if (e.target.id === 'addModal') closeAdd();
    });
    $('#addSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      $$('#addSeg button').forEach((x) => x.classList.toggle('is-active', x === b));
      $('#formOne').hidden = b.dataset.mode !== 'one';
      $('#formMany').hidden = b.dataset.mode !== 'many';
    });
    $('#formOne').addEventListener('submit', submitOne);
    $('#formMany').addEventListener('submit', submitMany);

    // 查词：按钮 / 回车 / 失焦自动查
    $('#btnLookup').addEventListener('click', () => lookupWord($('#fTerm').value));
    $('#fTerm').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookupWord($('#fTerm').value);
      }
    });
    $('#fTerm').addEventListener('blur', () => {
      const t = $('#fTerm').value.trim();
      if (!t || t === lastLookupTerm) return;
      if ($('#fPhon').value.trim() || $('#fDefinition').value.trim()) return;
      lookupWord(t);
    });
    $('#btnSaveDone').addEventListener('click', () => {
      const term = $('#fTerm').value.trim();
      const meaning = $('#fMeaning').value.trim();
      if (!term || !meaning) {
        toast('单词和释义都要填');
        return;
      }
      // 复用提交逻辑，然后关闭
      const fake = { preventDefault() {} };
      submitOne(fake);
      closeAdd();
    });

    // 设置
    $('#setDailyNew').addEventListener('change', (e) => {
      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      DATA.settings.dailyNew = v;
      e.target.value = v;
      save();
      renderToday();
    });
    $('#setAutoSpeak').addEventListener('change', (e) => {
      DATA.settings.autoSpeak = e.target.checked;
      save();
    });
    $('#setRate').addEventListener('input', (e) => {
      DATA.settings.rate = Number(e.target.value);
      save();
    });
    $('#setRate').addEventListener('change', () => speak('This is my speaking speed.'));
    $('#setReminder').addEventListener('change', async (e) => {
      if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        renderNotify();
        if (p !== 'granted') toast('没有拿到通知权限，会改为页面内提醒');
      }
      DATA.settings.reminderOn = e.target.checked;
      DATA.settings.lastReminded = '';
      save();
      checkReminder();
    });
    $('#setReminderTime').addEventListener('change', (e) => {
      DATA.settings.reminderTime = e.target.value || '20:00';
      DATA.settings.lastReminded = '';
      save();
      checkReminder();
    });
    $('#btnNotifyPerm').addEventListener('click', requestNotify);

    // 云同步
    $('#btnSyncSave').addEventListener('click', () => {
      SYNC.url = $('#syncUrl').value.trim();
      SYNC.key = $('#syncKey').value.trim();
      SYNC.id = $('#syncId').value.trim();
      if (!SYNC.url || !SYNC.key || !SYNC.id) {
        setSyncStatus('三项都要填', 'bad');
        toast('地址、Key、同步 ID 都要填');
        return;
      }
      saveSync();
      syncNow();
    });
    $('#btnSyncNow').addEventListener('click', () => syncNow());
    $('#btnSyncIdGen').addEventListener('click', () => {
      const id = 'cihua-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      $('#syncId').value = id;
      SYNC.id = id;
      saveSync();
      toast('已生成同步 ID，另一台设备填同一个');
    });
    $('#setVoice').addEventListener('change', (e) => {
      DATA.settings.voiceURI = e.target.value;
      save();
      speak('Hello, this is how I sound.');
    });

    // 数据
    $('#btnExport').addEventListener('click', exportData);
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnExportAnki').addEventListener('click', exportAnki);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });
    $('#btnSeed').addEventListener('click', () => {
      const n = seedDemo(true);
      if (n) {
        save();
        renderAll();
        toast(`已补充 ${n} 个常用词`);
      }
    });
    $('#btnReset').addEventListener('click', () => {
      if (!confirm('清空所有单词和学习记录？这个操作不能撤销。')) return;
      localStorage.removeItem(LS_KEY);
      location.reload();
    });

    // 键盘：学习时按 1/2/3 评分
    document.addEventListener('keydown', (e) => {
      if ($('#study').hidden) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (!session.revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          revealCard();
        }
        return;
      }
      if (['0', '1', '2'].includes(e.key)) grade(Number(e.key));
    });
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */
  load();
  loadSync();
  bind();
  renderAll();
  startReminderLoop();
  if (syncConfigured()) setTimeout(() => syncNow({ silent: true }), 800);

  if ('speechSynthesis' in window) {
    refreshVoices();
    if (typeof speechSynthesis.addEventListener === 'function') {
      speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } else {
      speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  // 设备没有麦克风权限时给出提示（仅首次）
  if (!navigator.mediaDevices) {
    console.warn('当前环境不支持麦克风录音，跟读功能会不可用');
  }

  // 离线可用：注册 Service Worker
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  window.__cihuaBooted = true;
  // 启动成功就把「加载失败」兜底条收掉（弱网时它可能已经先弹出来了）
  const bootErr = document.getElementById('bootError');
  if (bootErr) bootErr.hidden = true;
})();
