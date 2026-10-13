/**
 * ==============================================================================
 * PANEL 6: WHY CARD (panels/whyCard.js) - EXPLAINABILITY
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Features:
 * - Plain-English reason with exact thresholds and active window
 * - Decision Path step-by-step breakdown
 * - Visual dot timeline of recent requests for the selected session
 * - Timing gap evidence (min, median, max, pattern)
 * - Form-opened evidence note (strictly labelled: evidence only, never triggers)
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
          <h2 id="heading-why" class="card-title">
            <span aria-hidden="true">💡</span> 5. Why Card (Explainability)
          </h2>
          <p class="card-subtitle">
            Deterministic decision path, window thresholds, and submission pacing evidence.
          </p>
        </div>
        <div class="header-actions">
          <span id="why-session-badge" class="badge badge-neutral">—</span>
          <span id="why-decision-badge" class="badge badge-neutral">—</span>
        </div>
      </div>
      <div class="card-body">
        <div class="why-card-layout">
          <!-- Plain-English Reason -->
          <div class="why-block">
            <h3 class="why-heading">Decision Explanation</h3>
            <p id="why-reason-text" class="why-reason-text">
              Load a scenario, then select a session to inspect.
            </p>
            <p id="why-other-window-text" class="why-subtext"></p>

            <div class="decision-path-box">
              <span class="path-label">Decision Path:</span>
              <span id="why-decision-path" class="path-value">—</span>
            </div>
          </div>

          <!-- Recent Requests Timeline -->
          <div class="why-block">
            <div class="table-section-header" style="margin-bottom: 0.25rem;">
              <h3 class="why-heading">Recent Requests Timeline</h3>
              <span id="why-timeline-count" class="field-hint">0 events</span>
            </div>
            <div id="why-timeline-container" class="timeline-scroll-container" role="region" aria-label="Requests Timeline Diagram">
              <p class="field-hint" style="margin: auto;">Timeline will appear once a session is selected.</p>
            </div>
          </div>

          <!-- Decision Evidence (Gap + Form Opened) -->
          <div class="why-block evidence-block">
            <h3 class="why-heading">Decision Evidence</h3>
            <div class="evidence-grid">
              <div class="evidence-item">
                <span class="evidence-label">Submission Pacing Gaps:</span>
                <p id="why-gap-evidence" class="evidence-value">—</p>
              </div>
              <div class="evidence-item">
                <span class="evidence-label">Form opened (evidence only):</span>
                <p id="why-form-opened" class="evidence-value">—</p>
              </div>
            </div>
            <p class="field-hint evidence-note">
              Evidence only. Explains a decision and never triggers one.
            </p>
          </div>
        </div>
        <p class="caption-simulated">Simulated fictional data · Zero browser fingerprinting</p>
      </div>
    `;
  }

  function render(state) {
    if (!rootEl) return;

    const selectedId = state.selectedSessionId;
    const sessionBadge = rootEl.querySelector('#why-session-badge');
    const decisionBadge = rootEl.querySelector('#why-decision-badge');
    const reasonText = rootEl.querySelector('#why-reason-text');
    const otherWindowText = rootEl.querySelector('#why-other-window-text');
    const decisionPath = rootEl.querySelector('#why-decision-path');
    const timelineContainer = rootEl.querySelector('#why-timeline-container');
    const timelineCount = rootEl.querySelector('#why-timeline-count');
    const gapEvidence = rootEl.querySelector('#why-gap-evidence');
    const formOpened = rootEl.querySelector('#why-form-opened');

    if (!selectedId || !state.sessions || state.sessions.length === 0) {
      if (sessionBadge) { sessionBadge.className = 'badge badge-neutral'; sessionBadge.textContent = '—'; }
      if (decisionBadge) { decisionBadge.className = 'badge badge-neutral'; decisionBadge.textContent = '—'; }
      if (reasonText) reasonText.textContent = 'Load a scenario, then select a session to inspect.';
      if (otherWindowText) otherWindowText.textContent = '';
      if (decisionPath) decisionPath.textContent = '—';
      if (timelineContainer) timelineContainer.innerHTML = '<p class="field-hint" style="margin: auto;">Timeline will appear once a session is selected.</p>';
      if (timelineCount) timelineCount.textContent = '0 events';
      if (gapEvidence) gapEvidence.textContent = '—';
      if (formOpened) formOpened.textContent = '—';
      return;
    }

    const sessionObj = state.sessions.find((s) => s.session === selectedId || s.sessionId === selectedId);
    if (!sessionObj) return;

    const sId = sessionObj.sessionId || sessionObj.session;
    const dec = sessionObj.decision || 'Allow';

    // Header Badges
    if (sessionBadge) {
      sessionBadge.className = 'badge badge-neutral';
      sessionBadge.textContent = sId;
    }
    if (decisionBadge) {
      decisionBadge.className = dec === 'Slow' ? 'badge badge-slow' : (dec === 'Warn' ? 'badge badge-warn' : 'badge badge-allow');
      decisionBadge.textContent = dec;
    }

    // Reason Text
    if (reasonText) {
      reasonText.textContent = sessionObj.reason || 'All sliding window counts remain under Warn thresholds.';
    }

    // Other Window Context
    if (otherWindowText) {
      const shortCount = sessionObj.shortCount !== undefined ? sessionObj.shortCount : (sessionObj.shortWindowCount || 0);
      const longCount = sessionObj.longCount !== undefined ? sessionObj.longCount : (sessionObj.longWindowCount || 0);
      otherWindowText.textContent = `Counts at decision: 5s window = ${shortCount} (Warn: 4, Slow: 8) · 60s window = ${longCount} (Warn: 11, Slow: 20).`;
    }

    // Decision Path Flowchart
    if (decisionPath) {
      if (dec === 'Slow') {
        const winFired = sessionObj.window || sessionObj.windowFired || 'Short (5s)';
        decisionPath.innerHTML = `Arrival ➜ Grace Check (OK) ➜ Count Threshold (${winFired} Slow) ➜ Slow Lane (+${sessionObj.pacingDelay || sessionObj.currentDelaySeconds || 2}s) ➜ <strong style="color:#f97316;">SLOW</strong>`;
      } else if (dec === 'Warn') {
        const winFired = sessionObj.window || sessionObj.windowFired || 'Short (5s)';
        decisionPath.innerHTML = `Arrival ➜ Grace Check (OK) ➜ Count Threshold (${winFired} Warn) ➜ Advising (0s delay) ➜ <strong style="color:#fbbf24;">WARN</strong>`;
      } else {
        decisionPath.innerHTML = `Arrival ➜ Grace Check (OK) ➜ Windows Under Warn ➜ Immediate Processing ➜ <strong style="color:#10b981;">ALLOW</strong>`;
      }
    }

    // Recent Requests Dot Timeline
    const events = sessionObj.events || [];
    if (timelineCount) timelineCount.textContent = `${events.length} event(s)`;

    if (timelineContainer) {
      if (events.length === 0) {
        timelineContainer.innerHTML = '<span class="field-hint">No recent events recorded.</span>';
      } else {
        let dotsHtml = '';
        events.forEach((ev, idx) => {
          const t = ev.time !== undefined ? ev.time : (ev.timestamp !== undefined ? ev.timestamp : 0);
          const evDec = ev.decision || dec;
          const colorClass = evDec === 'Slow' ? '#f97316' : (evDec === 'Warn' ? '#f59e0b' : '#10b981');
          dotsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 6px; background: rgba(30,41,59,0.7); border-radius: 6px; border: 1px solid rgba(148,163,184,0.15);">
              <span style="font-size: 10px; font-family: var(--font-mono); color: #94a3b8;">#${idx + 1}</span>
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${colorClass}; display: inline-block;"></span>
              <span style="font-size: 11px; font-weight: 700; color: #f8fafc;">${t.toFixed(1)}s</span>
              <span style="font-size: 9px; text-transform: uppercase; color: ${colorClass};">${ev.method || 'POST'}</span>
            </div>
          `;
        });
        timelineContainer.innerHTML = dotsHtml;
      }
    }

    // Gap Evidence
    const gaps = sessionObj.gapEvidence;
    if (gapEvidence) {
      if (gaps && gaps.count > 0 && gaps.median !== null) {
        gapEvidence.innerHTML = `
          Median: <strong>${gaps.median.toFixed(2)}s</strong> (min: ${gaps.min.toFixed(2)}s, max: ${gaps.max.toFixed(2)}s)<br>
          <span style="color: ${gaps.pattern === 'evenly spaced' ? '#fb923c' : '#38bdf8'}; font-weight: 600;">
            ${gaps.pattern === 'evenly spaced' ? '⚡ Evenly spaced (mechanical bot signature)' : '👤 Irregular human scatter'}
          </span>
        `;
      } else {
        gapEvidence.textContent = 'Single submission (insufficient gap history)';
      }
    }

    // Form opened
    if (formOpened) {
      const isOpened = sessionObj.formOpened !== undefined ? sessionObj.formOpened : sessionObj.formOpenedEvidence;
      if (isOpened === false) {
        formOpened.innerHTML = '<span style="color: #fb923c; font-weight: 700;">No (direct script POST without GET)</span>';
      } else {
        formOpened.innerHTML = '<span style="color: #34d399; font-weight: 700;">Yes (standard browser navigation)</span>';
      }
    }
  }

  const panel = { mount, render };
  global.WhyCardPanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
