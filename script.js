/**
 * ============================================================
 * HackLab — Interactive Cybersecurity Education Platform
 * script.js  |  Production Quality  |  Vanilla ES6+
 * ============================================================
 *
 * Sections:
 *  01. Constants & State
 *  02. Utility Functions
 *  03. Local Storage System
 *  04. Theme System
 *  05. Sidebar Navigation
 *  06. Mobile Menu System
 *  07. Smooth Scrolling
 *  08. Active Link Tracking (IntersectionObserver)
 *  09. Collapsible Sections
 *  10. Dashboard Logic & Animated Counters
 *  11. Study Tracking (Mark as Studied)
 *  12. Progress Tracker
 *  13. Search System
 *  14. Flashcard System
 *  15. Quiz System
 *  16. Back To Top Button
 *  17. Intersection Observer Animations
 *  18. Tooltip System
 *  19. Keyboard Accessibility
 *  20. Performance (debounce / throttle / rAF)
 *  21. Event Listeners (delegated)
 *  22. Initialization
 * ============================================================
 */

'use strict';

/* ============================================================
   01. CONSTANTS & STATE
   ============================================================ */

const STORAGE_KEYS = {
  THEME:       'hacklab_theme',
  STUDIED:     'hacklab_studied',
  QUIZ:        'hacklab_quiz',
  FLASHCARD:   'hacklab_flashcard',
  SIDEBAR:     'hacklab_sidebar',
  VISITED:     'hacklab_visited',
};

const TOTAL_WEEKS = 10;

/** Shared mutable state — single source of truth */
const State = {
  theme:          'dark',
  sidebarOpen:    false,        // mobile only
  sidebarVisible: true,         // desktop collapse
  isMobile:       false,
  studiedWeeks:   new Set(),    // Set<number>  e.g. {1,3,5}
  visitedWeeks:   new Set(),    // Set<number>
  activeWeek:     0,
  searchOpen:     false,
  quizState:      {},           // { weekN: { score, answers, finished } }
  flashcardState: {},           // { weekN: { index, flipped } }
  overlayEl:      null,
};


/* ============================================================
   02. UTILITY FUNCTIONS
   ============================================================ */

/** Safe querySelector — returns null without throwing */
const qs  = (sel, ctx = document) => ctx ? ctx.querySelector(sel)  : null;
const qsa = (sel, ctx = document) => ctx ? [...ctx.querySelectorAll(sel)] : [];

/** Debounce — delays fn until after `wait` ms of silence */
const debounce = (fn, wait = 200) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

/** Throttle — fires fn at most once per `limit` ms */
const throttle = (fn, limit = 100) => {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
};

/** Animate a numeric counter from 0 → target */
const animateCounter = (el, target, suffix = '', duration = 900) => {
  if (!el) return;
  const isFloat = String(target).includes('.');
  const start   = performance.now();
  const tick    = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    const current  = isFloat
      ? (target * ease).toFixed(1)
      : Math.round(target * ease);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Highlight matching text with <mark> tags (safe — no innerHTML injection) */
const highlight = (text, query) => {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return text.replace(re, '<mark class="search-highlight">$1</mark>');
};

/** Scroll element smoothly into view with header offset */
const scrollToEl = (el) => {
  if (!el) return;
  const headerH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '64', 10
  );
  const y = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
};

/** Create a DOM element with optional properties */
const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k === 'style')  Object.assign(el.style, v);
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else el[k] = v;
  });
  children.forEach(child => {
    if (child == null) return;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return el;
};


/* ============================================================
   03. LOCAL STORAGE SYSTEM
   ============================================================ */

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/** Persist & restore Set as array */
const loadSet  = (key)      => new Set(Storage.get(key, []));
const saveSet  = (key, set) => Storage.set(key, [...set]);


/* ============================================================
   04. THEME SYSTEM
   ============================================================ */

const Theme = {
  init() {
    const saved = Storage.get(STORAGE_KEYS.THEME, 'dark');
    this.apply(saved);
  },

  apply(theme) {
    State.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    // Also set on body for legacy selectors
    document.body.setAttribute('data-theme', theme);
    Storage.set(STORAGE_KEYS.THEME, theme);
    this.updateButton();
  },

  toggle() {
    this.apply(State.theme === 'dark' ? 'light' : 'dark');
  },

  updateButton() {
    const btn = qs('#theme-toggle');
    if (!btn) return;
    btn.innerHTML    = State.theme === 'dark' ? '&#9728;' : '&#9790;';
    btn.setAttribute('aria-label', `Switch to ${State.theme === 'dark' ? 'light' : 'dark'} theme`);
    btn.title        = State.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  },
};


/* ============================================================
   05. SIDEBAR NAVIGATION
   ============================================================ */

const Sidebar = {
  el:      null,
  toggle:  null,
  overlay: null,

  init() {
    this.el     = qs('#sidebar');
    this.toggle = qs('#sidebar-toggle');
    if (!this.el) return;

    // Restore desktop collapse state
    const savedVisible = Storage.get(STORAGE_KEYS.SIDEBAR, true);
    if (!State.isMobile) {
      State.sidebarVisible = savedVisible;
      if (!savedVisible) this.collapseDesktop();
    }

    // Create overlay for mobile
    this.overlay = createElement('div', {
      className: 'sidebar-overlay',
      style: {
        position:      'fixed',
        inset:         '0',
        background:    'rgba(0,0,0,0.45)',
        zIndex:        '490',
        opacity:       '0',
        pointerEvents: 'none',
        transition:    'opacity 250ms ease',
        /* REMOVED backdropFilter — it created a new stacking context
           that placed all children (including sidebar) inside it,
           making the sidebar appear "behind" the blur layer */
      },
      'aria-hidden': 'true',
    });
    document.body.appendChild(this.overlay);
    State.overlayEl = this.overlay;

    // Overlay click → close
    this.overlay.addEventListener('click', () => this.closeMobile());
  },

  openMobile() {
    if (!this.el) return;
    State.sidebarOpen = true;
    this.el.classList.add('sidebar--open');
    this.el.removeAttribute('aria-hidden');

    /* Use a body class instead of overflow:hidden — avoids iOS touch swallowing.
       The CSS rule body.sidebar-is-open disables pointer-events on background
       content rather than locking the scroll container, so sidebar taps work. */
    document.body.classList.add('sidebar-is-open');

    this.overlay.style.opacity = '1';
    this.overlay.style.pointerEvents = 'auto';

    if (this.toggle) {
      this.toggle.setAttribute('aria-expanded', 'true');
      this.toggle.innerHTML = '&#10005;';
    }
  },

  closeMobile() {
    if (!this.el) return;
    State.sidebarOpen = false;
    this.el.classList.remove('sidebar--open');
    this.el.setAttribute('aria-hidden', 'true');

    document.body.classList.remove('sidebar-is-open');

    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';

    if (this.toggle) {
      this.toggle.setAttribute('aria-expanded', 'false');
      this.toggle.innerHTML = '&#9776;';
    }
  },

  collapseDesktop() {
    if (!this.el) return;
    this.el.classList.add('sidebar--collapsed');
    const main = qs('.main-content');
    if (main) main.style.paddingLeft = '2.5rem';
    const footer = qs('.footer-inner');
    if (footer) footer.style.paddingLeft = '2rem';
    const footerBottom = qs('.footer-bottom');
    if (footerBottom) footerBottom.style.paddingLeft = '2rem';
  },

  expandDesktop() {
    if (!this.el) return;
    this.el.classList.remove('sidebar--collapsed');
    const main = qs('.main-content');
    if (main) main.style.paddingLeft = '';
    const footer = qs('.footer-inner');
    if (footer) footer.style.paddingLeft = '';
    const footerBottom = qs('.footer-bottom');
    if (footerBottom) footerBottom.style.paddingLeft = '';
  },

  handleToggle() {
    if (State.isMobile) {
      State.sidebarOpen ? this.closeMobile() : this.openMobile();
    } else {
      State.sidebarVisible = !State.sidebarVisible;
      Storage.set(STORAGE_KEYS.SIDEBAR, State.sidebarVisible);
      State.sidebarVisible ? this.expandDesktop() : this.collapseDesktop();
    }
  },

  handleResize() {
    const wasMobile = State.isMobile;
    State.isMobile = window.innerWidth <= 768;

    if (wasMobile && !State.isMobile) {
      // Transitioned to desktop — clean up mobile state
      this.closeMobile();
      document.body.classList.remove('sidebar-is-open');
      if (!State.sidebarVisible) this.collapseDesktop();
      else this.expandDesktop();
    }

    if (!wasMobile && State.isMobile) {
      // Transitioned to mobile
      this.expandDesktop();
    }
  },
};


/* ============================================================
   06. MOBILE MENU SYSTEM  (handled via Sidebar above)
   ============================================================ */
// Additional mobile-specific helpers

const MobileMenu = {
  /** Close sidebar when a nav link is clicked on mobile */
  onNavLinkClick() {
    if (State.isMobile && State.sidebarOpen) {
      Sidebar.closeMobile();
    }
  },
};


/* ============================================================
   07. SMOOTH SCROLLING
   ============================================================ */

const SmoothScroll = {
  init() {
    // Intercept all internal hash links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;

      const target = qs(hash);
      if (!target) return;

      e.preventDefault();
      scrollToEl(target);

      // Update URL without scroll jump
      history.pushState(null, '', hash);
    });
  },
};


