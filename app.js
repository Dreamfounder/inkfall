/* ============================================================
   墨蚀：拾字纪 — application
   Plain ES2019+, no build step.
   ============================================================ */

(function () {
  'use strict';

  const DATA = window.INK_DATA;
  const CHAPTERS = DATA.chapters;
  const SIDES = DATA.sideStories;
  const CHALLENGES = DATA.challenges;
  const TIERS = DATA.tiers;
  const RANKS = DATA.ranks;
  const SEAL_SENTENCE = '万物有时，字里重逢，记得就好';
  const STORE_KEY = 'inkfall_save_v1';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const LEVEL_MAP = new Map();
  CHAPTERS.forEach((chapter) => {
    chapter.levels.forEach((level, index) => {
      LEVEL_MAP.set(level.id, { level, chapter, index });
    });
  });
  const CHAPTER_MAP = new Map(CHAPTERS.map((c) => [c.id, c]));
  const SIDE_MAP = new Map(SIDES.map((s) => [s.id, s]));
  const CHALLENGE_MAP = new Map(CHALLENGES.map((c) => [c.id, c]));
  const TIER_MAP = new Map(TIERS.map((t) => [t.tier, t]));

  const app = $('#app');
  const dialog = $('#gameDialog');
  const dialogContent = $('#dialogContent');
  const typingScreen = $('#typingScreen');
  const finaleScreen = $('#finaleScreen');
  const finaleContent = $('#finaleContent');
  const typingInput = $('#typingInput');
  const targetText = $('#targetText');
  const pauseVeil = $('#pauseVeil');
  const toastRoot = $('#toastRoot');

  let save = loadSave();
  let typing = null;
  let lastResult = null;
  let sideFilter = 'all';
  let currentRoute = { name: 'home', param: '' };
  let drawHistory = {};
  let audioCtx = null;

  /* ------------------------------------------------------------
     Utilities
     ------------------------------------------------------------ */

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatNumber(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('zh-CN');
  }

  function firstChars(text, count) {
    const chars = Array.from(String(text || ''));
    return chars.slice(0, count).join('');
  }

  function starsHTML(count, max) {
    const total = max || 3;
    let html = '';
    for (let i = 1; i <= total; i += 1) {
      html += `<span class="${i <= count ? 'is-on' : ''}">★</span>`;
    }
    return html;
  }

  function starsText(count, max) {
    const total = max || 3;
    return `${'★'.repeat(Math.max(0, Math.min(total, count)))}${'☆'.repeat(Math.max(0, total - count))}`;
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    if (safe < 60) return safe.toFixed(1);
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function paragraphsHTML(list, className) {
    return (list || []).map((text) => `<p${className ? ` class="${className}"` : ''}>${escapeHTML(text)}</p>`).join('');
  }

  function parseHash() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return {
      name: parts[0] || 'home',
      param: parts[1] || ''
    };
  }

  function navigate(path) {
    const clean = String(path || '').replace(/^#?\/?/, '');
    const target = `#/${clean}`;
    if (location.hash === target) {
      renderRoute();
    } else {
      location.hash = target;
    }
  }

  function scrollPageTo(y) {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = previous;
  }

  function syncBodyLock() {
    const isLocked = dialog.open || !typingScreen.hidden || !finaleScreen.hidden;
    document.body.classList.toggle('modal-open', isLocked);
    document.body.classList.toggle('typing-active', !typingScreen.hidden);
    document.body.classList.toggle('finale-active', !finaleScreen.hidden);
  }

  /* ------------------------------------------------------------
     Save data
     ------------------------------------------------------------ */

  function freshSave() {
    const challenges = {};
    [1, 2, 3, 4, 5].forEach((tier) => {
      challenges[tier] = {
        seen: [],
        runs: 0,
        bestCpm: 0,
        bestAccuracy: 0,
        bestGrade: '',
        bestSeconds: 0
      };
    });
    return {
      version: 1,
      ink: 0,
      levels: {},
      chapters: {},
      sides: {},
      challenges,
      stats: {
        correct: 0,
        seconds: 0,
        mistakes: 0,
        runs: 0
      },
      settings: {
        sound: false
      },
      legacyWord: '',
      storyCompleteAt: null,
      completedAt: null
    };
  }

  function loadSave() {
    const base = freshSave();
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (err) {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') return base;

    const merged = Object.assign(base, raw);
    merged.levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
    merged.chapters = raw.chapters && typeof raw.chapters === 'object' ? raw.chapters : {};
    merged.sides = raw.sides && typeof raw.sides === 'object' ? raw.sides : {};
    merged.challenges = raw.challenges && typeof raw.challenges === 'object' ? raw.challenges : {};
    [1, 2, 3, 4, 5].forEach((tier) => {
      const current = merged.challenges[tier] || {};
      merged.challenges[tier] = Object.assign({
        seen: [],
        runs: 0,
        bestCpm: 0,
        bestAccuracy: 0,
        bestGrade: '',
        bestSeconds: 0
      }, current);
      if (!Array.isArray(merged.challenges[tier].seen)) merged.challenges[tier].seen = [];
    });
    merged.stats = Object.assign(base.stats, raw.stats || {});
    merged.settings = Object.assign(base.settings, raw.settings || {});
    merged.ink = Number(merged.ink) || 0;
    merged.legacyWord = typeof merged.legacyWord === 'string' ? merged.legacyWord : '';
    return merged;
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(save));
    } catch (err) {
      toast('浏览器未能写入本地存档，本次进度可能无法保留。');
    }
  }

  /* ------------------------------------------------------------
     Progress helpers
     ------------------------------------------------------------ */

  function chapterDone(chapter) {
    return chapter.levels.every((level) => Boolean(save.levels[level.id]));
  }

  function chapterUnlocked(chapter) {
    if (chapter.index === 1) return true;
    const previous = CHAPTERS[chapter.index - 2];
    return Boolean(previous && chapterDone(previous));
  }

  function levelUnlocked(chapter, index) {
    if (!chapterUnlocked(chapter)) return false;
    if (index === 0) return true;
    return Boolean(save.levels[chapter.levels[index - 1].id]);
  }

  function nextStoryLevel() {
    for (const chapter of CHAPTERS) {
      if (!chapterUnlocked(chapter)) continue;
      for (let i = 0; i < chapter.levels.length; i += 1) {
        if (!save.levels[chapter.levels[i].id]) {
          return { chapter, level: chapter.levels[i], index: i };
        }
      }
    }
    return null;
  }

  function allChaptersDone() {
    return CHAPTERS.every(chapterDone);
  }

  function sideUnlocked(side) {
    const chapter = CHAPTERS[side.chapter - 1];
    return Boolean(chapter && chapterDone(chapter));
  }

  function sideDone(side) {
    return Boolean(save.sides[side.id]);
  }

  function clearedStoryLevels() {
    return Object.keys(save.levels).length;
  }

  function clearedSides() {
    return Object.keys(save.sides).length;
  }

  function clearedChallenges() {
    return CHALLENGES.filter((challenge) => {
      const tier = save.challenges[challenge.tier];
      return tier && tier.seen.includes(challenge.id);
    }).length;
  }

  function getRank() {
    const points = clearedStoryLevels() + clearedSides() + Math.floor(clearedChallenges() / 2);
    let result = RANKS[0];
    RANKS.forEach((rank) => {
      if (points >= rank.min) result = rank;
    });
    return result;
  }

  function averageCpm() {
    if (!save.stats.seconds) return 0;
    return Math.round(save.stats.correct / (save.stats.seconds / 60));
  }

  function overallAccuracy() {
    const total = save.stats.correct + save.stats.mistakes;
    if (!total) return 100;
    return Math.round((save.stats.correct / total) * 100);
  }

  function bestChallengeGrade() {
    const grades = [];
    [1, 2, 3, 4, 5].forEach((tier) => {
      const value = save.challenges[tier] && save.challenges[tier].bestGrade;
      if (value) grades.push(value);
    });
    if (!grades.length) return '—';
    return grades.sort((a, b) => gradeScore(b) - gradeScore(a))[0];
  }

  function gradeScore(grade) {
    return { S: 4, A: 3, B: 2, C: 1 }[grade] || 0;
  }

  function chapterSideCount(chapter) {
    return SIDES.filter((side) => side.chapter === chapter.index).length;
  }

  /* ------------------------------------------------------------
     Header / rank
     ------------------------------------------------------------ */

  function updateHeader() {
    const rank = getRank();
    $('#rankName').textContent = rank.name;
    $('#rankEn').textContent = rank.en;
    $('#inkCount').textContent = formatNumber(save.ink);

    const soundToggle = $('#soundToggle');
    soundToggle.classList.toggle('is-on', Boolean(save.settings.sound));
    soundToggle.setAttribute('aria-pressed', save.settings.sound ? 'true' : 'false');
    soundToggle.title = save.settings.sound ? '笔触音：开启' : '笔触音：关闭';
  }

  function setActiveNav(name) {
    $$('.main-nav a').forEach((link) => {
      const key = link.dataset.nav;
      link.classList.toggle('is-active', key === name);
      if (key === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  /* ------------------------------------------------------------
     Home
     ------------------------------------------------------------ */

  function sealShelfHTML() {
    const next = nextStoryLevel();
    const currentChapterId = next ? next.chapter.id : '';
    return CHAPTERS.map((chapter) => {
      const done = chapterDone(chapter);
      const current = chapter.id === currentChapterId;
      const cls = ['seal', done ? 'is-done' : '', current ? 'is-current' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" title="${done ? '已完卷' : '未启封'} · ${escapeHTML(chapter.title)}">${chapter.seal}</div>`;
    }).join('');
  }

  function renderHome() {
    const next = nextStoryLevel();
    const completed = CHAPTERS.filter(chapterDone).length;
    const allDone = allChaptersDone();
    const totalStory = CHAPTERS.reduce((sum, c) => sum + c.levels.length, 0);
    const heroLead = next ? next.chapter : CHAPTERS[CHAPTERS.length - 1];
    const legacy = save.legacyWord ? escapeHTML(save.legacyWord) : '';
    const avg = averageCpm();

    let primaryAction = '';
    if (allDone) {
      primaryAction = save.legacyWord
        ? `<a class="btn btn-primary" href="#/story"><span>回看十二卷</span><span class="arrow">→</span></a>`
        : `<button class="btn btn-primary" type="button" data-action="open-finale"><span>写下最后一页</span><span class="arrow">→</span></button>`;
    } else if (next) {
      primaryAction = `<a class="btn btn-primary" href="#/chapter/${next.chapter.id}"><span>续写 · 第${next.chapter.numeral}卷</span><span class="arrow">→</span></a>`;
    } else {
      primaryAction = `<a class="btn btn-primary" href="#/story"><span>进入卷宗</span><span class="arrow">→</span></a>`;
    }

    return `
      <div class="view-enter">
        <section class="home-hero">
          <div class="hero-copy">
            <div class="hero-eyebrow"><span class="pulse-dot"></span>${allDone ? '全卷完 · 世界等待你的最后一个字' : '汉字叙事打字游戏 · 第一章已开放'}</div>
            <h1 class="hero-title">
              <span class="line">${allDone ? '世界已经' : '世界正在'}</span>
              <span class="line accent">${allDone ? '记得你。' : '失去名字。'}</span>
            </h1>
            <p class="hero-lede">
              ${allDone
                ? '空白退成了页边。拾遗城重新有了名字，而最后一页还空着一个位置——那是留给你的字。'
                : '空白正在吃掉这座城的字。招牌、歌谣、母亲留下的最后一页，都在等一个人把它们重新写下来。你是补字师沈砚，而这一次，<strong>落笔的人是你</strong>。'}
            </p>
            <div class="hero-actions">
              ${primaryAction}
              <a class="btn btn-ghost" href="#/challenge"><span>随机挑战</span><span class="arrow">↗</span></a>
            </div>
            <div class="hero-metrics">
              <div class="hero-metric">
                <strong>${completed}<em>/12</em></strong>
                <span>主线完卷</span>
              </div>
              <div class="hero-metric">
                <strong>${formatNumber(save.stats.correct)}<em>字</em></strong>
                <span>已刻字数</span>
              </div>
              <div class="hero-metric">
                <strong>${avg}<em>字/分</em></strong>
                <span>平均字速</span>
              </div>
            </div>
            ${legacy ? `<div class="hero-legacy">你的终字 <b>${legacy}</b></div>` : ''}
          </div>

          <div class="hero-visual" aria-hidden="true">
            <div class="ink-orbit">
              <span class="orbit-ring ring-a"></span>
              <span class="orbit-ring ring-b"></span>
              <span class="orbit-ring ring-c"></span>
              <div class="ink-disc">
                <span class="glyph">${allDone ? '记' : visualGlyph()}</span>
                <span class="glyph-sub">${allDone ? 'THE WORLD REMEMBERS' : 'THE UNWRITTEN'}</span>
              </div>
              <span class="orbit-char oc-1">字</span>
              <span class="orbit-char oc-2">墨</span>
              <span class="orbit-char oc-3">白</span>
              <span class="orbit-char oc-4">卷</span>
              <span class="orbit-char oc-5">校</span>
              <span class="orbit-char oc-6">补</span>
              <span class="orbit-char oc-7">记</span>
              <span class="orbit-char oc-8">你</span>
              <span class="orbit-label label-a">墨历九十七年</span>
              <span class="orbit-label label-b">城北 · 空白边界</span>
              <span class="orbit-label label-c">刻印进行中</span>
              <span class="orbit-caption">${next ? `下一卷 · ${escapeHTML(next.chapter.title)}` : '十二卷已完 · 终页待写'}</span>
            </div>
          </div>
        </section>

        <div class="word-marquee" aria-hidden="true">
          <div class="marquee-track">
            <span>IN THE BEGINNING WAS THE WORD</span><span>十二卷长卷</span><span>二十篇余墨</span><span>四十道无墨之试</span><span>一字一世界</span><span>万物有时 · 字里重逢</span>
            <span>IN THE BEGINNING WAS THE WORD</span><span>十二卷长卷</span><span>二十篇余墨</span><span>四十道无墨之试</span><span>一字一世界</span><span>万物有时 · 字里重逢</span>
          </div>
        </div>

        <section class="section">
          <div class="container">
            <div class="section-head">
              <div>
                <span class="kicker">TWO WAYS TO WRITE</span>
                <h2>两种落笔方式</h2>
              </div>
              <p>先沿着主线走进空白，补完十二卷；也可以在无墨之试里，独自面对一段没有上下文的文字。</p>
            </div>

            <div class="mode-grid">
              <a class="mode-card" href="#/story" data-glyph="卷">
                <div class="mode-top">
                  <span class="mode-number">01 · STORY</span>
                  <span class="mode-badge">12 卷 · 36 节点</span>
                </div>
                <div>
                  <h3>主线 · 拾字纪<small>THE UNWRITTEN ARCHIVE</small></h3>
                  <p>从一座忘记自己名字的城开始，追查被删去的九个字。每一段剧情，都是一次必须亲手完成的刻印。</p>
                </div>
                <div class="mode-bottom">
                  <div class="mode-figures">
                    <div class="mode-figure"><strong>${completed}/12</strong><span>已完卷</span></div>
                    <div class="mode-figure"><strong>${clearedStoryLevels()}/${totalStory}</strong><span>已刻印</span></div>
                  </div>
                  <span class="mode-go">→</span>
                </div>
              </a>

              <a class="mode-card" href="#/challenge" data-glyph="试">
                <div class="mode-top">
                  <span class="mode-number">02 · CHALLENGE</span>
                  <span class="mode-badge">1—5★ · 40 篇</span>
                </div>
                <div>
                  <h3>挑战 · 无墨之试<small>THE BLANK EXAMINATION</small></h3>
                  <p>五阶难度，每阶八篇文本。选定星数后随机抽取，不靠剧情提示，只凭你与文字之间的默契。</p>
                </div>
                <div class="mode-bottom">
                  <div class="mode-figures">
                    <div class="mode-figure"><strong>${clearedChallenges()}/40</strong><span>已遇篇目</span></div>
                    <div class="mode-figure"><strong>${bestChallengeGrade()}</strong><span>最佳评级</span></div>
                  </div>
                  <span class="mode-go">→</span>
                </div>
              </a>
            </div>
          </div>
        </section>

        <section class="section" id="world">
          <div class="container">
            <div class="section-head">
              <div>
                <span class="kicker">THE WORLD OF INK</span>
                <h2>墨界三则</h2>
              </div>
              <p>万物被写下来，才算真正存在。可如果写下世界的最后一句话，原本就是告别呢？</p>
            </div>
            <div class="world-grid">
              ${DATA.meta.world.map((item, index) => `
                <article class="world-item" data-num="0${index + 1}">
                  <h3>${escapeHTML(item.title)}</h3>
                  <p>${escapeHTML(item.text)}</p>
                </article>
              `).join('')}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="container seal-section">
            <div class="seal-copy">
              <span class="kicker">TWELVE SEALS</span>
              <h2>十二枚字印，<br>拼成一句<em>重逢</em>。</h2>
              <p>每完成一卷，便取回一枚字印。它们单独看只是残字，按顺序读完，却是一句写给世界的话。</p>
              <a class="text-link" href="#/story">查看全部卷宗 <span>→</span></a>
            </div>
            <div class="seal-shelf-wrap">
              <div class="seal-shelf">${sealShelfHTML()}</div>
              <div class="shelf-caption">
                <span>SEAL COLLECTION</span>
                <span>${completed} / 12</span>
              </div>
              ${allDone ? `<div class="seal-sentence">${SEAL_SENTENCE}</div>` : ''}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="container">
            <div class="continue-panel" data-seal="${next ? next.chapter.seal : '记'}">
              <div class="continue-info">
                <span class="kicker">${next ? 'CONTINUE THE STORY' : 'THE LAST PAGE'}</span>
                <h3>${next ? `第${next.chapter.numeral}卷 · ${escapeHTML(next.chapter.title)}` : '最后一页还没有字'}</h3>
                <p>${next
                  ? escapeHTML(next.level.intro)
                  : save.legacyWord
                    ? `你已经留下了一个字：${escapeHTML(save.legacyWord)}。十二卷仍在书架上，随时可以回去重读。`
                    : '十二卷已完。城外空白退成页边，而最后一页留着一个只属于你的位置。'}</p>
              </div>
              <div class="continue-action">
                ${next
                  ? `<a class="btn btn-ghost" href="#/chapter/${next.chapter.id}">继续落笔 <span class="arrow">→</span></a>`
                  : save.legacyWord
                    ? `<a class="btn btn-ghost" href="#/story">回到卷宗 <span class="arrow">→</span></a>`
                    : `<button class="btn btn-primary" type="button" data-action="open-finale"><span>写下最后一页</span><span class="arrow">→</span></button>`}
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function visualGlyph() {
    const next = nextStoryLevel();
    if (!next) return '记';
    return next.chapter.seal;
  }

  /* ------------------------------------------------------------
     Story index
     ------------------------------------------------------------ */

  function renderStory() {
    const next = nextStoryLevel();
    const completed = CHAPTERS.filter(chapterDone).length;
    const totalLevels = CHAPTERS.reduce((sum, c) => sum + c.levels.length, 0);
    const cleared = clearedStoryLevels();

    return `
      <div class="view-enter page">
        <div class="container">
          <div class="page-head">
            <div>
              <span class="kicker">THE UNWRITTEN ARCHIVE</span>
              <h1>主线卷宗<br><em>十二卷，一句重逢。</em></h1>
              <p class="page-lede">每一卷三段刻印。补完一段，下一段才会显形；补完一卷，取回一枚字印。你可以重读已完卷，但只有第一次落笔时，空白才会真正后退。</p>
            </div>
            <div class="page-side">
              <span>已完成</span>
              <strong>${completed} / 12</strong>
              <small>卷 · ${cleared} / ${totalLevels} 刻印</small>
            </div>
          </div>

          <div class="rail-progress">
            <span>START</span>
            <div class="rail-progress-track"><i style="width:${(completed / 12) * 100}%"></i></div>
            <span>${completed === 12 ? 'COMPLETE' : `${completed} / 12`}</span>
          </div>

          <div class="chapter-rail">
            ${CHAPTERS.map((chapter) => {
              const done = chapterDone(chapter);
              const unlocked = chapterUnlocked(chapter);
              const current = Boolean(next && next.chapter.id === chapter.id);
              const doneLevels = chapter.levels.filter((level) => save.levels[level.id]).length;
              const cardClass = ['chapter-card', done ? 'is-done' : '', current ? 'is-current' : '', unlocked ? '' : 'is-locked'].filter(Boolean).join(' ');
              const inner = `
                <div class="chapter-node">${done ? chapter.seal : chapter.numeral}</div>
                <div class="chapter-main">
                  <div class="chapter-main-top">
                    <span>VOL. ${String(chapter.index).padStart(2, '0')}</span>
                    <span class="dot"></span>
                    <span>${escapeHTML(chapter.en)}</span>
                    <span class="dot"></span>
                    <span>${done ? '已完卷' : current ? '待续' : '未启封'}</span>
                  </div>
                  <h2>${escapeHTML(chapter.title)}</h2>
                  <p>${escapeHTML(chapter.summary)}</p>
                </div>
                <div class="chapter-side">
                  <div class="chapter-dots">${chapter.levels.map((level) => `<i class="${save.levels[level.id] ? 'is-done' : ''}"></i>`).join('')}</div>
                  <span>${doneLevels} / 3 节点</span>
                  <span class="chapter-arrow">${unlocked ? '→' : '封'}</span>
                </div>
              `;
              if (!unlocked) {
                return `<div class="${cardClass}">${inner}</div>`;
              }
              return `<a class="${cardClass}" href="#/chapter/${chapter.id}">${inner}</a>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------
     Chapter detail
     ------------------------------------------------------------ */

  function renderLockedState(title, note, backHref, backLabel) {
    return `
      <div class="view-enter page">
        <div class="container">
          <div class="empty-state">
            <div>
              <div class="seal-mark">封</div>
              <h2>${escapeHTML(title)}</h2>
              <p>${escapeHTML(note)}</p>
              <a class="btn btn-ghost btn-sm" href="${backHref}">${escapeHTML(backLabel)}</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderChapter(chapterId) {
    const chapter = CHAPTER_MAP.get(chapterId);
    if (!chapter) {
      return renderLockedState('这一页不存在', '也许它已经被空白吃掉了。回到卷宗，换一卷继续。', '#/story', '返回卷宗');
    }
    if (!chapterUnlocked(chapter)) {
      const previous = CHAPTERS[chapter.index - 2];
      return renderLockedState(
        '这一卷还未启封',
        `完成${previous ? `第${previous.numeral}卷《${previous.title}》` : '前面的卷宗'}后，这一页才会显形。`,
        previous ? `#/chapter/${previous.id}` : '#/story',
        previous ? `前往第${previous.numeral}卷` : '返回卷宗'
      );
    }

    const done = chapterDone(chapter);
    const doneLevels = chapter.levels.filter((level) => save.levels[level.id]).length;
    const nextIndex = chapter.levels.findIndex((level) => !save.levels[level.id]);
    const next = nextStoryLevel();
    const previousChapter = CHAPTERS[chapter.index - 2];
    const nextChapter = CHAPTERS[chapter.index];
    const relatedSides = SIDES.filter((side) => side.chapter === chapter.index);
    const unlockedSides = relatedSides.filter(sideUnlocked);

    return `
      <div class="view-enter page">
        <div class="container">
          <div class="breadcrumb">
            <a href="#/story">主线卷宗</a><i>/</i><span>第${chapter.numeral}卷</span>
          </div>

          <header class="chapter-hero" data-en="${escapeHTML(chapter.en)}">
            <div>
              <div class="chapter-label"><span class="numeral">${chapter.numeral}</span><span>VOL. ${String(chapter.index).padStart(2, '0')} · ${escapeHTML(chapter.en)}</span></div>
              <h1>${escapeHTML(chapter.title)}</h1>
              <p class="epigraph">「${escapeHTML(chapter.epigraph)}」</p>
            </div>
            <aside class="chapter-aside">
              <div class="seal-mark">${chapter.seal}</div>
              <h3>本章刻印</h3>
              <div class="progress-number">${doneLevels} <em>/ 3</em></div>
              <div class="mini-progress"><i style="width:${(doneLevels / 3) * 100}%"></i></div>
              <p class="aside-note">${done ? '本章已完卷，可随时重读。' : next && next.chapter.id === chapter.id ? '从下一段空白开始。' : '本章尚有未补完的句子。'}</p>
            </aside>
          </header>

          <article class="chapter-intro story-prose">
            ${paragraphsHTML(chapter.intro)}
          </article>

          <section>
            <div class="section-label">本章刻印节点 · ${doneLevels} / 3</div>
            <div class="level-list">
              ${chapter.levels.map((level, index) => {
                const record = save.levels[level.id];
                const unlocked = levelUnlocked(chapter, index);
                const current = unlocked && !record && index === nextIndex;
                const cls = ['level-card', record ? 'is-done' : '', current ? 'is-current' : '', unlocked ? '' : 'is-locked'].filter(Boolean).join(' ');
                return `
                  <button class="${cls}" type="button" data-action="open-level" data-level="${level.id}" ${unlocked ? '' : 'disabled'}>
                    <span class="level-index">${record ? '✓' : `0${index + 1}`}</span>
                    <span class="level-main">
                      <span class="level-role">${escapeHTML(level.role)}</span>
                      <h3>${escapeHTML(level.title)}</h3>
                      <span class="level-excerpt">${record ? '已刻印 · 可重读此段' : `${firstChars(level.text, 26)}…`}</span>
                    </span>
                    <span class="level-state">
                      ${record
                        ? `<span class="mini-stars">${starsText(record.stars)}</span><span class="cpm-small">最佳 ${record.cpm} 字/分</span><span class="go-dot">↻</span>`
                        : unlocked
                          ? `<span class="state-label">${current ? '待刻印' : '可刻印'}</span><span class="go-dot">→</span>`
                          : `<span class="state-label">未解锁</span><span class="level-lock">封</span>`}
                    </span>
                  </button>
                `;
              }).join('')}
            </div>
          </section>

          ${done ? `
            <section class="chapter-outro" id="chapter-outro">
              <div class="outro-head">
                <h2>卷末 · 余音</h2>
                <span>SEAL ${chapter.seal} · COLLECTED</span>
              </div>
              <div class="story-prose">${paragraphsHTML(chapter.outro)}</div>
            </section>
          ` : `
            <div class="side-unlock-note">
              <span>${relatedSides.length ? `本卷完成后，可解锁 ${relatedSides.length} 篇支线档案。` : '本卷没有关联支线。'}</span>
              ${unlockedSides.length ? `<a class="text-link" href="#/side">翻阅已解锁档案 <span>→</span></a>` : `<span>支线 · ${relatedSides.length ? '待解锁' : '—'}</span>`}
            </div>
          `}

          ${done && relatedSides.length ? `
            <div class="side-unlock-note">
              <span>本卷关联支线已解锁：${unlockedSides.map((side) => `<strong>${escapeHTML(side.title)}</strong>`).join('、')}</span>
              <a class="text-link" href="#/side">查看档案 <span>→</span></a>
            </div>
          ` : ''}

          <div class="chapter-nav">
            <a class="text-link" href="#/story"><span>←</span> 返回卷宗</a>
            ${done && nextChapter
              ? `<a class="btn btn-ghost btn-sm" href="#/chapter/${nextChapter.id}">启封第${nextChapter.numeral}卷 <span class="arrow">→</span></a>`
              : `<span class="text-link" style="opacity:.42">${done ? '十二卷已尽' : '补完本卷，下一页才会显形'} <span>·</span></span>`}
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------
     Side stories
     ------------------------------------------------------------ */

  function renderSide() {
    const unlockedCount = SIDES.filter(sideUnlocked).length;
    const doneCount = SIDES.filter(sideDone).length;
    const filtered = SIDES.filter((side) => {
      if (sideFilter === 'unlocked') return sideUnlocked(side);
      if (sideFilter === 'done') return sideDone(side);
      return true;
    });

    return `
      <div class="view-enter page">
        <div class="container">
          <div class="page-head">
            <div>
              <span class="kicker">THE MARGIN · TWENTY ARCHIVES</span>
              <h1>支线档案<br><em>页边还有二十个人。</em></h1>
              <p class="page-lede">主线经过的地方，总有人还在过日子。他们不知道什么初版、什么空白，只知道灯要有人点，面要有人煮，名字要有人叫。每篇档案含一段独立的刻印文本。</p>
            </div>
            <div class="page-side">
              <span>已解锁</span>
              <strong>${unlockedCount} / 20</strong>
              <small>已归卷 · ${doneCount} 篇</small>
            </div>
          </div>

          <div class="filter-tabs" role="tablist" aria-label="支线筛选">
            <button class="filter-btn ${sideFilter === 'all' ? 'is-active' : ''}" type="button" data-action="filter-sides" data-filter="all">全部档案 · 20</button>
            <button class="filter-btn ${sideFilter === 'unlocked' ? 'is-active' : ''}" type="button" data-action="filter-sides" data-filter="unlocked">已解锁 · ${unlockedCount}</button>
            <button class="filter-btn ${sideFilter === 'done' ? 'is-active' : ''}" type="button" data-action="filter-sides" data-filter="done">已归卷 · ${doneCount}</button>
          </div>

          ${filtered.length ? `
            <div class="side-grid">
              ${filtered.map((side) => {
                const unlocked = sideUnlocked(side);
                const done = sideDone(side);
                const record = save.sides[side.id];
                const cls = ['side-card', unlocked ? '' : 'is-locked', done ? 'is-done' : ''].filter(Boolean).join(' ');
                const inner = `
                  <div class="side-top">
                    <span class="side-no">档案 ${side.no}</span>
                    <span class="side-tag">${escapeHTML(side.tag)}</span>
                  </div>
                  <h3>${escapeHTML(side.title)}</h3>
                  <span class="side-npc">${escapeHTML(side.npc)}</span>
                  <p>${escapeHTML(side.summary)}</p>
                  <div class="side-foot">
                    ${done
                      ? `<span class="mini-stars">${starsText(record.stars)}</span><span>${record.cpm} 字/分</span>`
                      : unlocked
                        ? `<span>可读取</span><span>→</span>`
                        : `<span class="side-lockline">封 · 完成第${side.chapter}章解锁</span>`}
                  </div>
                `;
                if (!unlocked) return `<div class="${cls}" data-no="${side.no}">${inner}</div>`;
                return `<a class="${cls}" data-no="${side.no}" href="#/side/${side.id}">${inner}</a>`;
              }).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div>
                <div class="seal-mark">空</div>
                <h2>这里暂时没有档案</h2>
                <p>换一个筛选，或者先去主线里走一段。</p>
                <button class="btn btn-ghost btn-sm" type="button" data-action="filter-sides" data-filter="all">显示全部</button>
              </div>
            </div>
          `}

          <div class="challenge-note">支线随主线完卷解锁。它们不会影响主线结局，但会告诉你：空白吃掉的不只是字，还有没能说完的话。</div>
        </div>
      </div>
    `;
  }

  function renderSideDetail(sideId) {
    const side = SIDE_MAP.get(sideId);
    if (!side) {
      return renderLockedState('档案不存在', '这一页也许还压在某个没有名字的抽屉里。', '#/side', '返回支线');
    }
    if (!sideUnlocked(side)) {
      return renderLockedState(
        '这份档案尚未解锁',
        `完成第${side.chapter}章后，才能读取《${side.title}》。`,
        '#/side',
        '返回支线'
      );
    }

    const done = sideDone(side);
    const record = save.sides[side.id];
    const chapter = CHAPTERS[side.chapter - 1];

    return `
      <div class="view-enter page">
        <div class="container">
          <div class="breadcrumb">
            <a href="#/side">支线档案</a><i>/</i><span>档案 ${side.no}</span>
          </div>

          <header class="side-hero">
            <div>
              <div class="side-label"><span>档案 ${side.no}</span><span>·</span><span>${escapeHTML(side.en)}</span><span>·</span><span>${escapeHTML(side.tag)}</span></div>
              <h1>${escapeHTML(side.title)}</h1>
              <p class="side-quote">「${escapeHTML(side.quote)}」</p>
            </div>
            <aside class="side-meta-card">
              <dl>
                <div><dt>关联卷宗</dt><dd>第${chapter.numeral}卷 · ${escapeHTML(chapter.title)}</dd></div>
                <div><dt>档案人物</dt><dd>${escapeHTML(side.npc)}</dd></div>
                <div><dt>刻印篇幅</dt><dd>${Array.from(side.level.text).length} 字</dd></div>
                <div><dt>档案状态</dt><dd>${done ? '已归卷' : '待读取'}</dd></div>
              </dl>
            </aside>
          </header>

          <article class="side-story story-prose">
            ${paragraphsHTML(side.intro)}
          </article>

          <section class="archive-node">
            <div class="node-head">
              <div>
                <span>ARCHIVE FRAGMENT · ${done ? 'COLLECTED' : 'SEALED'}</span>
                <h2>${escapeHTML(side.level.title)}</h2>
              </div>
              <span>${done ? `最佳 ${record.cpm} 字/分 · 准确 ${record.accuracy}%` : `需要刻印 · ${escapeHTML(side.level.role)}`}</span>
            </div>
            <div class="archive-quote">
              ${done
                ? escapeHTML(side.level.after)
                : `「${escapeHTML(firstChars(side.level.text, 34))}…」`}
            </div>
            <div class="archive-foot">
              <span>${done ? `已刻印 ${starsText(record.stars)}` : '一字不差地写下这段档案，它才会真正归卷。'}</span>
              <button class="btn ${done ? 'btn-ghost' : 'btn-primary'} btn-sm" type="button" data-action="open-side" data-side="${side.id}">
                ${done ? '重读这一笔' : '进入刻印'} <span class="arrow">→</span>
              </button>
            </div>
          </section>

          ${done ? `
            <section class="chapter-outro">
              <div class="outro-head">
                <h2>档案余音</h2>
                <span>BROUGHT TO THE ARCHIVE</span>
              </div>
              <div class="story-prose"><p>${escapeHTML(side.outro)}</p></div>
            </section>
          ` : ''}

          <div class="chapter-nav">
            <a class="text-link" href="#/side"><span>←</span> 返回支线</a>
            ${done ? '<span class="text-link" style="opacity:.42">这一页已经写完 <span>·</span></span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------
     Challenge
     ------------------------------------------------------------ */

  function renderChallenge(tierParam) {
    let tier = parseInt(tierParam, 10);
    if (!TIER_MAP.has(tier)) tier = 1;
    const meta = TIER_MAP.get(tier);
    const pool = CHALLENGES.filter((c) => c.tier === tier);
    const state = save.challenges[tier];
    const seen = Array.isArray(state.seen) ? state.seen : [];
    const completeCount = pool.filter((c) => seen.includes(c.id)).length;

    return `
      <div class="view-enter page">
        <div class="container">
          <div class="page-head">
            <div>
              <span class="kicker">THE BLANK EXAMINATION · 40 TEXTS</span>
              <h1>挑战模式<br><em>无墨之试。</em></h1>
              <p class="page-lede">没有前文，没有提示，只有一段突然出现的文字。选定星数后，从该难度的八篇文本中随机抽取一篇。每次抽题都可能是新的，也可能是你曾经写坏过的旧句子。</p>
            </div>
            <div class="page-side">
              <span>已遇篇目</span>
              <strong>${clearedChallenges()} / 40</strong>
              <small>最佳评级 · ${bestChallengeGrade()}</small>
            </div>
          </div>

          <div class="tier-tabs" role="tablist" aria-label="挑战难度">
            ${TIERS.map((t) => `
              <a class="tier-tab ${t.tier === tier ? 'is-active' : ''}" href="#/challenge/${t.tier}" role="tab" aria-selected="${t.tier === tier}">
                <span class="tier-stars">${'★'.repeat(t.tier)}</span>
                <strong>${escapeHTML(t.name)}</strong>
                <small>${t.tier} / 5 · 8 篇</small>
              </a>
            `).join('')}
          </div>

          <div class="challenge-layout">
            <section class="draw-panel" data-tier="${['', '壹', '贰', '叁', '肆', '伍'][tier]}">
              <div class="draw-top">
                <span class="kicker">DIFFICULTY ${String(tier).padStart(2, '0')} / 05</span>
                <div class="tier-name">
                  <h2>${escapeHTML(meta.name)}</h2>
                  <span>${escapeHTML(meta.en)}</span>
                </div>
                <div class="tier-stars-lg">${'★'.repeat(tier)}<span style="color:var(--faint);font-size:10px;letter-spacing:.12em;margin-left:12px">${8 - completeCount} 篇未遇</span></div>
                <p class="tier-desc">${escapeHTML(meta.desc)}</p>

                <div class="draw-actions">
                  <button class="btn btn-primary draw-btn" type="button" data-action="draw-challenge" data-tier="${tier}">
                    <span>随机抽取一篇</span><span class="arrow">↗</span>
                  </button>
                  <p class="draw-hint">从本阶 ${pool.length} 篇中随机<br>同难度内抽取，不重复上一题</p>
                </div>

                <div class="tier-record">
                  <div><strong>${state.bestCpm || '—'}</strong><span>本阶最佳字速</span></div>
                  <div><strong>${state.bestAccuracy ? `${state.bestAccuracy}%` : '—'}</strong><span>本阶最佳准确</span></div>
                  <div><strong>${state.bestGrade || '—'}</strong><span>本阶最佳评级</span></div>
                  <div><strong>${completeCount}/8</strong><span>已遇篇目</span></div>
                </div>
              </div>
            </section>

            <aside class="pool-panel">
              <div class="pool-head">
                <h3>本阶题库</h3>
                <span>${completeCount} / 8 SEEN</span>
              </div>
              <div class="pool-list">
                ${pool.map((challenge, index) => {
                  const done = seen.includes(challenge.id);
                  return `
                    <div class="pool-item ${done ? 'is-done' : ''}">
                      <span class="pool-index">${String(index + 1).padStart(2, '0')}</span>
                      <span class="pool-title">${escapeHTML(challenge.title)}</span>
                      <span class="pool-tag">${escapeHTML(challenge.tag)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
              <div class="pool-foot">题库标题可见，正文需抽取后阅读。完成一次即记为「已遇」。</div>
            </aside>
          </div>

          <div class="challenge-note">星级只代表文本长度、生僻字和标点密度，不代表你必须达到某个速度。挑战的终点不是 S，而是你愿意把一句话完整地读完、写对。</div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------
     Dialog
     ------------------------------------------------------------ */

  function openDialog(html, options) {
    const opts = options || {};
    dialogContent.innerHTML = html;
    dialog.classList.toggle('is-wide', Boolean(opts.wide));
    dialog.dataset.locked = opts.locked ? '1' : '0';
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open');
    syncBodyLock();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    syncBodyLock();
  }

  function closeButtonHTML() {
    return '<button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button>';
  }

  function openLevelBrief(levelId) {
    const item = LEVEL_MAP.get(levelId);
    if (!item) return;
    const { level, chapter, index } = item;
    if (!levelUnlocked(chapter, index)) {
      toast('这一页还没有显形。先补完前面的刻印。');
      return;
    }
    const record = save.levels[level.id];
    const count = Array.from(level.text).length;

    openDialog(`
      <div class="dialog-card">
        ${closeButtonHTML()}
        <div class="dialog-kicker">第${chapter.numeral}卷 · 刻印 ${String(index + 1).padStart(2, '0')} / 03</div>
        <h2>${escapeHTML(level.title)}<span class="sub">${escapeHTML(level.role)} · ${escapeHTML(chapter.title)}</span></h2>
        <p class="dialog-text">${escapeHTML(level.intro)}</p>
        <div class="dialog-preview">
          <div class="preview-label"><span>即将刻印</span><span>${count} 字</span></div>
          <p>${escapeHTML(level.text)}</p>
        </div>
        <div class="dialog-meta">
          <span>字数 <b>${count}</b></span>
          <span>历史最佳 <b>${record ? `${record.cpm} 字/分 · ${record.accuracy}%` : '尚未落笔'}</b></span>
          <span>标点 <b>可用半角</b></span>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" type="button" data-action="start-story" data-level="${level.id}" autofocus>开始刻印 <span class="arrow">→</span></button>
          <button class="btn btn-ghost" type="button" data-action="close-dialog">稍后再来</button>
        </div>
        <p class="dialog-note">计时从第一次落笔或开始组字时启动。输入法组字期间不判定，上屏后再比较。三星条件：准确率 ≥ 97% 且字速 ≥ 60 字/分；二星：准确率 ≥ 93% 且字速 ≥ 40 字/分。</p>
      </div>
    `);
  }

  function openSideBrief(sideId) {
    const side = SIDE_MAP.get(sideId);
    if (!side) return;
    if (!sideUnlocked(side)) {
      toast(`完成第${side.chapter}章后解锁。`);
      return;
    }
    const record = save.sides[side.id];
    const count = Array.from(side.level.text).length;
    openDialog(`
      <div class="dialog-card">
        ${closeButtonHTML()}
        <div class="dialog-kicker">支线档案 ${side.no} · ${escapeHTML(side.tag)}</div>
        <h2>${escapeHTML(side.level.title)}<span class="sub">${escapeHTML(side.title)} · ${escapeHTML(side.npc)}</span></h2>
        <p class="dialog-text">${escapeHTML(side.level.intro || side.intro[0])}</p>
        <div class="dialog-preview">
          <div class="preview-label"><span>档案原文</span><span>${count} 字</span></div>
          <p>${escapeHTML(side.level.text)}</p>
        </div>
        <div class="dialog-meta">
          <span>人物 <b>${escapeHTML(side.npc)}</b></span>
          <span>历史最佳 <b>${record ? `${record.cpm} 字/分 · ${record.accuracy}%` : '尚未落笔'}</b></span>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" type="button" data-action="start-side" data-side="${side.id}" autofocus>开始刻印 <span class="arrow">→</span></button>
          <button class="btn btn-ghost" type="button" data-action="close-dialog">稍后再来</button>
        </div>
      </div>
    `);
  }

  function openChallengeBrief(challenge) {
    const tierMeta = TIER_MAP.get(challenge.tier);
    const count = Array.from(challenge.text).length;
    openDialog(`
      <div class="dialog-card">
        ${closeButtonHTML()}
        <div class="dialog-kicker">挑战模式 · ${'★'.repeat(challenge.tier)} · 同难度随机</div>
        <h2>${escapeHTML(challenge.title)}<span class="sub">${escapeHTML(challenge.tag)} · ${escapeHTML(tierMeta.name)}</span></h2>
        <p class="dialog-text">你抽到了这一篇。它没有上下文，也不会解释自己。读完，然后一字不差地写下来。</p>
        <div class="dialog-preview">
          <div class="preview-label"><span>本次题签</span><span>${count} 字</span></div>
          <p>${escapeHTML(challenge.text)}</p>
        </div>
        <div class="dialog-meta">
          <span>难度 <b>${'★'.repeat(challenge.tier)}</b></span>
          <span>篇幅 <b>${count} 字</b></span>
          <span>题库 <b>${CHALLENGES.filter((c) => c.tier === challenge.tier).length} 篇</b></span>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" type="button" data-action="start-challenge" data-id="${challenge.id}" autofocus>开始刻印 <span class="arrow">→</span></button>
          <button class="btn btn-ghost" type="button" data-action="reroll-challenge" data-tier="${challenge.tier}">换一题</button>
        </div>
        <p class="dialog-note">换题不会消耗任何东西。计时仍然从你第一次落笔开始。S 级要求准确率 ≥ 98%，并达到本阶速度线；难度越高，速度线越高。</p>
      </div>
    `);
  }

  function openConfirm() {
    openDialog(`
      <div class="dialog-card confirm-card">
        <div class="dialog-kicker" style="justify-content:center">LEAVE THE DESK</div>
        <h2>要放下这支笔吗？</h2>
        <p>本次刻印的进度不会保存。已经写下的字会留在空白里，等你下次重新落笔。</p>
        <div class="dialog-actions">
          <button class="btn btn-primary" type="button" data-action="confirm-exit">退出刻印</button>
          <button class="btn btn-ghost" type="button" data-action="cancel-exit">继续写</button>
        </div>
      </div>
    `, { locked: true });
  }

  /* ------------------------------------------------------------
     Typing engine
     ------------------------------------------------------------ */

  const PUNCT_MAP = {
    '，': ',', '。': '.', '！': '!', '？': '?', '：': ':', '；': ';', '、': ',',
    '（': '(', '）': ')', '“': '"', '”': '"', '‘': "'", '’': "'",
    '—': '-', '–': '-', '…': '.', '·': '.', '《': '<', '》': '>',
    '「': '"', '」': '"', '『': '"', '』': '"'
  };

  function charsEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return PUNCT_MAP[a] === b || PUNCT_MAP[b] === a;
  }

  function commonPrefixLength(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    return i;
  }

  function calcStars(cpm, accuracy) {
    if (accuracy >= 97 && cpm >= 60) return 3;
    if (accuracy >= 93 && cpm >= 40) return 2;
    return 1;
  }

  function calcGrade(cpm, accuracy, tier) {
    if (accuracy >= 98 && cpm >= 60 + tier * 8) return 'S';
    if (accuracy >= 95 && cpm >= 42 + tier * 5) return 'A';
    if (accuracy >= 88 && cpm >= 28 + tier * 3) return 'B';
    return 'C';
  }

  function buildTarget(text) {
    targetText.innerHTML = '';
    const fragment = document.createDocumentFragment();
    Array.from(text).forEach((ch) => {
      const span = document.createElement('span');
      span.className = `char${ch === ' ' ? ' space' : ''}`;
      span.textContent = ch;
      fragment.appendChild(span);
    });
    targetText.appendChild(fragment);
  }

  function startRun(context) {
    if (!context) return;
    closeDialog();
    clearInterval(typing && typing.timer);

    const text = context.kind === 'story'
      ? context.level.text
      : context.kind === 'side'
        ? context.side.level.text
        : context.challenge.text;

    let title = '';
    let kicker = '';
    let sub = '';
    if (context.kind === 'story') {
      title = context.level.title;
      kicker = `第${context.chapter.numeral}卷 · 刻印 ${context.index + 1} / 3`;
      sub = `${context.chapter.title} · ${context.level.role}`;
    } else if (context.kind === 'side') {
      title = context.side.level.title;
      kicker = `支线档案 ${context.side.no} · ${context.side.tag}`;
      sub = `${context.side.title} · ${context.side.npc}`;
    } else {
      title = context.challenge.title;
      kicker = `挑战模式 · ${'★'.repeat(context.challenge.tier)} · 同难度随机`;
      sub = `${TIER_MAP.get(context.challenge.tier).name} · ${context.challenge.tag}`;
    }

    typing = {
      context,
      target: text,
      targetChars: Array.from(text),
      input: '',
      inputChars: [],
      mistakes: 0,
      started: false,
      finished: false,
      completing: false,
      paused: false,
      composing: false,
      startTime: 0,
      endTime: 0,
      finalMs: 0,
      pausedAt: 0,
      pausedTotal: 0,
      timer: null,
      trimmed: false
    };

    $('#typingKicker').textContent = kicker;
    $('#typingTitle').textContent = title;
    $('#typingContext').textContent = sub;
    $('#typingCharCount').textContent = `${typing.targetChars.length} 字`;
    $('#composeState').textContent = '输入法组字时会暂时不判定，上屏后继续';
    $('#typingMistakeLabel').textContent = '笔误 0';
    $('#typingPause').textContent = '暂停';
    $('#inputZone').classList.remove('has-errors', 'is-composing');

    typingInput.value = '';
    typingInput.disabled = false;
    typingInput.placeholder = '从第一个字开始……';
    targetText.classList.remove('is-paused', 'is-complete');
    pauseVeil.hidden = true;
    buildTarget(text);
    updateTypingUI();

    typingScreen.hidden = false;
    syncBodyLock();
    document.documentElement.scrollTop = 0;
    scrollPageTo(0);

    setTimeout(() => {
      if (typing && !typing.finished) {
        typingInput.focus({ preventScroll: true });
      }
    }, 160);
  }

  function ensureStarted() {
    if (!typing || typing.started || typing.finished) return;
    typing.started = true;
    typing.startTime = performance.now();
    startTicker();
  }

  function startTicker() {
    if (!typing) return;
    clearInterval(typing.timer);
    typing.timer = setInterval(() => {
      if (!typing || typing.paused || typing.finished) return;
      updateTypingUI();
    }, 100);
  }

  function elapsedMs() {
    if (!typing || !typing.started) return 0;
    const end = typing.finished ? typing.endTime : typing.paused ? typing.pausedAt : performance.now();
    return Math.max(0, end - typing.startTime - typing.pausedTotal);
  }

  function updateTypingUI() {
    if (!typing) return;
    const target = typing.targetChars;
    const input = typing.inputChars;
    const spans = targetText.children;
    let correct = 0;
    let prefix = 0;
    let prefixOpen = true;
    let wrong = 0;

    for (let i = 0; i < target.length; i += 1) {
      const span = spans[i];
      if (!span) continue;
      const typed = i < input.length;
      const ok = typed && charsEqual(input[i], target[i]);
      if (ok) correct += 1;
      if (prefixOpen) {
        if (ok) prefix += 1;
        else prefixOpen = false;
      }
      if (typed && !ok) wrong += 1;
      let cls = `char${target[i] === ' ' ? ' space' : ''}`;
      if (ok) cls += ' is-done';
      else if (typed) cls += ' is-wrong';
      if (i === input.length && input.length < target.length) cls += ' is-current';
      span.className = cls;
    }

    const elapsed = elapsedMs();
    const progress = target.length ? Math.round((prefix / target.length) * 100) : 0;
    const liveCpm = elapsed > 0 ? Math.round(correct / (Math.max(elapsed, 800) / 60000)) : 0;
    const liveAccuracy = input.length ? Math.round((correct / input.length) * 100) : 100;

    $('#liveCpm').textContent = String(liveCpm);
    $('#liveAccuracy').textContent = String(liveAccuracy);
    $('#liveProgress').textContent = String(progress);
    $('#liveTime').textContent = (elapsed / 1000).toFixed(1);
    $('#typingProgressBar').style.width = `${progress}%`;
    $('#typingMistakeLabel').textContent = `笔误 ${typing.mistakes}`;
    $('#inputZone').classList.toggle('has-errors', wrong > 0);
    typing.displayProgress = progress;
  }

  function processInput() {
    if (!typing || typing.finished || typing.paused || typing.composing) return;
    let raw = typingInput.value.replace(/[\r\n]/g, '');
    let chars = Array.from(raw);
    const limit = typing.targetChars.length;

    if (chars.length > limit) {
      chars = chars.slice(0, limit);
      raw = chars.join('');
      typingInput.value = raw;
      if (!typing.trimmed) {
        typing.trimmed = true;
        toast('这一页已经写满。若最后一个字不对，请退格修改。');
      }
    }

    if (!typing.started && chars.length > 0) ensureStarted();

    const previous = typing.inputChars;
    if (chars.length > previous.length) {
      const at = commonPrefixLength(chars, previous);
      const added = chars.length - previous.length;
      let wrongAdded = false;
      for (let i = 0; i < added; i += 1) {
        const index = at + i;
        if (!charsEqual(chars[index], typing.targetChars[index])) {
          typing.mistakes += 1;
          wrongAdded = true;
        }
      }
      playTick(!wrongAdded);
    }

    typing.input = raw;
    typing.inputChars = chars;
    updateTypingUI();

    if (chars.length === limit && chars.every((ch, i) => charsEqual(ch, typing.targetChars[i]))) {
      finishRun();
    }
  }

  function finishRun() {
    if (!typing || typing.finished) return;
    typing.finished = true;
    typing.endTime = performance.now();
    typing.finalMs = Math.max(0, typing.endTime - typing.startTime - typing.pausedTotal);
    clearInterval(typing.timer);
    typing.timer = null;
    typingInput.disabled = true;
    typingInput.blur();
    targetText.classList.add('is-complete');
    updateTypingUI();
    playCompleteTone();
    setTimeout(() => {
      completeRun();
    }, 360);
  }

  function pauseRun() {
    if (!typing || typing.finished || typing.paused) return;
    typing.paused = true;
    typing.pausedAt = performance.now();
    clearInterval(typing.timer);
    typing.timer = null;
    typingInput.disabled = true;
    targetText.classList.add('is-paused');
    pauseVeil.hidden = false;
    $('#typingPause').textContent = '继续';
    syncBodyLock();
  }

  function resumeRun() {
    if (!typing || !typing.paused) return;
    const now = performance.now();
    if (typing.started) typing.pausedTotal += Math.max(0, now - typing.pausedAt);
    typing.pausedAt = 0;
    typing.paused = false;
    typingInput.disabled = false;
    targetText.classList.remove('is-paused');
    pauseVeil.hidden = true;
    $('#typingPause').textContent = '暂停';
    if (typing.started) startTicker();
    updateTypingUI();
    typingInput.focus({ preventScroll: true });
    syncBodyLock();
  }

  function exitTyping() {
    if (typing && typing.timer) clearInterval(typing.timer);
    typing = null;
    typingScreen.hidden = true;
    pauseVeil.hidden = true;
    typingInput.disabled = false;
    typingInput.value = '';
    typingInput.blur();
    targetText.innerHTML = '';
    targetText.classList.remove('is-paused', 'is-complete');
    $('#typingPause').textContent = '暂停';
    syncBodyLock();
  }

  function requestExit() {
    if (!typing || typing.finished) return;
    if (!typing.paused) pauseRun();
    pauseVeil.hidden = true;
    openConfirm();
  }

  function finishTypingToResult(result) {
    lastResult = result;
    const isChallenge = result.kind === 'challenge';
    const seal = isChallenge
      ? result.grade
      : result.kind === 'story'
        ? result.chapter.seal
        : '笺';
    const gradeLabel = isChallenge ? 'GRADE' : result.kind === 'story' ? 'SEAL' : 'ARCHIVE';
    const primary = result.kind === 'story'
      ? result.chapterJustDone
        ? `<button class="btn btn-primary" type="button" data-action="chapter-outro">阅读卷末 <span class="arrow">→</span></button>`
        : `<button class="btn btn-primary" type="button" data-action="back-chapter">收笔 · 返回卷宗 <span class="arrow">→</span></button>`
      : result.kind === 'side'
        ? `<button class="btn btn-primary" type="button" data-action="back-side">收笔 · 查看档案 <span class="arrow">→</span></button>`
        : `<button class="btn btn-primary" type="button" data-action="again-challenge">再抽一题 <span class="arrow">↗</span></button>`;

    const secondary = result.kind === 'challenge'
      ? `<button class="btn btn-ghost" type="button" data-action="back-challenge">返回挑战</button>`
      : `<button class="btn btn-ghost" type="button" data-action="retry-run">再刻一次</button>`;

    const unlockLines = result.unlockedSides && result.unlockedSides.length
      ? `<p class="dialog-note">新档案解锁：${result.unlockedSides.map((side) => `<b style="color:var(--gold-bright);font-weight:400">${escapeHTML(side.title)}</b>`).join('、')}。可在支线档案中读取。</p>`
      : '';

    openDialog(`
      <div class="dialog-card result-card">
        <span class="focus-anchor" tabindex="-1" autofocus></span>
        <div class="result-head">
          <div>
            <div class="result-kicker">${isChallenge ? 'CHALLENGE COMPLETE' : result.kind === 'story' ? 'IMPRINT COMPLETE' : 'ARCHIVE COLLECTED'}${result.newBest ? ' · NEW BEST' : ''}</div>
            <h2 class="result-title">${escapeHTML(result.title)}</h2>
            <p class="result-sub">${escapeHTML(result.sub)}</p>
            ${isChallenge
              ? `<p class="result-sub" style="color:var(--gold)">${'★'.repeat(result.tier)} · ${escapeHTML(result.tierName)}</p>`
              : `<div class="result-stars">${[1, 2, 3].map((i) => `<span class="result-star ${i <= result.stars ? 'is-on' : ''}">★</span>`).join('')}</div>`}
          </div>
          <div class="result-grade">${escapeHTML(seal)}<small>${gradeLabel}</small></div>
        </div>

        <div class="result-stats">
          <div class="result-stat"><span>字速</span><strong>${result.cpm}<small> 字/分</small></strong></div>
          <div class="result-stat"><span>准确率</span><strong>${result.accuracy}<small> %</small></strong></div>
          <div class="result-stat"><span>用时</span><strong>${formatClock(result.seconds)}<small> ${result.seconds >= 60 ? '分:秒' : '秒'}</small></strong></div>
          <div class="result-stat"><span>笔误</span><strong>${result.mistakes}<small> 次</small></strong></div>
        </div>

        ${result.after ? `<div class="result-after"><span>刻印余波</span><p>${escapeHTML(result.after)}</p></div>` : ''}
        ${result.gain ? `<div class="result-gain">墨尘 +${result.gain}${result.firstClear ? ' · 首次归卷' : result.newBest ? ' · 刷新最佳' : ''}</div>` : ''}
        ${unlockLines}
        ${result.chapterJustDone ? '<p class="dialog-note">本卷已完卷。字印已收入卷宗。</p>' : ''}
        ${result.allStoryDone ? '<p class="dialog-note" style="color:var(--gold-bright)">十二卷已尽。城门外，最后一张白纸正在等你。</p>' : ''}

        <div class="dialog-actions">
          ${primary}
          ${secondary}
        </div>
      </div>
    `, { wide: true, locked: true });
  }

  /* ------------------------------------------------------------
     Completion / records
     ------------------------------------------------------------ */

  function completeRun() {
    if (!typing || !typing.context) return;
    const context = typing.context;
    const length = typing.targetChars.length;
    const seconds = Math.max(0.4, typing.finalMs / 1000);
    const cpm = Math.max(1, Math.round(length / (seconds / 60)));
    const accuracy = Math.max(0, Math.min(100, Math.round((length / (length + typing.mistakes)) * 100)));
    const mistakes = typing.mistakes;
    const stars = calcStars(cpm, accuracy);
    let gain = 0;
    let result = null;

    if (context.kind === 'story') {
      const { chapter, level, index } = context;
      const previous = save.levels[level.id] || null;
      const firstClear = !previous;
      const newBest = !previous || cpm > previous.cpm || (cpm === previous.cpm && accuracy > previous.accuracy);
      const chapterWasDone = chapterDone(chapter);

      save.levels[level.id] = {
        stars: Math.max(previous ? previous.stars : 0, stars),
        cpm: Math.max(previous ? previous.cpm : 0, cpm),
        accuracy: Math.max(previous ? previous.accuracy : 0, accuracy),
        bestSeconds: previous && previous.bestSeconds ? Math.min(previous.bestSeconds, seconds) : seconds,
        plays: (previous && previous.plays ? previous.plays : 0) + 1,
        at: Date.now()
      };

      const chapterNowDone = chapterDone(chapter);
      const chapterJustDone = chapterNowDone && !chapterWasDone;
      if (chapterNowDone) {
        save.chapters[chapter.id] = Object.assign({}, save.chapters[chapter.id] || {}, { at: Date.now() });
      }
      if (chapterJustDone) gain += 120 + (chapter.index === 12 ? 180 : 0);
      if (firstClear) gain += 30 + chapter.index * 2;
      const allDone = allChaptersDone();
      if (allDone && !save.storyCompleteAt) save.storyCompleteAt = Date.now();

      const unlockedSides = chapterJustDone ? SIDES.filter((side) => side.chapter === chapter.index) : [];
      result = {
        kind: 'story',
        title: level.title,
        sub: `第${chapter.numeral}卷 · ${chapter.title} · 刻印 ${index + 1} / 3`,
        chapter,
        level,
        cpm,
        accuracy,
        seconds,
        mistakes,
        stars,
        firstClear,
        newBest,
        chapterJustDone,
        allStoryDone: allDone,
        unlockedSides,
        after: level.after,
        gain
      };
    } else if (context.kind === 'side') {
      const side = context.side;
      const previous = save.sides[side.id] || null;
      const firstClear = !previous;
      const newBest = !previous || cpm > previous.cpm || (cpm === previous.cpm && accuracy > previous.accuracy);
      save.sides[side.id] = {
        stars: Math.max(previous ? previous.stars : 0, stars),
        cpm: Math.max(previous ? previous.cpm : 0, cpm),
        accuracy: Math.max(previous ? previous.accuracy : 0, accuracy),
        bestSeconds: previous && previous.bestSeconds ? Math.min(previous.bestSeconds, seconds) : seconds,
        plays: (previous && previous.plays ? previous.plays : 0) + 1,
        at: Date.now()
      };
      if (firstClear) gain += 45;
      result = {
        kind: 'side',
        title: side.level.title,
        sub: `支线档案 ${side.no} · ${side.title} · ${side.npc}`,
        side,
        cpm,
        accuracy,
        seconds,
        mistakes,
        stars,
        firstClear,
        newBest,
        after: side.level.after,
        gain
      };
    } else {
      const challenge = context.challenge;
      const tier = challenge.tier;
      const state = save.challenges[tier];
      const firstClear = !state.seen.includes(challenge.id);
      const previousBest = state.bestCpm || 0;
      const newBest = cpm > previousBest || (cpm === previousBest && accuracy > (state.bestAccuracy || 0));
      const grade = calcGrade(cpm, accuracy, tier);
      if (firstClear) state.seen.push(challenge.id);
      state.runs = (state.runs || 0) + 1;
      state.bestCpm = Math.max(state.bestCpm || 0, cpm);
      state.bestAccuracy = Math.max(state.bestAccuracy || 0, accuracy);
      if (gradeScore(grade) > gradeScore(state.bestGrade)) state.bestGrade = grade;
      if (!state.bestSeconds || seconds < state.bestSeconds) state.bestSeconds = seconds;
      if (firstClear) gain += 12 + tier * 6;
      else gain += 2;
      result = {
        kind: 'challenge',
        title: challenge.title,
        sub: `${TIER_MAP.get(tier).name} · ${challenge.tag}`,
        challenge,
        tier,
        tierName: TIER_MAP.get(tier).name,
        grade,
        cpm,
        accuracy,
        seconds,
        mistakes,
        firstClear,
        newBest,
        gain
      };
    }

    result.context = context;
    save.stats.correct += length;
    save.stats.seconds += seconds;
    save.stats.mistakes += mistakes;
    save.stats.runs += 1;
    if (gain) save.ink += gain;

    persist();
    updateHeader();

    setTimeout(() => {
      finishTypingToResult(result);
    }, 80);
  }

  /* ------------------------------------------------------------
     Chapter outro / finale
     ------------------------------------------------------------ */

  function openChapterOutro(chapter) {
    if (!chapter || !chapterDone(chapter)) return;
    const nextChapter = CHAPTERS[chapter.index];
    const final = !nextChapter;
    openDialog(`
      <div class="dialog-card outro-dialog">
        ${closeButtonHTML()}
        <div class="dialog-kicker">第${chapter.numeral}卷 · 卷末 · SEAL ${chapter.seal}</div>
        <h2>${escapeHTML(chapter.title)}<span class="sub">本卷已完 · 字印已收入卷宗</span></h2>
        <div class="story-prose">${paragraphsHTML(chapter.outro)}</div>
        <div class="dialog-actions">
          ${final
            ? `<button class="btn btn-primary" type="button" data-action="open-finale">写下最后一页 <span class="arrow">→</span></button>`
            : `<button class="btn btn-primary" type="button" data-action="next-chapter" data-chapter="${nextChapter.id}">启封第${nextChapter.numeral}卷 <span class="arrow">→</span></button>`}
          <button class="btn btn-ghost" type="button" data-action="back-chapter">回到卷宗</button>
        </div>
        ${final ? '<p class="dialog-note">十二卷已完。最后一个字，不在书里。</p>' : ''}
      </div>
    `, { wide: true });
  }

  function renderFinale() {
    if (!allChaptersDone()) return;
    const completed = Boolean(save.legacyWord);
    const seals = CHAPTERS.map((chapter, index) => `<span class="finale-seal" style="--i:${index}">${chapter.seal}</span>`).join('');
    const statHTML = `
      <div class="finale-stats">
        <div><strong>${clearedStoryLevels()} / 36</strong><span>主线刻印</span></div>
        <div><strong>${clearedSides()} / 20</strong><span>支线归卷</span></div>
        <div><strong>${clearedChallenges()} / 40</strong><span>挑战篇目</span></div>
        <div><strong>${formatNumber(save.stats.correct)}</strong><span>累计刻字</span></div>
      </div>
    `;

    if (completed) {
      finaleContent.innerHTML = `
        <div class="finale-kicker">THE LAST PAGE · 终页已写</div>
        <h1 class="finale-title">世界记得<br><em>${escapeHTML(save.legacyWord)}</em></h1>
        <div class="finale-seals">${seals}</div>
        <p class="finale-line">${SEAL_SENTENCE}</p>
        <div class="finale-rule"></div>
        <p class="finale-copy">空白退成了页边。拾遗城重新有了名字，而最后一页上，从此多了一个只属于你的字。它不会被上传，不会被排名，只留在这台机器和这段故事里。</p>
        <p class="finale-done-word">${escapeHTML(save.legacyWord)}</p>
        ${statHTML}
        <div class="finale-actions">
          <button class="btn btn-primary" type="button" data-action="finale-home">回到卷首 <span class="arrow">→</span></button>
          <button class="btn btn-ghost" type="button" data-action="finale-story">回看十二卷</button>
        </div>
      `;
      return;
    }

    finaleContent.innerHTML = `
      <div class="finale-kicker">THE LAST PAGE · 终页</div>
      <h1 class="finale-title">十二卷已尽，<br><em>最后一页留给你。</em></h1>
      <div class="finale-seals">${seals}</div>
      <p class="finale-line">${SEAL_SENTENCE}</p>
      <div class="finale-rule"></div>
      <p class="finale-copy">空白没有再扩大。它退到纸的边缘，变成一圈安静的页边距。沈砚把笔放在最后一页上，退后一步，把位置让给了正在读这个故事的人。</p>
      <form class="word-form" id="finaleForm">
        <label for="legacyWord">在最后一页，留下一个你愿意被记住的字。</label>
        <input class="word-input" id="legacyWord" name="legacyWord" type="text" maxlength="4" autocomplete="off" spellcheck="false" placeholder="记得" aria-label="你的终字，最多四个字">
        <button class="btn btn-primary" type="submit">写入终页 <span class="arrow">→</span></button>
        <small>一个字或几个字，只保存在你的浏览器里。写下后仍可回看，但不会再次修改。</small>
      </form>
      <button class="finale-skip" type="button" data-action="close-finale">先不写，回头再来</button>
    `;
  }

  function openFinale() {
    if (!allChaptersDone()) {
      toast('十二卷尚未完卷，最后一页还没有显形。');
      return;
    }
    closeDialog();
    exitTyping();
    finaleScreen.hidden = false;
    syncBodyLock();
    renderFinale();
    finaleScreen.scrollTop = 0;
    setTimeout(() => {
      const input = $('#legacyWord');
      if (input) input.focus({ preventScroll: true });
    }, 260);
  }

  function closeFinale() {
    finaleScreen.hidden = true;
    syncBodyLock();
  }

  /* ------------------------------------------------------------
     Challenge drawing
     ------------------------------------------------------------ */

  function drawChallenge(tier, options) {
    const opts = options || {};
    const pool = CHALLENGES.filter((c) => c.tier === tier);
    if (!pool.length) return;
    let candidates = pool.filter((c) => c.id !== drawHistory[tier]);
    if (!candidates.length) candidates = pool;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    drawHistory[tier] = picked.id;
    if (opts.reroll) {
      openChallengeBrief(picked);
      return;
    }
    const button = document.querySelector(`[data-action="draw-challenge"][data-tier="${tier}"]`);
    if (button) {
      button.classList.add('is-drawing');
      button.innerHTML = '<span>正在抽取……</span><span class="arrow">✦</span>';
    }
    setTimeout(() => {
      if (button) {
        button.classList.remove('is-drawing');
        button.innerHTML = '<span>随机抽取一篇</span><span class="arrow">↗</span>';
      }
      openChallengeBrief(picked);
    }, 520);
  }

  /* ------------------------------------------------------------
     Sound
     ------------------------------------------------------------ */

  function ensureAudio() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        audioCtx = new AudioCtor();
      } catch (err) {
        return null;
      }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTone(freq, duration, volume, type) {
    if (!save.settings.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (err) {
      /* audio is optional */
    }
  }

  function playTick(correct) {
    if (!save.settings.sound) return;
    if (correct) playTone(520 + Math.random() * 80, 0.022, 0.006, 'sine');
    else playTone(150, 0.06, 0.018, 'triangle');
  }

  function playCompleteTone() {
    if (!save.settings.sound) return;
    playTone(392, 0.16, 0.018, 'sine');
    setTimeout(() => playTone(523.25, 0.2, 0.016, 'sine'), 110);
    setTimeout(() => playTone(659.25, 0.26, 0.013, 'sine'), 220);
  }

  /* ------------------------------------------------------------
     Toast
     ------------------------------------------------------------ */

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastRoot.appendChild(el);
    while (toastRoot.children.length > 3) {
      toastRoot.removeChild(toastRoot.firstElementChild);
    }
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 320);
    }, 2800);
  }

  /* ------------------------------------------------------------
     Router
     ------------------------------------------------------------ */

  function renderRoute(options) {
    const opts = options || {};
    const scrollY = window.scrollY;
    const route = parseHash();
    currentRoute = route;
    let html = '';
    let pageTitle = '墨蚀：拾字纪';
    let nav = 'home';

    if (route.name === 'home') {
      html = renderHome();
      pageTitle = '墨蚀：拾字纪 · 当世界开始失字';
      nav = 'home';
    } else if (route.name === 'story') {
      html = renderStory();
      pageTitle = '主线卷宗 · 墨蚀：拾字纪';
      nav = 'story';
    } else if (route.name === 'chapter') {
      html = renderChapter(route.param);
      const chapter = CHAPTER_MAP.get(route.param);
      pageTitle = chapter ? `第${chapter.numeral}卷 ${chapter.title} · 墨蚀` : '卷宗不存在 · 墨蚀';
      nav = 'story';
    } else if (route.name === 'side') {
      if (route.param) {
        html = renderSideDetail(route.param);
        const side = SIDE_MAP.get(route.param);
        pageTitle = side ? `${side.title} · 支线档案 · 墨蚀` : '档案不存在 · 墨蚀';
      } else {
        html = renderSide();
        pageTitle = '支线档案 · 墨蚀：拾字纪';
      }
      nav = 'side';
    } else if (route.name === 'challenge') {
      html = renderChallenge(route.param);
      pageTitle = '挑战模式 · 墨蚀：拾字纪';
      nav = 'challenge';
    } else {
      html = renderLockedState('这一页被空白吃掉了', '没有找到你想去的地方。回到卷首，重新翻开这本书。', '#/', '回到卷首');
      pageTitle = '页面不存在 · 墨蚀';
      nav = 'home';
    }

    app.innerHTML = html;
    document.title = pageTitle;
    setActiveNav(nav);
    updateHeader();
    if (opts.preserveScroll) {
      scrollPageTo(scrollY);
    } else {
      scrollPageTo(0);
    }
  }

  /* ------------------------------------------------------------
     Events
     ------------------------------------------------------------ */

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (!action) return;

    switch (action) {
      case 'close-dialog':
        closeDialog();
        break;

      case 'open-level':
        openLevelBrief(target.dataset.level);
        break;

      case 'start-story': {
        const item = LEVEL_MAP.get(target.dataset.level);
        if (!item || !levelUnlocked(item.chapter, item.index)) return;
        startRun({ kind: 'story', chapter: item.chapter, level: item.level, index: item.index });
        break;
      }

      case 'open-side':
        openSideBrief(target.dataset.side);
        break;

      case 'start-side': {
        const side = SIDE_MAP.get(target.dataset.side);
        if (!side || !sideUnlocked(side)) return;
        startRun({ kind: 'side', side });
        break;
      }

      case 'draw-challenge':
        drawChallenge(Number(target.dataset.tier) || 1);
        break;

      case 'start-challenge': {
        const challenge = CHALLENGE_MAP.get(target.dataset.id);
        if (!challenge) return;
        startRun({ kind: 'challenge', challenge });
        break;
      }

      case 'reroll-challenge': {
        const tier = Number(target.dataset.tier) || 1;
        drawChallenge(tier, { reroll: true });
        break;
      }

      case 'filter-sides':
        sideFilter = target.dataset.filter || 'all';
        renderRoute({ preserveScroll: true });
        break;

      case 'confirm-exit':
        closeDialog();
        exitTyping();
        break;

      case 'cancel-exit':
        closeDialog();
        if (typing && typing.paused) resumeRun();
        break;

      case 'retry-run':
        if (!lastResult || !lastResult.context) return;
        closeDialog();
        startRun(lastResult.context);
        break;

      case 'back-chapter':
        closeDialog();
        exitTyping();
        navigate(lastResult && lastResult.chapter ? `chapter/${lastResult.chapter.id}` : 'story');
        break;

      case 'chapter-outro':
        if (!lastResult || !lastResult.chapter) return;
        closeDialog();
        exitTyping();
        openChapterOutro(lastResult.chapter);
        break;

      case 'next-chapter':
        closeDialog();
        navigate(`chapter/${target.dataset.chapter}`);
        break;

      case 'back-side':
        closeDialog();
        exitTyping();
        navigate(lastResult && lastResult.side ? `side/${lastResult.side.id}` : 'side');
        break;

      case 'again-challenge':
        if (!lastResult || lastResult.kind !== 'challenge') return;
        closeDialog();
        exitTyping();
        drawChallenge(lastResult.tier);
        break;

      case 'back-challenge':
        closeDialog();
        exitTyping();
        navigate(lastResult && lastResult.tier ? `challenge/${lastResult.tier}` : 'challenge');
        break;

      case 'open-finale':
        openFinale();
        break;

      case 'close-finale':
        closeFinale();
        break;

      case 'finale-home':
        closeFinale();
        navigate('');
        break;

      case 'finale-story':
        closeFinale();
        navigate('story');
        break;

      case 'toggle-sound':
        save.settings.sound = !save.settings.sound;
        persist();
        updateHeader();
        if (save.settings.sound) {
          ensureAudio();
          playTone(660, 0.08, 0.02, 'sine');
          toast('笔触音已开启');
        } else {
          toast('笔触音已关闭');
        }
        break;

      default:
        break;
    }
  });

  dialog.addEventListener('close', () => {
    syncBodyLock();
  });

  dialog.addEventListener('cancel', (event) => {
    if (dialog.dataset.locked === '1') {
      event.preventDefault();
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && dialog.dataset.locked !== '1') {
      closeDialog();
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'finaleForm') return;
    event.preventDefault();
    const input = $('#legacyWord');
    if (!input) return;
    const word = Array.from(input.value.trim().replace(/\s+/g, '')).slice(0, 4).join('');
    if (!word) {
      toast('至少留下一个字，再写入终页。');
      input.focus();
      return;
    }
    if (save.legacyWord) return;
    save.legacyWord = word;
    save.completedAt = Date.now();
    save.ink += 300;
    persist();
    updateHeader();
    playCompleteTone();
    toast('终页已写。世界记得。');
    renderFinale();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (dialog.open) return;
    if (!finaleScreen.hidden) {
      if (save.legacyWord) closeFinale();
      return;
    }
    if (!typing || typing.finished) return;
    if (typing.paused) {
      if (!pauseVeil.hidden) resumeRun();
      return;
    }
    pauseRun();
  });

  $('#typingExit').addEventListener('click', requestExit);
  $('#typingPause').addEventListener('click', () => {
    if (!typing || typing.finished) return;
    if (typing.paused) {
      if (pauseVeil.hidden) requestExit();
      else resumeRun();
    } else {
      pauseRun();
    }
  });
  $('#pauseExit').addEventListener('click', requestExit);
  $('#resumeTyping').addEventListener('click', () => {
    resumeRun();
  });

  typingInput.addEventListener('compositionstart', () => {
    if (!typing || typing.finished || typing.paused) return;
    typing.composing = true;
    $('#inputZone').classList.add('is-composing');
    $('#composeState').textContent = '正在组字……上屏后判定';
    ensureStarted();
  });

  typingInput.addEventListener('compositionend', () => {
    if (!typing) return;
    typing.composing = false;
    $('#inputZone').classList.remove('is-composing');
    $('#composeState').textContent = '输入法组字时会暂时不判定，上屏后继续';
    setTimeout(processInput, 0);
  });

  typingInput.addEventListener('input', (event) => {
    if (!typing || typing.finished) return;
    if (typing.composing || event.isComposing) return;
    processInput();
  });

  typingInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  typingInput.addEventListener('paste', (event) => {
    event.preventDefault();
    toast('刻印不能粘贴。请一个字一个字地写下来。');
  });

  typingInput.addEventListener('drop', (event) => {
    event.preventDefault();
    toast('刻印不能拖放文字。请逐字落笔。');
  });

  targetText.addEventListener('click', () => {
    if (typing && !typing.finished && !typing.paused) {
      typingInput.focus({ preventScroll: true });
    }
  });

  window.addEventListener('hashchange', () => {
    if (dialog.open) closeDialog();
    if (!typingScreen.hidden) exitTyping();
    if (!finaleScreen.hidden) closeFinale();
    renderRoute();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!typing || typing.finished) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /* ------------------------------------------------------------
     Boot
     ------------------------------------------------------------ */

  function boot() {
    if (!DATA || !CHAPTERS || !SIDES || !CHALLENGES) {
      app.innerHTML = '<div class="empty-state"><div><h2>文本没有装订成功</h2><p>请刷新页面，或检查 js/data 文件是否完整。</p></div></div>';
      return;
    }
    updateHeader();
    renderRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
