/**
 * ==============================================================================
 * PANEL 3: TWO-WINDOW METRICS (panels/twoWindowMetrics.js)
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Features:
 * - Live counts for Short Window (5s) and Long Window (60s)
 * - Active Sessions metric
 * - Pacing Delay metric (0s, 2s, 4s)
 * - Sessions Affected count & fairness ratio
 * - Window trigger indicators (Warn / Slow borders)
 * ==============================================================================
 */

(function (global) {
  'use strict';

  let rootEl = null;

  function mount(el) {
    if (!el) return;
    rootEl = el;

    rootEl.innerHTML = `
      <div class="card-header">
        <div class="header-titles">
          <h2 id="heading-metrics" class="card-title">
            <span aria-hidden="true">⏱️</span> 2. Two-Window Metrics
          </h2>
          <p id="metrics-panel-subtitle" class="card-subtitle">
            Sliding-window submission counts per session.
          </p>
        </div>
        <span id="metrics-panel-badge" class="badge badge-neutral">Waiting for data</span>
      </div>
      <div class="card-body">
        <div class="metrics-grid">
          <!-- Metric Card 1: Active Sessions -->
          <div class="metric-card" id="metric-card-active">
            <span class="metric-label">Active Sessions</span>
            <span class="metric-value" id="metric-active-sessions">—</span>
            <span id="metric-active-sessions-helper" class="metric-helper">Waiting for data</span>
          </div>

          <!-- Metric Card 2: Short Window Submits -->
          <div class="metric-card" id="metric-card-short">
            <span class="metric-label">5 s Window: Highest Count</span>
            <span class="metric-value" id="metric-short-window">—</span>
            <span class="metric-helper" id="metric-short-thresholds">Warn: 4 · Slow: 8 (any session)</span>
          </div>

          <!-- Metric Card 3: Long Window Submits -->
          <div class="metric-card" id="metric-card-long">
            <span class="metric-label">60 s Window: Highest Count</span>
            <span class="metric-value" id="metric-long-window">—</span>
            <span class="metric-helper" id="metric-long-thresholds">Warn: 11 · Slow: 20 (any session)</span>
          </div>

          <!-- Metric Card 4: Dynamic Delay -->
          <div class="metric-card" id="metric-card-delay">
            <span class="metric-label">Current Pacing Delay</span>
            <span class="metric-value" id="metric-current-delay">— s</span>
            <span class="metric-helper">Delay steps: 2 s, then 4 s</span>
          </div>

          <!-- Metric Card 5: Sessions Affected -->
          <div class="metric-card" id="metric-card-fairness">
            <span class="metric-label">Sessions Affected</span>
            <span class="metric-value" id="metric-fairness-index">—</span>
            <span class="metric-helper" id="metric-fairness-helper">Warn or Slow decisions</span>
          </div>
        </div>
      </div>
    `;
  }

  function render(state) {
    if (!rootEl) return;

    const metrics = state.metrics || {};
    const cfg = state.config || {};
    const totalSessions = state.sessions ? state.sessions.length : 0;

    const activeEl = rootEl.querySelector('#metric-active-sessions');
    const activeHelper = rootEl.querySelector('#metric-active-sessions-helper');
    const shortEl = rootEl.querySelector('#metric-short-window');
    const longEl = rootEl.querySelector('#metric-long-window');
    const delayEl = rootEl.querySelector('#metric-current-delay');
    const fairnessEl = rootEl.querySelector('#metric-fairness-index');
    const fairnessHelper = rootEl.querySelector('#metric-fairness-helper');
    const badgeEl = rootEl.querySelector('#metrics-panel-badge');
    const subtitleEl = rootEl.querySelector('#metrics-panel-subtitle');

    const cardShort = rootEl.querySelector('#metric-card-short');
    const cardLong = rootEl.querySelector('#metric-card-long');
    const cardDelay = rootEl.querySelector('#metric-card-delay');

    if (!state.activeScenario && totalSessions === 0) {
      if (activeEl) activeEl.textContent = '—';
      if (activeHelper) activeHelper.textContent = 'Waiting for data';
      if (shortEl) shortEl.textContent = '—';
      if (longEl) longEl.textContent = '—';
      if (delayEl) delayEl.textContent = '— s';
      if (fairnessEl) fairnessEl.textContent = '—';
      if (badgeEl) {
        badgeEl.className = 'badge badge-neutral';
        badgeEl.textContent = 'Waiting for data';
      }
      return;
    }

    const shortCount = metrics.shortWindowMax || 0;
    const longCount = metrics.longWindowMax || 0;
    const currentDelay = metrics.currentDelay || 0;
    const affectedCount = metrics.affectedSessions || 0;

    if (activeEl) activeEl.textContent = totalSessions;
    if (activeHelper) activeHelper.textContent = `${totalSessions} distinct sessions tracked`;
    if (shortEl) shortEl.textContent = shortCount;
    if (longEl) longEl.textContent = longCount;
    if (delayEl) delayEl.textContent = `${currentDelay} s`;

    if (fairnessEl) {
      fairnessEl.textContent = `${affectedCount} of ${totalSessions}`;
    }
    if (fairnessHelper) {
      fairnessHelper.textContent = affectedCount === 0 ? 'All 100% allowed and fair' : `${affectedCount} session(s) throttled`;
    }

    // Threshold indicator styling
    const swarn = cfg.shortWarnThreshold || 4;
    const sslow = cfg.shortSlowThreshold || 8;
    const lwarn = cfg.longWarnThreshold || 11;
    const lslow = cfg.longSlowThreshold || 20;

    if (cardShort) {
      cardShort.classList.remove('fired-warn', 'fired-slow', 'normal');
      if (shortCount >= sslow) cardShort.classList.add('fired-slow');
      else if (shortCount >= swarn) cardShort.classList.add('fired-warn');
      else cardShort.classList.add('normal');
    }

    if (cardLong) {
      cardLong.classList.remove('fired-warn', 'fired-slow', 'normal');
      if (longCount >= lslow) cardLong.classList.add('fired-slow');
      else if (longCount >= lwarn) cardLong.classList.add('fired-warn');
      else cardLong.classList.add('normal');
    }

    if (cardDelay) {
      cardDelay.classList.remove('fired-slow', 'normal');
      if (currentDelay > 0) cardDelay.classList.add('fired-slow');
      else cardDelay.classList.add('normal');
    }

    // Top Panel Badge
    if (badgeEl) {
      if (shortCount >= sslow || longCount >= lslow) {
        badgeEl.className = 'badge badge-slow';
        badgeEl.textContent = 'Slow Window Fired';
      } else if (shortCount >= swarn || longCount >= lwarn) {
        badgeEl.className = 'badge badge-warn';
        badgeEl.textContent = 'Warn Window Fired';
      } else {
        badgeEl.className = 'badge badge-allow';
        badgeEl.textContent = 'Normal · All Allow';
      }
    }

    if (subtitleEl) {
      subtitleEl.textContent = `Tracking ${totalSessions} sessions across 5s & 60s sliding windows.`;
    }
  }

  const panel = { mount, render };
  global.TwoWindowMetricsPanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