/* ============================================================
   08. ACTIVE LINK TRACKING
   ============================================================ */

const ActiveLinks = {
  observer: null,
  navLinks: [],

  init() {
    this.navLinks = qsa('.nav-link[href^="#"]');
    const sections = qsa('[id]').filter(el =>
      el.id === 'dashboard' ||
      el.id.startsWith('week') ||
      el.id === 'reading-list' ||
      el.id === 'glossary'
    );

    if (!sections.length) return;

    const headerH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '64', 10
    );

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.setActive('#' + entry.target.id);
            // Mark section visited
            const week = entry.target.dataset.week;
            if (week) {
              const n = Number(week);
              if (n && !State.visitedWeeks.has(n)) {
                State.visitedWeeks.add(n);
                saveSet(STORAGE_KEYS.VISITED, State.visitedWeeks);
              }
            }
          }
        });
      },
      {
        rootMargin: `-${headerH + 20}px 0px -55% 0px`,
        threshold: 0,
      }
    );

    sections.forEach(sec => this.observer.observe(sec));
  },

  setActive(hash) {
    this.navLinks.forEach(link => {
      const isActive = link.getAttribute('href') === hash;
      link.classList.toggle('active', isActive);
      link.toggleAttribute('aria-current', isActive);
      if (isActive) {
        // Ensure active link is visible in the sidebar
        link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    // Also highlight quick-nav cards
    qsa('.quick-nav-card').forEach(card => {
      const href = card.getAttribute('href');
      card.classList.toggle('quick-nav-card--active', href === hash);
    });

    // Track active week
    const match = hash.match(/week(\d+)/);
    if (match) State.activeWeek = Number(match[1]);
  },
};


/* ============================================================
   09. COLLAPSIBLE SECTIONS
   ============================================================ */

const Collapsible = {
  /**
   * Make any section collapsible by injecting a toggle button
   * into its .subsection-title and wrapping content.
   */
  init() {
    // We'll make lecture-subsections collapsible via their title
    const subsections = qsa('.lecture-subsection');

    subsections.forEach(section => {
      const title = qs('.subsection-title', section);
      if (!title) return;

      // Don't collapse if very short
      const contentHeight = section.scrollHeight;
      if (contentHeight < 200) return;

      // Inject toggle button
      const btn = createElement('button', {
        className: 'collapse-toggle',
        type:      'button',
        'aria-label': 'Toggle section',
        style: {
          background:    'none',
          border:        'none',
          cursor:        'pointer',
          color:         'var(--text-muted)',
          fontSize:      '0.8rem',
          padding:       '0.2rem 0.4rem',
          marginLeft:    'auto',
          borderRadius:  'var(--radius-sm)',
          transition:    'all 150ms ease',
          flexShrink:    '0',
        },
      }, '▾');

      btn.addEventListener('mouseenter', () => btn.style.color = 'var(--accent)');
      btn.addEventListener('mouseleave', () => btn.style.color = 'var(--text-muted)');

      title.style.display    = 'flex';
      title.style.alignItems = 'center';
      title.appendChild(btn);

      // Wrap all content after the title
      const contentWrapper = createElement('div', {
        className: 'collapsible-content',
        style: {
          overflow:   'hidden',
          transition: 'max-height 400ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease',
          maxHeight:  '9999px',
          opacity:    '1',
        },
      });

      // Move all siblings after title into wrapper
      const children = [...section.children];
      children.forEach(child => {
        if (child !== title) contentWrapper.appendChild(child);
      });
      section.appendChild(contentWrapper);

      let collapsed = false;

      const toggle = () => {
        collapsed = !collapsed;
        if (collapsed) {
          contentWrapper.style.maxHeight = contentWrapper.scrollHeight + 'px';
          // Force reflow
          contentWrapper.offsetHeight; // eslint-disable-line
          contentWrapper.style.maxHeight = '0';
          contentWrapper.style.opacity   = '0';
          btn.innerHTML = '▸';
          btn.title     = 'Expand section';
          section.dataset.collapsed = 'true';
        } else {
          contentWrapper.style.maxHeight = contentWrapper.scrollHeight + 'px';
          contentWrapper.style.opacity   = '1';
          btn.innerHTML = '▾';
          btn.title     = 'Collapse section';
          delete section.dataset.collapsed;
          // Reset to auto after transition
          contentWrapper.addEventListener('transitionend', function handler() {
            if (!collapsed) contentWrapper.style.maxHeight = '9999px';
            contentWrapper.removeEventListener('transitionend', handler);
          });
        }
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });

      // Allow clicking the title text to toggle too
      title.style.cursor = 'pointer';
      title.addEventListener('click', (e) => {
        if (e.target === btn || btn.contains(e.target)) return;
        toggle();
      });
    });
  },
};


/* ============================================================
   10. DASHBOARD LOGIC & ANIMATED COUNTERS
   ============================================================ */

const Dashboard = {
  init() {
    this.runCounters();
    this.updateStats();
  },

  runCounters() {
    // Animate static counters on load
    const totalEl    = qs('#metric-total-lectures');
    const conceptsEl = qs('#metric-total-concepts');
    if (totalEl)    animateCounter(totalEl, 10, '', 800);
    if (conceptsEl) animateCounter(conceptsEl, 120, '+', 1000);
  },

  updateStats() {
    const completed  = State.studiedWeeks.size;
    const percentage = Math.round((completed / TOTAL_WEEKS) * 100);

    const completedEl = qs('#metric-completed');
    const labsEl      = qs('#metric-labs');

    if (completedEl) animateCounter(completedEl, completed, '', 600);
    if (labsEl)      animateCounter(labsEl, percentage, '%', 700);

    // Update quick-nav cards with completion indicator
    qsa('.quick-nav-card').forEach(card => {
      const week = Number(card.dataset.week);
      const isStudied = State.studiedWeeks.has(week);
      let badge = qs('.quick-nav-studied-badge', card);

      if (isStudied && !badge) {
        badge = createElement('span', {
          className: 'quick-nav-studied-badge',
          title:     'Marked as studied',
          style: {
            position:    'absolute',
            top:         '0.6rem',
            right:       '0.6rem',
            fontSize:    '0.9rem',
            lineHeight:  '1',
          },
        }, '✅');
        card.style.position = 'relative';
        card.appendChild(badge);
      } else if (!isStudied && badge) {
        badge.remove();
      }
    });
  },
};


/* ============================================================
   11. STUDY TRACKING — "Mark as Studied"
   ============================================================ */

const StudyTracker = {
  init() {
    // Load saved state
    State.studiedWeeks = loadSet(STORAGE_KEYS.STUDIED);
    State.visitedWeeks = loadSet(STORAGE_KEYS.VISITED);

    // Inject "Mark as Studied" button into each lecture header
    qsa('.lecture-section[data-week]').forEach(section => {
      const week   = Number(section.dataset.week);
      const header = qs('.lecture-header', section);
      if (!header || !week) return;

      const isStudied = State.studiedWeeks.has(week);

      const btn = createElement('button', {
        className:   `btn-studied btn-studied--${isStudied ? 'done' : 'pending'}`,
        type:        'button',
        'data-week': String(week),
        'data-action': 'mark-studied',
        style: {
          display:       'inline-flex',
          alignItems:    'center',
          gap:           '0.4rem',
          marginTop:     '1rem',
          padding:       '0.5rem 1.1rem',
          borderRadius:  'var(--radius-md)',
          fontSize:      '0.75rem',
          fontWeight:    '700',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          cursor:        'pointer',
          fontFamily:    '-apple-system, sans-serif',
          transition:    'all 150ms ease',
          border:        isStudied ? '1px solid var(--success)' : '1px solid var(--border)',
          background:    isStudied ? 'var(--success-soft)'      : 'var(--surface)',
          color:         isStudied ? 'var(--success)'           : 'var(--text-muted)',
          WebkitTapHighlightColor: 'transparent',
        },
      });
      btn.innerHTML = isStudied
        ? '✅ Studied'
        : '○ Mark as Studied';

      btn.addEventListener('click', () => this.toggle(week));
      header.appendChild(btn);
    });

    this.syncProgressBars();
  },

  toggle(week) {
    if (State.studiedWeeks.has(week)) {
      State.studiedWeeks.delete(week);
    } else {
      State.studiedWeeks.add(week);
    }
    saveSet(STORAGE_KEYS.STUDIED, State.studiedWeeks);
    this.updateButton(week);
    this.syncProgressBars();
    Dashboard.updateStats();
  },

  updateButton(week) {
    const btn = qs(`.btn-studied[data-week="${week}"]`);
    if (!btn) return;
    const isStudied = State.studiedWeeks.has(week);
    btn.innerHTML = isStudied ? '✅ Studied' : '○ Mark as Studied';
    Object.assign(btn.style, {
      border:     isStudied ? '1px solid var(--success)' : '1px solid var(--border)',
      background: isStudied ? 'var(--success-soft)'      : 'var(--surface)',
      color:      isStudied ? 'var(--success)'           : 'var(--text-muted)',
    });
  },

  syncProgressBars() {
    qsa('.progress-indicator[data-week]').forEach(indicator => {
      const week     = Number(indicator.dataset.week);
      const fill     = qs('.progress-indicator__fill', indicator);
      const isStudied = State.studiedWeeks.has(week);

      if (!fill) return;

      if (isStudied) {
        indicator.dataset.status = 'complete';
        fill.style.width = '100%';
      } else {
        indicator.dataset.status = 'pending';
        fill.style.width = '0%';
      }
    });
  },
};


/* ============================================================
   12. PROGRESS TRACKER  (Week progress bars in dashboard)
   ============================================================ */

const ProgressTracker = {
  init() {
    // Animate bars in on load with slight stagger
    setTimeout(() => {
      StudyTracker.syncProgressBars();
    }, 300);
  },
};


/* ============================================================
   13. SEARCH SYSTEM
   ============================================================ */

const Search = {
  modal:    null,
  input:    null,
  results:  null,
  overlay:  null,
  closeBtn: null,
  searchableItems: [],

  init() {
    this.buildUI();
    this.indexContent();
    this.bindShortcut();
  },

  buildUI() {
    // Search trigger button in header
    const headerActions = qs('.header-actions');
    if (headerActions) {
      const searchBtn = createElement('button', {
        className:   'btn-icon',
        id:          'search-trigger',
        'aria-label': 'Search content',
        title:        'Search (Ctrl+K)',
        style: {
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        },
      }, '🔍');
      // Insert before theme toggle
      headerActions.insertBefore(searchBtn, headerActions.firstChild);
    }

    // Overlay
    this.overlay = createElement('div', {
      className: 'search-overlay',
      style: {
        position:        'fixed',
        inset:           '0',
        zIndex:          '2000',
        background:      'rgba(5,10,15,0.85)',
        backdropFilter:  'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display:         'none',
        alignItems:      'flex-start',
        justifyContent:  'center',
        paddingTop:      'clamp(60px, 12vh, 120px)',
        paddingLeft:     '1rem',
        paddingRight:    '1rem',
      },
    });

    // Modal
    this.modal = createElement('div', {
      className: 'search-modal',
      role:      'dialog',
      'aria-label': 'Search',
      style: {
        background:    'var(--surface)',
        border:        '1px solid var(--border-accent)',
        borderRadius:  'var(--radius-xl)',
        width:         '100%',
        maxWidth:      '640px',
        boxShadow:     'var(--shadow-lg)',
        overflow:      'hidden',
        animation:     'fadeInUp 200ms ease both',
      },
    });

    // Search input row
    const inputRow = createElement('div', {
      style: {
        display:    'flex',
        alignItems: 'center',
        gap:        '0.75rem',
        padding:    '1rem 1.25rem',
        borderBottom: '1px solid var(--border)',
      },
    });

    const searchIcon = createElement('span', {
      style: { fontSize: '1rem', color: 'var(--text-muted)', flexShrink: '0' },
    }, '🔍');

    this.input = createElement('input', {
      type:        'text',
      placeholder: 'Search lectures, concepts, tools, terms…',
      className:   'search-input',
      autocomplete: 'off',
      style: {
        flex:       '1',
        background: 'transparent',
        border:     'none',
        outline:    'none',
        color:      'var(--text-primary)',
        fontSize:   '0.95rem',
        fontFamily: '-apple-system, sans-serif',
        padding:    '0',
      },
    });

    this.closeBtn = createElement('button', {
      type:        'button',
      'aria-label': 'Close search',
      style: {
        background:    'var(--surface-raised)',
        border:        '1px solid var(--border)',
        borderRadius:  'var(--radius-sm)',
        color:         'var(--text-muted)',
        cursor:        'pointer',
        fontSize:      '0.7rem',
        fontFamily:    '-apple-system, sans-serif',
        padding:       '0.2rem 0.5rem',
        flexShrink:    '0',
        WebkitTapHighlightColor: 'transparent',
      },
    }, 'ESC');

    inputRow.append(searchIcon, this.input, this.closeBtn);

    // Results container
    this.results = createElement('div', {
      className: 'search-results',
      role:      'listbox',
      style: {
        maxHeight:  '420px',
        overflowY:  'auto',
        padding:    '0.5rem',
        scrollbarWidth: 'thin',
      },
    });

    // Footer hint
    const footer = createElement('div', {
      style: {
        padding:      '0.5rem 1.25rem',
        borderTop:    '1px solid var(--border)',
        fontSize:     '0.68rem',
        color:        'var(--text-muted)',
        fontFamily:   '-apple-system, sans-serif',
        display:      'flex',
        gap:          '1rem',
      },
    }, '↵ Jump to result    ↑↓ Navigate    ESC Close');

    this.modal.append(inputRow, this.results, footer);
    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    // Add highlight style
    const style = createElement('style');
    style.textContent = `
      .search-highlight {
        background: var(--accent-soft);
        color: var(--accent);
        border-radius: 2px;
        padding: 0 2px;
      }
      .search-result-item {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.75rem 0.85rem;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background 150ms ease;
        border: 1px solid transparent;
        text-decoration: none;
        color: inherit;
      }
      .search-result-item:hover,
      .search-result-item.is-focused {
        background: var(--accent-soft);
        border-color: var(--border-accent);
      }
      .search-result-title {
        font-size: 0.84rem;
        font-weight: 600;
        color: var(--text-primary);
        font-family: -apple-system, sans-serif;
      }
      .search-result-meta {
        font-size: 0.72rem;
        color: var(--text-muted);
        font-family: -apple-system, sans-serif;
      }
      .search-result-snippet {
        font-size: 0.76rem;
        color: var(--text-secondary);
        font-family: -apple-system, sans-serif;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .search-no-results {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.85rem;
        font-family: -apple-system, sans-serif;
      }
      .search-results-section-label {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-muted);
        padding: 0.5rem 0.85rem 0.25rem;
        font-family: -apple-system, sans-serif;
      }
    `;
    document.head.appendChild(style);

    // Events
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (!this.modal.contains(e.target)) this.close();
    });
    this.input.addEventListener('input', debounce(() => this.query(this.input.value), 150));
    this.input.addEventListener('keydown', (e) => this.handleInputKey(e));
  },

  indexContent() {
    this.searchableItems = [];

    // Index lecture titles
    qsa('.lecture-section[data-week]').forEach(section => {
      const week  = section.dataset.week;
      const title = qs('.lecture-title', section);
      if (title) {
        this.searchableItems.push({
          type:     'lecture',
          week,
          title:    title.textContent.trim(),
          snippet:  '',
          targetId: section.id,
        });
      }
    });

    // Index concept cards
    qsa('.concept-card').forEach(card => {
      const term = qs('.concept-card__term', card);
      const def  = qs('.concept-card__definition', card);
      const section = card.closest('.lecture-section');
      const week  = section ? section.dataset.week : '';
      const sectionTitle = section ? qs('.lecture-title', section)?.textContent.trim() : '';
      if (term) {
        this.searchableItems.push({
          type:     'concept',
          week,
          title:    term.textContent.trim(),
          snippet:  def ? def.textContent.trim().slice(0, 120) : '',
          targetId: (card.id || section?.id) || '',
          sectionTitle,
          el:       card,
        });
      }
    });

    // Index tool cards
    qsa('.tool-card').forEach(card => {
      const name    = qs('.tool-card__name', card);
      const purpose = qs('.tool-card__purpose', card);
      const section = card.closest('.lecture-section');
      const week    = section ? section.dataset.week : '';
      const sectionTitle = section ? qs('.lecture-title', section)?.textContent.trim() : '';
      if (name) {
        this.searchableItems.push({
          type:     'tool',
          week,
          title:    name.textContent.trim(),
          snippet:  purpose ? purpose.textContent.trim().slice(0, 120) : '',
          targetId: section?.id || '',
          sectionTitle,
          el:       card,
        });
      }
    });

    // Index memorize cards
    qsa('.memorize-card').forEach(card => {
      const section = card.closest('.lecture-section');
      const week    = section ? section.dataset.week : '';
      const sectionTitle = section ? qs('.lecture-title', section)?.textContent.trim() : '';
      this.searchableItems.push({
        type:     'key-fact',
        week,
        title:    card.textContent.trim().slice(0, 80),
        snippet:  '',
        targetId: section?.id || '',
        sectionTitle,
        el:       card,
      });
    });

    // Index glossary terms
    qsa('.glossary-term').forEach(dt => {
      const dd = dt.nextElementSibling;
      this.searchableItems.push({
        type:     'glossary',
        week:     '',
        title:    dt.textContent.trim(),
        snippet:  dd ? dd.textContent.trim().slice(0, 100) : '',
        targetId: 'glossary',
        el:       dt,
      });
    });
  },

  query(raw) {
    const q = raw.trim();
    this.results.innerHTML = '';

    if (!q) {
      this.results.innerHTML = '<div class="search-no-results">Start typing to search…</div>';
      return;
    }

    const ql = q.toLowerCase();

    const matched = this.searchableItems.filter(item => {
      return (
        item.title.toLowerCase().includes(ql) ||
        item.snippet.toLowerCase().includes(ql)
      );
    }).slice(0, 30);

    if (!matched.length) {
      this.results.innerHTML = `<div class="search-no-results">No results for "<strong>${q}</strong>"</div>`;
      return;
    }

    // Group by type
    const groups = { lecture: [], concept: [], tool: [], 'key-fact': [], glossary: [] };
    matched.forEach(item => (groups[item.type] || groups.glossary).push(item));

    const typeLabels = { lecture: '📚 Lectures', concept: '⚙️ Concepts', tool: '🔧 Tools', 'key-fact': '⭐ Key Facts', glossary: '📄 Glossary' };

    Object.entries(groups).forEach(([type, items]) => {
      if (!items.length) return;
      const label = createElement('div', { className: 'search-results-section-label' }, typeLabels[type] || type);
      this.results.appendChild(label);

      items.forEach(item => {
        const resultEl = createElement('div', {
          className:    'search-result-item',
          tabIndex:     '0',
          role:         'option',
          'data-target': item.targetId,
        });

        const titleDiv = createElement('div', { className: 'search-result-title' });
        titleDiv.innerHTML = highlight(item.title, q);

        const metaDiv = createElement('div', {
          className: 'search-result-meta',
        }, item.week ? `Week ${item.week}` + (item.sectionTitle ? ` — ${item.sectionTitle.slice(0, 50)}` : '') : (item.sectionTitle || ''));

        resultEl.appendChild(titleDiv);
        if (item.week || item.sectionTitle) resultEl.appendChild(metaDiv);

        if (item.snippet) {
          const snippetDiv = createElement('div', { className: 'search-result-snippet' });
          snippetDiv.innerHTML = highlight(item.snippet, q);
          resultEl.appendChild(snippetDiv);
        }

        resultEl.addEventListener('click', () => {
          this.jumpTo(item);
          this.close();
        });
        resultEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.jumpTo(item);
            this.close();
          }
        });

        this.results.appendChild(resultEl);
      });
    });
  },

  jumpTo(item) {
    // Try to scroll to the specific element first
    const el = item.el || (item.targetId ? qs('#' + item.targetId) : null);
    if (el) {
      scrollToEl(el);
      // Flash highlight
      el.style.transition = 'outline 0s, box-shadow 300ms';
      el.style.boxShadow  = '0 0 0 2px var(--accent)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1500);
    }
  },

  open() {
    State.searchOpen = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.input.value = '';
      this.input.focus();
      this.results.innerHTML = '<div class="search-no-results">Start typing to search…</div>';
    });
  },

  close() {
    State.searchOpen = false;
    this.overlay.style.display = 'none';
    this.input.value = '';
    this.results.innerHTML = '';
  },

  handleInputKey(e) {
    const items = qsa('.search-result-item', this.results);
    const focused = qs('.search-result-item.is-focused', this.results);
    let idx = items.indexOf(focused);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Escape') {
      this.close();
      return;
    } else if (e.key === 'Enter' && focused) {
      e.preventDefault();
      focused.click();
      return;
    } else {
      return;
    }

    items.forEach(i => i.classList.remove('is-focused'));
    if (items[idx]) {
      items[idx].classList.add('is-focused');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  },

  bindShortcut() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        State.searchOpen ? this.close() : this.open();
      }
    });
  },
};


