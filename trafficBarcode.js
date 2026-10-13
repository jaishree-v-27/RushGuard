/**
 * ==============================================================================
 * PANEL 4: TRAFFIC BARCODE (panels/trafficBarcode.js) - HERO VISUALIZER
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Buttons call actions ONLY via RushGuardStore.actions.selectSession(id).
 * Features:
 * - One row per session, dot per submit placed along time axis
 * - Color-coded by decision (Allow: Green, Warn: Amber, Slow: Orange)
 * - Visual Patterns:
 *     * Flood: Dense solid line on 1 row, transitioning Green -> Amber -> Orange
 *     * Rush: Scattered green dots across 30 rows
 *     * Slow-drip: Evenly spaced dots on 1 row
 * - Interactive: Hover shows timestamp & decision tooltip; Click selects session
 * - High-DPI canvas rendering for smooth performance with 30+ sessions
 * ==============================================================================
 */

(function (global) {
  'use strict';

  let rootEl = null;
  let canvasEl = null;
  let ctx = null;
  let tooltipEl = null;
  let currentSessionsData = [];
  let currentSelectedId = null;
  let hoveredEvent = null;

  function mount(el) {
    if (!el) return;
    rootEl = el;

    rootEl.innerHTML = `
      <div class="card-header">
        <div class="header-titles">
          <h2 id="heading-barcode" class="card-title">
            <span aria-hidden="true">📊</span> 3. Traffic Barcode (Hero Visualizer)
          </h2>
          <p class="card-subtitle">
            Temporal visualizer: one row per session. Click any row to inspect its decision path.
          </p>
        </div>
        <div class="header-actions">
          <div class="barcode-legend" role="group" aria-label="Barcode Decision Legend">
            <span class="legend-item"><span class="legend-dot allow"></span> Allow</span>
            <span class="legend-item"><span class="legend-dot warn"></span> Warn</span>
            <span class="legend-item"><span class="legend-dot slow"></span> Slow</span>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="barcode-container">
          <div class="barcode-canvas-wrapper" id="barcode-canvas-wrapper" tabindex="0" role="region" aria-label="Interactive Traffic Barcode Chart">
            <canvas id="rushguard-barcode-canvas"></canvas>
            <div id="barcode-tooltip" class="visually-hidden" role="tooltip"></div>
          </div>
          <div class="barcode-controls">
            <span class="field-hint" id="barcode-session-counter">0 sessions tracked</span>
            <span class="field-hint">💡 Visual pattern: Rush = scattered dots · Flood = solid bar · Slow-drip = evenly spaced</span>
          </div>
        </div>
      </div>
    `;

    canvasEl = rootEl.querySelector('#rushguard-barcode-canvas');
    tooltipEl = rootEl.querySelector('#barcode-tooltip');
    if (canvasEl) {
      ctx = canvasEl.getContext('2d');
      setupCanvasInteractions();
    }
  }

  function setupCanvasInteractions() {
    if (!canvasEl) return;

    canvasEl.addEventListener('click', (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const rowHeight = 24;
      const topPadding = 30;

      const rowIndex = Math.floor((clickY - topPadding) / rowHeight);
      if (rowIndex >= 0 && rowIndex < currentSessionsData.length) {
        const clickedSession = currentSessionsData[rowIndex];
        if (clickedSession) {
          global.RushGuardStore.actions.selectSession(clickedSession.sessionId || clickedSession.session);
        }
      }
    });

    canvasEl.addEventListener('mousemove', (e) => {
      handleCanvasMouseMove(e);
    });

    canvasEl.addEventListener('mouseleave', () => {
      if (tooltipEl) {
        tooltipEl.className = 'visually-hidden';
      }
      hoveredEvent = null;
    });
  }

  function handleCanvasMouseMove(e) {
    if (!canvasEl || !tooltipEl || currentSessionsData.length === 0) return;

    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const labelWidth = 140;
    const rowHeight = 24;
    const topPadding = 30;
    const chartWidth = rect.width - labelWidth - 20;

    let maxTime = 60;
    currentSessionsData.forEach((s) => {
      if (s.events) {
        s.events.forEach((ev) => {
          if (ev.time > maxTime) maxTime = ev.time;
          if (ev.timestamp > maxTime) maxTime = ev.timestamp;
        });
      }
    });
    if (maxTime <= 0) maxTime = 60;

    let foundDot = null;

    currentSessionsData.forEach((session, rIndex) => {
      const rowY = topPadding + rIndex * rowHeight + rowHeight / 2;
      const events = session.events || [];

      events.forEach((ev) => {
        const t = ev.time !== undefined ? ev.time : ev.timestamp;
        const dotX = labelWidth + (t / maxTime) * chartWidth;
        const dist = Math.hypot(mouseX - dotX, mouseY - rowY);

        if (dist <= 7) {
          foundDot = {
            session: session.sessionId || session.session,
            time: t,
            method: ev.method || 'POST',
            decision: ev.decision || session.decision || 'Allow',
            x: e.clientX,
            y: e.clientY
          };
        }
      });
    });

    if (foundDot) {
      tooltipEl.className = 'barcode-hover-tooltip';
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.left = `${foundDot.x + 12}px`;
      tooltipEl.style.top = `${foundDot.y + 12}px`;
      tooltipEl.style.background = '#0f172a';
      tooltipEl.style.border = '1px solid #38bdf8';
      tooltipEl.style.color = '#f8fafc';
      tooltipEl.style.padding = '6px 10px';
      tooltipEl.style.borderRadius = '6px';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.zIndex = '9999';
      tooltipEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      tooltipEl.innerHTML = `
        <strong>${foundDot.session}</strong><br>
        Arrival: ${foundDot.time.toFixed(2)}s<br>
        Method: ${foundDot.method} · Decision: <strong>${foundDot.decision}</strong>
      `;
    } else {
      tooltipEl.className = 'visually-hidden';
    }
  }

  function render(state) {
    if (!rootEl || !canvasEl || !ctx) return;

    currentSessionsData = state.sessions || [];
    currentSelectedId = state.selectedSessionId;

    const counterEl = rootEl.querySelector('#barcode-session-counter');
    if (counterEl) {
      counterEl.textContent = `${currentSessionsData.length} sessions tracked`;
    }

    drawBarcode();
  }

  function drawBarcode() {
    const wrapper = rootEl.querySelector('#barcode-canvas-wrapper');
    const width = (wrapper && wrapper.clientWidth) ? wrapper.clientWidth : 900;
    const rowHeight = 24;
    const topPadding = 30;
    const bottomPadding = 25;
    const labelWidth = 140;
    const totalSessions = currentSessionsData.length;

    const height = Math.max(220, topPadding + totalSessions * rowHeight + bottomPadding);

    // Adjust canvas for Retina / High-DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    canvasEl.style.width = `${width}px`;
    canvasEl.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, width, height);

    if (totalSessions === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Choose a scenario to render the Traffic Barcode.', width / 2, height / 2);
      return;
    }

    // Determine time range
    let maxTime = 10;
    currentSessionsData.forEach((s) => {
      const evs = s.events || [];
      evs.forEach((ev) => {
        const t = ev.time !== undefined ? ev.time : ev.timestamp;
        if (t > maxTime) maxTime = t;
      });
      if (s.time > maxTime) maxTime = s.time;
    });
    maxTime = Math.ceil(maxTime * 1.08); // Add slight right margin

    const chartWidth = width - labelWidth - 25;

    // 1. Draw Time Ruler Ticks & Vertical Grid Lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';

    const tickInterval = maxTime <= 15 ? 2 : (maxTime <= 40 ? 5 : 10);
    for (let t = 0; t <= maxTime; t += tickInterval) {
      const x = labelWidth + (t / maxTime) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, topPadding - 10);
      ctx.lineTo(x, height - bottomPadding);
      ctx.stroke();

      ctx.fillText(`${t}s`, x, topPadding - 14);
    }

    // 2. Draw Session Rows and Submission Dots
    currentSessionsData.forEach((session, rIndex) => {
      const rowY = topPadding + rIndex * rowHeight;
      const isSelected = (session.sessionId === currentSelectedId || session.session === currentSelectedId);

      // Row background
      if (isSelected) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.fillRect(0, rowY, width, rowHeight);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(0, rowY, 3, rowHeight); // Selection accent indicator
      } else if (rIndex % 2 === 1) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, rowY, width, rowHeight);
      }

      // Track rule
      ctx.strokeStyle = isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(148, 163, 184, 0.08)';
      ctx.beginPath();
      ctx.moveTo(labelWidth, rowY + rowHeight / 2);
      ctx.lineTo(labelWidth + chartWidth, rowY + rowHeight / 2);
      ctx.stroke();

      // Session ID label
      ctx.textAlign = 'left';
      ctx.font = isSelected ? 'bold 11px JetBrains Mono, monospace' : '11px JetBrains Mono, monospace';
      ctx.fillStyle = isSelected ? '#38bdf8' : (session.decision === 'Slow' ? '#fb923c' : (session.decision === 'Warn' ? '#fbbf24' : '#cbd5e1'));

      const sLabel = session.sessionId || session.session;
      const truncatedLabel = sLabel.length > 15 ? sLabel.substring(0, 14) + '…' : sLabel;
      ctx.fillText(truncatedLabel, 10, rowY + rowHeight / 2 + 4);

      // Submission Dots
      const events = session.events || [];
      events.forEach((ev) => {
        const t = ev.time !== undefined ? ev.time : ev.timestamp;
        const dotX = labelWidth + (t / maxTime) * chartWidth;
        const dotY = rowY + rowHeight / 2;

        const decision = ev.decision || session.decision || 'Allow';

        ctx.beginPath();
        if (decision === 'Slow') {
          // Orange ring dot
          ctx.fillStyle = '#f97316';
          ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (decision === 'Warn') {
          // Amber dot
          ctx.fillStyle = '#f59e0b';
          ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Allow: Emerald dot
          ctx.fillStyle = '#10b981';
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
  }

  const panel = { mount, render };
  global.TrafficBarcodePanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
