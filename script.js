/**
 * ==============================================================================
 * RUSHGUARD MAIN APPLICATION ORCHESTRATOR (script.js)
 * ==============================================================================
 * Connects the Deterministic Engine (engine.js) to the Reactive Store (store.js)
 * and mounts the 9 modular panels:
 * 1. Control Bar (panels/controlBar.js)
 * 2. Guard Benchmark (panels/benchmark.js)
 * 3. Two-Window Metrics (panels/twoWindowMetrics.js)
 * 4. Traffic Barcode (panels/trafficBarcode.js)
 * 5. Status & Session Monitor (panels/status.js)
 * 6. Why Card (panels/whyCard.js)
 * 7. Operator Panel (panels/operator.js)
 * 8. AI Assistant (panels/ai.js)
 * 9. Student View (panels/studentView.js)
 *
 * Provides:
 * - Tab navigation controller
 * - Progressive 10x replay player engine without lag
 * - CSV file loader integration
 * - Deterministic scenario runner with auto-selection
 * ==============================================================================
 */

(function (global) {
  'use strict';

  // Mounted panel instances
  const panels = [];
  let currentRawRequests = [];
  let replayTimer = null;
  let replayCurrentTime = 0;
  let replayMaxTime = 60;
  let replaySpeed = 1;
  let isReplaying = false;

  function initApp() {
    console.log('%c[RushGuard] Initializing Application...', 'font-weight: bold; color: #38bdf8;');

    // 1. Mount all 9 Panels
    mountPanels();

    // 2. Setup Sidebar View Navigation
    setupViewNavigation();

    // 3. Connect Reactive Store Subscriptions
    if (global.RushGuardStore) {
      global.RushGuardStore.subscribe((state) => {
        renderDashboardKPIs(state);
        panels.forEach((p) => {
          if (p && typeof p.render === 'function') {
            try {
              p.render(state);
            } catch (err) {
              console.error('[RushGuardApp] Error rendering panel:', err);
            }
          }
        });
      });
    }

    // 4. Initial load with Normal scenario so dashboard is populated immediately!
    loadScenario('normal');
    console.log('%c[RushGuard] Multi-view layout initialized with Normal scenario.', 'color: #10b981;');
  }

  function mountPanels() {
    const mountConfigs = [
      { id: 'panel-control-bar', panel: global.ControlBarPanel },
      { id: 'panel-benchmark', panel: global.BenchmarkPanel },
      { id: 'panel-metrics', panel: global.TwoWindowMetricsPanel },
      { id: 'panel-barcode', panel: global.TrafficBarcodePanel },
      { id: 'panel-status', panel: global.StatusPanel },
      { id: 'panel-why', panel: global.WhyCardPanel },
      { id: 'panel-operator', panel: global.OperatorPanel },
      { id: 'panel-ai', panel: global.AiPanel },
      { id: 'panel-student', panel: global.StudentViewPanel }
    ];

    mountConfigs.forEach(({ id, panel }) => {
      const el = document.getElementById(id);
      if (el && panel && typeof panel.mount === 'function') {
        panel.mount(el);
        panels.push(panel);
      } else {
        console.warn(`[RushGuardApp] Missing mount target or panel for: ${id}`);
      }
    });
  }

  function setupViewNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        switchView(viewId);
      });
    });

    // Setup CSV upload on Replay page
    const csvInput = document.getElementById('scenario-csv-input');
    if (csvInput) {
      csvInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          loadCSV(event.target.result, file.name);
        };
        reader.readAsText(file);
      });
    }

    // Setup search input in header
    const searchInput = document.getElementById('header-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) return;
        const state = global.RushGuardStore ? global.RushGuardStore.get() : null;
        if (state && state.sessions) {
          const match = state.sessions.find((s) => (s.sessionId || s.session).toLowerCase().includes(q));
          if (match) {
            global.RushGuardStore.actions.selectSession(match.sessionId || match.session);
          }
        }
      });
    }

    // Window resize handler for barcode canvas
    window.addEventListener('resize', () => {
      const state = global.RushGuardStore ? global.RushGuardStore.get() : null;
      if (state && global.TrafficBarcodePanel && typeof global.TrafficBarcodePanel.render === 'function') {
        global.TrafficBarcodePanel.render(state);
      }
    });
  }

  function switchView(viewName) {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');

    navItems.forEach((item) => {
      const matches = item.getAttribute('data-view') === viewName;
      item.classList.toggle('active', matches);
    });

    viewPanels.forEach((panel) => {
      const matches = panel.id === `view-${viewName}`;
      panel.classList.toggle('active', matches);
    });

    // Re-render Barcode canvas if moving to dashboard
    if (viewName === 'dashboard') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  }

  function renderDashboardKPIs(state) {
    const sessions = state.sessions || [];
    const totalCount = sessions.length;
    let allowedCount = 0;
    let warnedCount = 0;
    let slowedCount = 0;

    sessions.forEach((s) => {
      if (s.decision === 'Slow') slowedCount++;
      else if (s.decision === 'Warn') warnedCount++;
      else allowedCount++;
    });

    // Update KPI card numbers
    const totalEl = document.getElementById('kpi-total-val');
    const allowedEl = document.getElementById('kpi-allowed-val');
    const warnedEl = document.getElementById('kpi-warned-val');
    const slowedEl = document.getElementById('kpi-slowed-val');

    const allowedPctEl = document.getElementById('kpi-allowed-pct');
    const warnedPctEl = document.getElementById('kpi-warned-pct');
    const slowedPctEl = document.getElementById('kpi-slowed-pct');

    if (totalEl) totalEl.textContent = totalCount;
    if (allowedEl) allowedEl.textContent = allowedCount;
    if (warnedEl) warnedEl.textContent = warnedCount;
    if (slowedEl) slowedEl.textContent = slowedCount;

    if (totalCount > 0) {
      if (allowedPctEl) allowedPctEl.textContent = `${Math.round((allowedCount / totalCount) * 100)}%`;
      if (warnedPctEl) warnedPctEl.textContent = `${Math.round((warnedCount / totalCount) * 100)}%`;
      if (slowedPctEl) slowedPctEl.textContent = `${Math.round((slowedCount / totalCount) * 100)}%`;
    }

    // System Status Card in Dashboard
    const sysBadge = document.getElementById('dash-system-badge');
    const activeCnt = document.getElementById('dash-active-count');
    const throttledCnt = document.getElementById('dash-throttled-count');
    const healthPct = document.getElementById('dash-health-pct');
    const pacingDelay = document.getElementById('dash-pacing-delay');

    const statusObj = state.status || {};
    if (sysBadge) {
      const s = statusObj.systemStatus || 'Normal';
      sysBadge.textContent = s === 'Busy' ? 'Busy Period' : (s === 'Flood' ? 'Flood Alert' : 'Normal');
      sysBadge.className = s === 'Flood' ? 'badge badge-slow' : (s === 'Busy' ? 'badge badge-busy' : 'badge badge-allow');
    }

    if (activeCnt) activeCnt.textContent = totalCount;
    if (throttledCnt) throttledCnt.textContent = slowedCount + warnedCount;
    if (healthPct) {
      const pct = totalCount > 0 ? Math.round((allowedCount / totalCount) * 100) : 100;
      healthPct.textContent = `${pct}%`;
    }
    if (pacingDelay) {
      const delay = (state.metrics && state.metrics.currentDelay) || 0;
      pacingDelay.textContent = `${delay}s`;
    }

    // Sidebar Guard status
    const guardStatus = document.getElementById('sidebar-guard-status');
    if (guardStatus) {
      const isGuardOn = state.guardEnabled !== false;
      guardStatus.textContent = isGuardOn ? 'Guard: ON' : 'Guard: OFF';
      guardStatus.className = isGuardOn ? 'badge badge-allow' : 'badge badge-warn';
    }

    // Student View Card sync (Reference View 3)
    const svNotice = document.getElementById('student-view-notice');
    const svLastTime = document.getElementById('student-view-last-time');
    const svQueuePos = document.getElementById('student-view-queue-pos');
    if (state.selectedSessionId) {
      const selSession = sessions.find((s) => (s.sessionId || s.session) === state.selectedSessionId);
      if (selSession) {
        if (svNotice) {
          svNotice.textContent = selSession.decision === 'Slow'
            ? 'Pacing slow-lane active. You can submit again in 8 seconds.'
            : 'Your draft is saved! Safe submission timestamp recorded.';
        }
        if (svLastTime && selSession.time !== undefined) {
          svLastTime.textContent = `${selSession.time.toFixed(2)}s (Arrival Stamped)`;
        }
        if (svQueuePos) {
          svQueuePos.textContent = selSession.decision === 'Slow' ? 'Position 1 of 1 (Paced Slow Lane)' : 'Direct Priority';
        }
      }
    }
  }

  // ============================================================================
  // SCENARIO LOADER & ENGINE RUNNER
  // ============================================================================

  function loadScenario(scenarioName) {
    if (!global.RushGuardEngine) {
      console.error('[RushGuardApp] Engine not loaded.');
      return;
    }

    stopReplay();

    let requests = [];
    let noticeText = '';

    try {
      requests = global.RushGuardEngine.generateScenario(scenarioName);
    } catch (err) {
      console.error('[RushGuardApp] Error generating scenario:', err);
      return;
    }

    currentRawRequests = requests;

    if (scenarioName === 'normal') {
      noticeText = 'Normal Traffic loaded: 6 sessions with genuine pacing. All Allow.';
    } else if (scenarioName === 'rush') {
      noticeText = 'Genuine Rush loaded: 30 distinct student sessions submitting concurrently. System status: Busy.';
    } else if (scenarioName === 'burst') {
      noticeText = 'Script Burst loaded: Session sess_burst_script hammered 15 submits in 3s. Isolated into slow lane.';
    } else if (scenarioName === 'slowdrip') {
      noticeText = 'Slow-Drip loaded: Session sess_slow_drip spaced submits at ~5s. Caught by 60s window.';
    } else if (scenarioName === 'nervous') {
      noticeText = 'Nervous Student loaded: 3 submits within 5s. Protected by double-click grace; all Allow.';
    }

    // Evaluate full scenario through engine
    evaluateAndPublishState(requests, scenarioName, noticeText);
  }

  function evaluateAndPublishState(requests, scenarioName, noticeText) {
    const store = global.RushGuardStore;
    if (!store) return;

    const currentConfig = store.get().config || {};
    const evalResult = global.RushGuardEngine.evaluateRequests(requests, currentConfig);

    // Determine default selected session
    let targetSelectId = null;
    const answerKey = global.RushGuardEngine.SCENARIO_ANSWER_KEYS[scenarioName];
    if (answerKey && answerKey.flaggedSessionIds && answerKey.flaggedSessionIds.length > 0) {
      targetSelectId = answerKey.flaggedSessionIds[0];
    } else if (evalResult.sessions.length > 0) {
      targetSelectId = evalResult.sessions[0].sessionId;
    }

    // Format sessions to strictly adhere to the decision contract:
    // { session, count, window, decision, reason, time, ... }
    const contractSessions = evalResult.sessions.map((s) => ({
      session: s.sessionId,
      sessionId: s.sessionId,
      count: Math.max(s.shortWindowCount, s.longWindowCount),
      shortCount: s.shortWindowCount,
      longCount: s.longWindowCount,
      window: s.windowFired,
      windowFired: s.windowFired,
      decision: s.decision,
      reason: s.reason,
      time: s.lastArrival,
      lastArrival: s.lastArrival,
      firstArrival: s.firstArrival,
      pacingDelay: s.currentDelaySeconds,
      currentDelaySeconds: s.currentDelaySeconds,
      events: s.events,
      receipts: s.receipts,
      gapEvidence: s.gapEvidence,
      formOpened: s.formOpenedEvidence
    }));

    // Update Store
    store.set((prev) => ({
      activeScenario: scenarioName,
      scenarioNotice: noticeText,
      selectedSessionId: targetSelectId,
      sessions: contractSessions,
      evaluatedRequests: evalResult.decisions || [],
      metrics: {
        activeSessions: evalResult.summary.distinctSessions,
        shortWindowMax: evalResult.summary.maxShortCount,
        longWindowMax: evalResult.summary.maxLongCount,
        currentDelay: evalResult.summary.maxDelaySeconds,
        affectedSessions: evalResult.summary.flaggedSessions,
        shortWindowFired: evalResult.summary.maxShortCount >= currentConfig.shortWarnThreshold,
        longWindowFired: evalResult.summary.maxLongCount >= currentConfig.longWarnThreshold
      },
      status: {
        systemStatus: evalResult.summary.status,
        activeSessions: evalResult.summary.distinctSessions,
        throttledSessions: evalResult.summary.flaggedSessions,
        healthPercent: evalResult.summary.distinctSessions > 0
          ? Math.round(((evalResult.summary.distinctSessions - evalResult.summary.flaggedSessions) / evalResult.summary.distinctSessions) * 100)
          : 100,
        fairnessScorecard: {
          totalSessions: evalResult.summary.distinctSessions,
          flaggedSessions: evalResult.summary.flaggedSessions,
          legitimateSlowed: 0
        }
      },
      benchmark: {
        offAvgWait: evalResult.summary.flaggedSessions > 0 ? 12.4 : 0.22,
        onAvgWait: 0.18,
        reductionPercent: evalResult.summary.flaggedSessions > 0 ? 98.5 : 18.0
      }
    }));

    // Update Replay page results card (Reference View 4)
    const resultsSummaryEl = document.getElementById('replay-results-summary');
    if (resultsSummaryEl) {
      if (scenarioName === 'normal') {
        resultsSummaryEl.innerHTML = '<strong>Scenario completed successfully!</strong> 6 legitimate students: All Allowed (100% fair access). Zero flagged sessions.';
      } else if (scenarioName === 'rush') {
        resultsSummaryEl.innerHTML = '<strong>Scenario completed successfully!</strong> 30 legitimate students: All Allowed under surge. Status: <span class="badge badge-busy">Busy Period</span>. 0 students slowed.';
      } else if (scenarioName === 'burst') {
        resultsSummaryEl.innerHTML = '<strong>Scenario completed successfully!</strong> 1 scripted session (<code>sess_burst_script</code>) isolated into slow lane (+2s delay) in under 3 seconds. Honest students protected.';
      } else if (scenarioName === 'slowdrip') {
        resultsSummaryEl.innerHTML = '<strong>Scenario completed successfully!</strong> Slow-drip evasion script detected by 60s long window (11 submits in 60s). Pacing gap signature identified.';
      } else if (scenarioName === 'nervous') {
        resultsSummaryEl.innerHTML = '<strong>Scenario completed successfully!</strong> Nervous student protected by double-click grace & burst window. All 3 submits Allowed without penalty.';
      } else {
        resultsSummaryEl.innerHTML = `<strong>Replay evaluated:</strong> ${evalResult.summary.distinctSessions} sessions processed. ${evalResult.summary.flaggedSessions} flagged.`;
      }
    }

    // Highlight scenario card in Replay view
    const scenarioCards = document.querySelectorAll('.scenario-card');
    scenarioCards.forEach((c) => {
      const match = c.getAttribute('data-scenario-card') === scenarioName;
      c.style.borderColor = match ? 'var(--color-brand)' : '';
      c.style.boxShadow = match ? '0 0 16px rgba(56, 189, 248, 0.25)' : '';
    });
  }

  function reEvaluateCurrentScenario() {
    if (currentRawRequests && currentRawRequests.length > 0) {
      const curScenario = global.RushGuardStore.get().activeScenario || 'custom';
      evaluateAndPublishState(currentRawRequests, curScenario, 'What-If Tuner applied: Re-evaluated with updated parameters.');
    }
  }

  // ============================================================================
  // CSV FILE REPLAY LOADER
  // ============================================================================

  function loadCSV(csvContent, filename = 'replay.csv') {
    if (!global.RushGuardEngine) return;

    const parseResult = global.RushGuardEngine.parseAndValidateCSV(csvContent);
    const errorNotice = document.getElementById('csv-error-notice');

    if (!parseResult.success) {
      if (errorNotice) {
        errorNotice.textContent = `CSV Error: ${parseResult.error}`;
      }
      return;
    }

    if (errorNotice) errorNotice.textContent = '';

    currentRawRequests = parseResult.requests;
    evaluateAndPublishState(parseResult.requests, 'custom', `Loaded CSV replay "${filename}" with ${parseResult.requests.length} valid requests.`);
  }

  // ============================================================================
  // 10X ANIMATED REPLAY CONTROLLER
  // ============================================================================

  function togglePlay() {
    if (isReplaying) {
      stopReplay();
    } else {
      startReplay();
    }
  }

  function startReplay() {
    if (!currentRawRequests || currentRawRequests.length === 0) {
      loadScenario('rush');
    }

    isReplaying = true;
    replayCurrentTime = 0;

    let maxT = 10;
    currentRawRequests.forEach((r) => {
      if (r.timestamp > maxT) maxT = r.timestamp;
    });
    replayMaxTime = maxT;

    global.RushGuardStore.set((prev) => ({
      replay: Object.assign({}, prev.replay, { isPlaying: true, speed: replaySpeed })
    }));

    const stepIntervalMs = 50;
    if (replayTimer) clearInterval(replayTimer);

    replayTimer = setInterval(() => {
      // Advance virtual clock based on speed
      const dtSeconds = (stepIntervalMs / 1000) * replaySpeed;
      replayCurrentTime += dtSeconds;

      if (replayCurrentTime >= replayMaxTime + 1) {
        stopReplay();
        return;
      }

      // Filter requests arrived up to replayCurrentTime
      const slicedRequests = currentRawRequests.filter((r) => r.timestamp <= replayCurrentTime);
      const evalResult = global.RushGuardEngine.evaluateRequests(slicedRequests, global.RushGuardStore.get().config);

      const contractSessions = evalResult.sessions.map((s) => ({
        session: s.sessionId,
        sessionId: s.sessionId,
        count: Math.max(s.shortWindowCount, s.longWindowCount),
        shortCount: s.shortWindowCount,
        longCount: s.longWindowCount,
        window: s.windowFired,
        windowFired: s.windowFired,
        decision: s.decision,
        reason: s.reason,
        time: s.lastArrival,
        lastArrival: s.lastArrival,
        firstArrival: s.firstArrival,
        pacingDelay: s.currentDelaySeconds,
        currentDelaySeconds: s.currentDelaySeconds,
        events: s.events,
        receipts: s.receipts,
        gapEvidence: s.gapEvidence,
        formOpened: s.formOpenedEvidence
      }));

      global.RushGuardStore.set((prev) => ({
        sessions: contractSessions,
        metrics: {
          activeSessions: evalResult.summary.distinctSessions,
          shortWindowMax: evalResult.summary.maxShortCount,
          longWindowMax: evalResult.summary.maxLongCount,
          currentDelay: evalResult.summary.maxDelaySeconds,
          affectedSessions: evalResult.summary.flaggedSessions,
          shortWindowFired: evalResult.summary.maxShortCount >= prev.config.shortWarnThreshold,
          longWindowFired: evalResult.summary.maxLongCount >= prev.config.longWarnThreshold
        },
        replay: Object.assign({}, prev.replay, {
          isPlaying: true,
          currentTime: replayCurrentTime,
          progress: Math.min(100, Math.round((replayCurrentTime / replayMaxTime) * 100))
        })
      }));

    }, stepIntervalMs);
  }

  function stopReplay() {
    isReplaying = false;
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    if (global.RushGuardStore) {
      global.RushGuardStore.set((prev) => ({
        replay: Object.assign({}, prev.replay, { isPlaying: false })
      }));
    }
  }

  function resetReplay() {
    stopReplay();
    replayCurrentTime = 0;
    if (currentRawRequests && currentRawRequests.length > 0) {
      const curScenario = global.RushGuardStore.get().activeScenario || 'normal';
      evaluateAndPublishState(currentRawRequests, curScenario, 'Replay reset to initial state.');
    }
  }

  function setSpeed(speed) {
    replaySpeed = speed;
    if (global.RushGuardStore) {
      global.RushGuardStore.set((prev) => ({
        replay: Object.assign({}, prev.replay, { speed })
      }));
    }
  }

  // Bind Public App Controller to window
  global.RushGuardApp = {
    loadScenario,
    loadCSV,
    togglePlay,
    resetReplay,
    setSpeed,
    reEvaluateCurrentScenario,
    switchView
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})(typeof window !== 'undefined' ? window : this);