/* ============================================================
   14. FLASHCARD SYSTEM
   ============================================================ */

const Flashcards = {
  init() {
    State.flashcardState = Storage.get(STORAGE_KEYS.FLASHCARD, {});

    qsa('.flashcard-container[data-component="flashcard-deck"]').forEach(container => {
      const week   = container.dataset.week;
      const cards  = qsa('.flashcard', container);
      if (!cards.length) return;

      this.buildDeck(container, cards, week);
    });
  },

  buildDeck(container, cards, week) {
    // Remove placeholder text
    const placeholderText = qs('.flashcard-placeholder-text', container);
    if (placeholderText) placeholderText.remove();

    // Save raw card data
    const cardData = cards.map(c => ({
      id:    c.dataset.cardId,
      front: c.dataset.front || 'Front',
      back:  c.dataset.back  || 'Back',
    }));

    // Remove original DOM cards
    cards.forEach(c => c.remove());

    const state = State.flashcardState[week] || { index: 0, flipped: false, mode: 'sequential', seen: [] };

    // ── Build interactive flashcard UI ──
    const deck = createElement('div', {
      className: 'fc-deck',
      style: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '0.75rem',
        alignItems:    'center',
      },
    });

    // Progress label
    const progressLabel = createElement('div', {
      className: 'fc-progress-label',
      style: {
        fontSize:   '0.72rem',
        color:      'var(--text-muted)',
        fontFamily: '-apple-system, sans-serif',
        fontWeight: '600',
      },
    });

    // Card viewport
    const viewport = createElement('div', {
      style: {
        width:      '100%',
        maxWidth:   '480px',
        perspective: '1000px',
      },
    });

    // Card itself (3D flip)
    const card = createElement('div', {
      className: 'fc-card',
      tabIndex:  '0',
      role:      'button',
      'aria-label': 'Flashcard — click to flip',
      style: {
        position:       'relative',
        width:          '100%',
        minHeight:      '160px',
        cursor:         'pointer',
        transformStyle: 'preserve-3d',
        transition:     'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
        WebkitTapHighlightColor: 'transparent',
        userSelect:     'none',
      },
    });

    const makeFace = (type) => createElement('div', {
      className: `fc-face fc-face--${type}`,
      style: {
        position:        'absolute',
        inset:           '0',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderRadius:    'var(--radius-lg)',
        padding:         '1.5rem',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        textAlign:       'center',
        background:      type === 'front' ? 'var(--surface)'     : 'var(--accent-soft)',
        border:          type === 'front' ? '1px solid var(--border-accent)' : '1px solid var(--border-accent)',
        color:           type === 'front' ? 'var(--text-primary)' : 'var(--accent)',
        fontSize:        '0.88rem',
        fontFamily:      '-apple-system, sans-serif',
        lineHeight:      '1.5',
        fontWeight:      type === 'front' ? '600' : '400',
        transform:       type === 'back'  ? 'rotateY(180deg)' : 'none',
        willChange:      'transform',
      },
    });

    const frontFace = makeFace('front');
    const backFace  = makeFace('back');
    card.append(frontFace, backFace);
    viewport.appendChild(card);

    // Controls
    const controls = createElement('div', {
      style: {
        display:    'flex',
        gap:        '0.5rem',
        alignItems: 'center',
        flexWrap:   'wrap',
        justifyContent: 'center',
        marginTop:  '0.5rem',
      },
    });

    const makeBtn = (label, title, action) => {
      const b = createElement('button', {
        type:     'button',
        title,
        style: {
          padding:       '0.45rem 1rem',
          borderRadius:  'var(--radius-md)',
          border:        '1px solid var(--border)',
          background:    'var(--surface)',
          color:         'var(--text-secondary)',
          cursor:        'pointer',
          fontSize:      '0.76rem',
          fontFamily:    '-apple-system, sans-serif',
          fontWeight:    '600',
          transition:    'all 150ms ease',
          WebkitTapHighlightColor: 'transparent',
          touchAction:   'manipulation',
        },
      }, label);
      b.addEventListener('mouseenter', () => { b.style.borderColor = 'var(--border-accent)'; b.style.color = 'var(--accent)'; });
      b.addEventListener('mouseleave', () => { b.style.borderColor = 'var(--border)';        b.style.color = 'var(--text-secondary)'; });
      b.addEventListener('click', action);
      return b;
    };

    let currentIdx = state.index;
    let flipped    = false;

    const render = () => {
      const data = cardData[currentIdx];
      frontFace.textContent = data.front;
      backFace.textContent  = data.back;
      flipped = false;
      card.style.transform  = 'rotateY(0deg)';
      progressLabel.textContent = `Card ${currentIdx + 1} of ${cardData.length}`;
      // Save
      State.flashcardState[week] = { index: currentIdx, flipped: false };
      Storage.set(STORAGE_KEYS.FLASHCARD, State.flashcardState);
    };

    const flip = () => {
      flipped = !flipped;
      card.style.transform = flipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    };

    const prev = () => { currentIdx = (currentIdx - 1 + cardData.length) % cardData.length; render(); };
    const next = () => { currentIdx = (currentIdx + 1) % cardData.length; render(); };
    const rand = () => { currentIdx = Math.floor(Math.random() * cardData.length); render(); };

    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    });

    controls.append(
      makeBtn('← Prev', 'Previous card', prev),
      makeBtn('Flip', 'Flip card (Space / Enter)', flip),
      makeBtn('Next →', 'Next card', next),
      makeBtn('🔀 Random', 'Random card', rand),
    );

    deck.append(progressLabel, viewport, controls);
    container.appendChild(deck);
    render();
  },
};


/* ============================================================
   15. QUIZ SYSTEM
   ============================================================ */

const Quiz = {
  init() {
    State.quizState = Storage.get(STORAGE_KEYS.QUIZ, {});

    qsa('.quiz-container[data-component="quiz"]').forEach(container => {
      const week = container.dataset.week;
      this.buildQuiz(container, week);
    });
  },

  buildQuiz(container, week) {
    // Read questions from hidden question bank
    const bank  = qs('.quiz-question-bank', container);
    if (!bank) return;

    const questionEls = qsa('.quiz-question', bank);
    if (!questionEls.length) return;

    const questions = questionEls.map(el => ({
      q:       el.dataset.question,
      options: {
        a: el.dataset.a,
        b: el.dataset.b,
        c: el.dataset.c,
        d: el.dataset.d,
      },
      correct: el.dataset.correct.toLowerCase(),
    })).filter(q => q.q);

    if (!questions.length) return;

    // Remove old start button + placeholder text
    const startBtn  = qs('.btn-quiz-start', container);
    const placeholder = qs('.quiz-placeholder-text', container);
    if (startBtn)   startBtn.remove();
    if (placeholder) placeholder.remove();

    // Build Start Screen
    const startScreen = createElement('div', {
      className: 'quiz-start-screen',
      style: { textAlign: 'center' },
    });

    const startInfo = createElement('p', {
      style: { fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: '-apple-system, sans-serif', marginBottom: '1rem' },
    }, `${questions.length} multiple-choice questions`);

    // Check if there's a previous score
    const prevState = State.quizState[week];
    if (prevState?.finished) {
      const prevScore = createElement('p', {
        style: { fontSize: '0.82rem', color: 'var(--success)', fontFamily: '-apple-system, sans-serif', marginBottom: '0.75rem' },
      }, `Previous score: ${prevState.score}/${questions.length}`);
      startScreen.appendChild(prevScore);
    }

    const btn = createElement('button', {
      type:  'button',
      className: 'btn-quiz-start',
      style: { cursor: 'pointer' },
    }, '▶ Start Quiz');

    startScreen.append(startInfo, btn);
    container.appendChild(startScreen);

    // ── Quiz active state ──
    let currentQ = 0;
    let score    = 0;
    let answers  = {};
    let quizEl   = null;

    const startQuiz = () => {
      currentQ = 0;
      score    = 0;
      answers  = {};
      startScreen.style.display = 'none';
      quizEl = this.renderQuiz(container, questions, week, () => finishQuiz());
    };

    const finishQuiz = (finalScore, finalAnswers) => {
      score   = finalScore;
      answers = finalAnswers;
      State.quizState[week] = { score, answers, finished: true, total: questions.length };
      Storage.set(STORAGE_KEYS.QUIZ, State.quizState);
      this.renderResults(container, quizEl, score, questions.length, () => {
        quizEl?.remove();
        quizEl = null;
        startScreen.style.display = '';
        // Update previous score display
        let prevScore = qs('.quiz-prev-score', startScreen);
        if (!prevScore) {
          prevScore = createElement('p', {
            className: 'quiz-prev-score',
            style: { fontSize: '0.82rem', color: 'var(--success)', fontFamily: '-apple-system, sans-serif', marginBottom: '0.75rem' },
          });
          startScreen.insertBefore(prevScore, btn);
        }
        prevScore.textContent = `Previous score: ${score}/${questions.length}`;
      });
    };

    btn.addEventListener('click', startQuiz);
  },

  renderQuiz(container, questions, week, onFinish) {
    const el = createElement('div', { className: 'quiz-active' });

    let currentQ  = 0;
    let score     = 0;
    const answers = {};

    const renderQuestion = () => {
      el.innerHTML = '';
      const q = questions[currentQ];

      // Progress bar
      const progressWrap = createElement('div', {
        style: { marginBottom: '1rem' },
      });
      const progressLabel = createElement('div', {
        style: { fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: '-apple-system, sans-serif', marginBottom: '0.35rem' },
      }, `Question ${currentQ + 1} of ${questions.length}`);
      const barWrap = createElement('div', {
        style: { height: '4px', background: 'var(--surface-raised)', borderRadius: '999px', overflow: 'hidden' },
      });
      const barFill = createElement('div', {
        style: {
          height:     '100%',
          width:      `${((currentQ) / questions.length) * 100}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-secondary))',
          borderRadius: '999px',
          transition: 'width 300ms ease',
        },
      });
      barWrap.appendChild(barFill);
      progressWrap.append(progressLabel, barWrap);
      el.appendChild(progressWrap);

      // Question text
      const qText = createElement('div', {
        style: {
          fontSize:   '0.9rem',
          fontWeight: '600',
          color:      'var(--text-primary)',
          fontFamily: '-apple-system, sans-serif',
          lineHeight: '1.6',
          marginBottom: '1rem',
          textAlign:  'left',
        },
      }, q.q);
      el.appendChild(qText);

      // Options
      const optWrap = createElement('div', {
        style: {
          display:       'flex',
          flexDirection: 'column',
          gap:           '0.5rem',
          textAlign:     'left',
        },
      });

      Object.entries(q.options).forEach(([key, val]) => {
        if (!val) return;
        const opt = createElement('button', {
          type:     'button',
          'data-key': key,
          style: {
            display:       'flex',
            alignItems:    'center',
            gap:           '0.75rem',
            padding:       '0.7rem 1rem',
            borderRadius:  'var(--radius-md)',
            border:        '1px solid var(--border)',
            background:    'var(--surface)',
            color:         'var(--text-secondary)',
            cursor:        'pointer',
            fontSize:      '0.82rem',
            fontFamily:    '-apple-system, sans-serif',
            textAlign:     'left',
            transition:    'all 150ms ease',
            width:         '100%',
            WebkitTapHighlightColor: 'transparent',
            touchAction:   'manipulation',
          },
        });

        const keyBadge = createElement('span', {
          style: {
            display:       'inline-flex',
            alignItems:    'center',
            justifyContent:'center',
            minWidth:      '22px',
            height:        '22px',
            background:    'var(--surface-raised)',
            borderRadius:  'var(--radius-sm)',
            fontFamily:    'SF Mono, monospace',
            fontSize:      '0.7rem',
            fontWeight:    '700',
            color:         'var(--accent)',
            flexShrink:    '0',
            textTransform: 'uppercase',
          },
        }, key);

        opt.append(keyBadge, val);

        opt.addEventListener('mouseenter', () => {
          opt.style.borderColor = 'var(--border-accent)';
          opt.style.background  = 'var(--surface-raised)';
        });
        opt.addEventListener('mouseleave', () => {
          if (!opt.dataset.answered) {
            opt.style.borderColor = 'var(--border)';
            opt.style.background  = 'var(--surface)';
          }
        });

        opt.addEventListener('click', () => {
          // Lock all options
          qsa('button[data-key]', el).forEach(b => {
            b.style.cursor  = 'default';
            b.style.pointerEvents = 'none';
            b.dataset.answered = '1';
          });

          const isCorrect = key === q.correct;
          if (isCorrect) score++;
          answers[currentQ] = { chosen: key, correct: q.correct, isCorrect };

          // Visual feedback
          qsa('button[data-key]', el).forEach(b => {
            if (b.dataset.key === q.correct) {
              b.style.background  = 'var(--success-soft)';
              b.style.borderColor = 'var(--success)';
              b.style.color       = 'var(--success)';
            } else if (b.dataset.key === key && !isCorrect) {
              b.style.background  = 'var(--danger-soft)';
              b.style.borderColor = 'var(--danger)';
              b.style.color       = 'var(--danger)';
            }
          });

          // Explanation / next
          setTimeout(() => {
            const nextBtn = createElement('button', {
              type:  'button',
              style: {
                display:       'inline-flex',
                alignItems:    'center',
                gap:           '0.4rem',
                marginTop:     '0.75rem',
                padding:       '0.5rem 1.25rem',
                borderRadius:  'var(--radius-md)',
                border:        '1px solid var(--border-accent)',
                background:    'var(--accent-soft)',
                color:         'var(--accent)',
                cursor:        'pointer',
                fontSize:      '0.78rem',
                fontFamily:    '-apple-system, sans-serif',
                fontWeight:    '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                WebkitTapHighlightColor: 'transparent',
              },
            }, currentQ + 1 < questions.length ? 'Next →' : 'See Results');

            nextBtn.addEventListener('click', () => {
              currentQ++;
              if (currentQ < questions.length) {
                renderQuestion();
              } else {
                onFinish(score, answers);
              }
            });

            el.appendChild(nextBtn);
          }, 400);
        });

        optWrap.appendChild(opt);
      });

      el.appendChild(optWrap);
    };

    renderQuestion();
    container.appendChild(el);
    return el;
  },

  renderResults(container, quizEl, score, total, onRetry) {
    if (quizEl) quizEl.innerHTML = '';
    const target = quizEl || container;

    const pct     = Math.round((score / total) * 100);
    const emoji   = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚';
    const comment = pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good effort!' : 'Keep reviewing!';

    const resultsEl = createElement('div', {
      className: 'quiz-results',
      style: {
        textAlign: 'center',
        padding:   '1rem 0',
      },
    });

    const scoreDisplay = createElement('div', {
      style: {
        fontSize:      '3rem',
        fontWeight:    '800',
        color:         pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)',
        fontFamily:    'SF Mono, monospace',
        lineHeight:    '1',
        marginBottom:  '0.5rem',
      },
    }, `${score}/${total}`);

    const emojiEl = createElement('div', {
      style: { fontSize: '2rem', marginBottom: '0.5rem' },
    }, emoji);

    const commentEl = createElement('p', {
      style: { color: 'var(--text-secondary)', fontFamily: '-apple-system, sans-serif', marginBottom: '1.25rem' },
    }, `${comment} — ${pct}%`);

    const retryBtn = createElement('button', {
      type:  'button',
      style: {
        padding:       '0.5rem 1.5rem',
        borderRadius:  'var(--radius-md)',
        border:        '1px solid var(--border)',
        background:    'var(--surface)',
        color:         'var(--text-secondary)',
        cursor:        'pointer',
        fontSize:      '0.78rem',
        fontFamily:    '-apple-system, sans-serif',
        fontWeight:    '600',
        WebkitTapHighlightColor: 'transparent',
      },
    }, '↺ Retry Quiz');

    retryBtn.addEventListener('click', onRetry);

    resultsEl.append(emojiEl, scoreDisplay, commentEl, retryBtn);
    target.appendChild(resultsEl);
  },
};


/* ============================================================
   16. BACK TO TOP BUTTON
   ============================================================ */

const BackToTop = {
  btn: null,

  init() {
    this.btn = createElement('button', {
      id:          'back-to-top',
      type:        'button',
      'aria-label': 'Back to top',
      title:        'Back to top',
      style: {
        position:    'fixed',
        bottom:      '1.5rem',
        right:       '1.5rem',
        zIndex:      '900',
        width:       '42px',
        height:      '42px',
        borderRadius:'50%',
        border:      '1px solid var(--border-accent)',
        background:  'var(--surface)',
        color:       'var(--accent)',
        cursor:      'pointer',
        fontSize:    '1rem',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        boxShadow:   'var(--shadow-md)',
        opacity:     '0',
        transform:   'translateY(12px)',
        transition:  'opacity 250ms ease, transform 250ms ease, box-shadow 150ms ease',
        pointerEvents: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      },
    }, '↑');

    this.btn.addEventListener('mouseenter', () => {
      this.btn.style.boxShadow = 'var(--shadow-glow)';
      this.btn.style.background = 'var(--accent-soft)';
    });
    this.btn.addEventListener('mouseleave', () => {
      this.btn.style.boxShadow = 'var(--shadow-md)';
      this.btn.style.background = 'var(--surface)';
    });
    this.btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.body.appendChild(this.btn);

    window.addEventListener('scroll', throttle(() => this.onScroll(), 100));
  },

  onScroll() {
    const show = window.scrollY > 400;
    this.btn.style.opacity       = show ? '1' : '0';
    this.btn.style.transform     = show ? 'translateY(0)'  : 'translateY(12px)';
    this.btn.style.pointerEvents = show ? 'auto' : 'none';
  },
};


/* ============================================================
   17. INTERSECTION OBSERVER ANIMATIONS
   ============================================================ */

const Animations = {
  observer: null,

  init() {
    // Inject animation styles
    const style = createElement('style');
    style.textContent = `
      .anim-hidden {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 500ms ease, transform 500ms ease;
      }
      .anim-visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
      .anim-slide-left {
        opacity: 0;
        transform: translateX(-16px);
        transition: opacity 400ms ease, transform 400ms ease;
      }
      .anim-stagger-1 { transition-delay: 50ms !important; }
      .anim-stagger-2 { transition-delay: 100ms !important; }
      .anim-stagger-3 { transition-delay: 150ms !important; }
      .anim-stagger-4 { transition-delay: 200ms !important; }
      .anim-stagger-5 { transition-delay: 250ms !important; }
      .anim-stagger-6 { transition-delay: 300ms !important; }
    `;
    document.head.appendChild(style);

    // Observe elements for fade-in
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('anim-visible');
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );

    // Add animation classes to selected elements
    const animated = qsa([
      '.concept-card',
      '.tool-card',
      '.memorize-card',
      '.real-world-card',
      '.mnemonic-card',
      '.stage-item',
      '.cheatsheet-block',
      '.reading-item',
      '.quick-nav-card',
      '.dashboard-card',
    ].join(','));

    animated.forEach((el, i) => {
      // Skip if prefers-reduced-motion
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      el.classList.add('anim-hidden');
      const stagger = (i % 6) + 1;
      el.classList.add(`anim-stagger-${stagger}`);
      this.observer.observe(el);
    });

    // Also animate lecture sections
    qsa('.lecture-section').forEach(sec => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      sec.classList.add('anim-hidden');
      this.observer.observe(sec);
    });
  },
};


/* ============================================================
   18. TOOLTIP SYSTEM
   ============================================================ */

const Tooltips = {
  tooltip: null,
  currentEl: null,

  /** Map of abbreviations to definitions (pulled from glossary) */
  termMap: {},

  init() {
    // Build term map from glossary
    qsa('.glossary-term').forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd) {
        this.termMap[dt.textContent.trim().toUpperCase()] =
          dd.textContent.trim().slice(0, 160);
      }
    });

    // Create tooltip DOM element
    this.tooltip = createElement('div', {
      className: 'hacklab-tooltip',
      role:      'tooltip',
      style: {
        position:     'fixed',
        zIndex:       '3000',
        background:   'var(--surface)',
        border:       '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-md)',
        padding:      '0.5rem 0.75rem',
        fontSize:     '0.75rem',
        color:        'var(--text-secondary)',
        fontFamily:   '-apple-system, sans-serif',
        maxWidth:     '280px',
        lineHeight:   '1.5',
        boxShadow:    'var(--shadow-md)',
        pointerEvents:'none',
        display:      'none',
        wordBreak:    'break-word',
      },
    });
    document.body.appendChild(this.tooltip);

    // Attach tooltips to concept terms in memorize cards
    qsa('.memorize-card strong, .concept-card__term').forEach(el => {
      const text   = el.textContent.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
      const termKeys = Object.keys(this.termMap);
      // Try to find a matching glossary entry
      const match = termKeys.find(k => text.includes(k) || k.includes(text));
      if (match) {
        el.style.cursor     = 'help';
        el.style.textDecoration = 'underline dotted';
        el.dataset.tooltipText = this.termMap[match];
        el.setAttribute('aria-describedby', 'hacklab-tooltip');
        el.addEventListener('mouseenter', (e) => this.show(e.target));
        el.addEventListener('mouseleave', ()  => this.hide());
        el.addEventListener('focus',      (e) => this.show(e.target));
        el.addEventListener('blur',       ()  => this.hide());
      }
    });
  },

  show(el) {
    const text = el.dataset.tooltipText;
    if (!text) return;
    this.tooltip.textContent = text;
    this.tooltip.style.display = 'block';
    this.currentEl = el;
    this.position(el);
  },

  hide() {
    this.tooltip.style.display = 'none';
    this.currentEl = null;
  },

  position(el) {
    const rect    = el.getBoundingClientRect();
    const tipH    = this.tooltip.offsetHeight || 60;
    const tipW    = this.tooltip.offsetWidth  || 200;
    const margin  = 8;
    let top  = rect.bottom + margin;
    let left = rect.left;

    // Flip above if not enough room below
    if (top + tipH > window.innerHeight - 20) {
      top = rect.top - tipH - margin;
    }
    // Clamp to viewport
    left = Math.min(left, window.innerWidth - tipW - 10);
    left = Math.max(left, 10);

    this.tooltip.style.top  = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  },
};


/* ============================================================
   19. KEYBOARD ACCESSIBILITY
   ============================================================ */

const Keyboard = {
  init() {
    document.addEventListener('keydown', (e) => {
      // Escape: close sidebar on mobile, close search
      if (e.key === 'Escape') {
        if (State.searchOpen) {
          Search.close();
          return;
        }
        if (State.isMobile && State.sidebarOpen) {
          Sidebar.closeMobile();
          return;
        }
      }

      // Tab through nav links with Enter/Space (handled natively by browsers for buttons/links)
    });

    // Make collapsible titles keyboard-navigable
    qsa('.subsection-title').forEach(title => {
      if (!title.querySelector('.collapse-toggle')) return;
      title.setAttribute('tabindex', '0');
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const btn = qs('.collapse-toggle', title);
          if (btn) btn.click();
        }
      });
    });
  },
};


/* ============================================================
   20. PERFORMANCE HELPERS  (declared as utility above)
   ============================================================ */
// debounce() and throttle() already defined in Section 02.


/* ============================================================
   21. EVENT LISTENERS  (centralized, delegated where possible)
   ============================================================ */

const Events = {
  init() {
    // ── Theme toggle ──
    const themeBtn = qs('#theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => Theme.toggle());
    }

    // ── Sidebar toggle ──
    const sidebarToggle = qs('#sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => Sidebar.handleToggle());
    }

    // ── Search trigger ──
    document.addEventListener('click', (e) => {
      if (e.target.closest('#search-trigger')) {
        Search.open();
      }
    });

    // ── Nav links: auto-close on mobile + smooth scroll ──
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-link[href^="#"]');
      if (link) MobileMenu.onNavLinkClick();
    });

    // ── Quick nav cards ──
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.quick-nav-card[href^="#"]');
      if (card) MobileMenu.onNavLinkClick();
    });

    // ── Mark as Studied (delegated) ──
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-studied[data-action="mark-studied"]');
      if (btn) {
        const week = Number(btn.dataset.week);
        if (week) StudyTracker.toggle(week);
      }
    });

    // ── Window resize ──
    window.addEventListener('resize', debounce(() => {
      Sidebar.handleResize();
    }, 200));

    // ── Scroll: active link tracking ──
    // (handled by IntersectionObserver — no scroll listener needed)
  },
};


/* ============================================================
   22. INITIALIZATION
   ============================================================ */

const Init = {
  run() {
    // Detect mobile
    State.isMobile = window.innerWidth <= 768;

    // 1. Theme (before first paint)
    Theme.init();

    // 2. Sidebar
    Sidebar.init();

    // 3. Study Tracking (loads from storage)
    StudyTracker.init();

    // 4. Dashboard
    Dashboard.init();

    // 5. Progress Tracker
    ProgressTracker.init();

    // 6. Smooth scrolling
    SmoothScroll.init();

    // 7. Active link tracking
    ActiveLinks.init();

    // 8. Collapsible sections
    Collapsible.init();

    // 9. Intersection animations
    Animations.init();

    // 10. Flashcards
    Flashcards.init();

    // 11. Quiz system
    Quiz.init();

    // 12. Search
    Search.init();

    // 13. Back to top
    BackToTop.init();

    // 14. Tooltips
    Tooltips.init();

    // 15. Keyboard accessibility
    Keyboard.init();

    // 16. All event listeners
    Events.init();

    // 17. Handle initial hash (direct link)
    if (window.location.hash) {
      const target = qs(window.location.hash);
      if (target) {
        setTimeout(() => scrollToEl(target), 150);
      }
    }

    // 18. Mark dashboard active on load if no hash
    if (!window.location.hash) {
      ActiveLinks.setActive('#dashboard');
    }

    // Console branding
    console.log(
      '%c🔒 HackLab%c — Interactive Cybersecurity Portal loaded successfully.',
      'color: #00d4ff; font-weight: 800; font-size: 1.1rem;',
      'color: #8a9ab5;'
    );
  },
};

// ── Boot ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Init.run());
} else {
  Init.run();
}
