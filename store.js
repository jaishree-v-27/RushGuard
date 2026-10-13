/**
 * ==============================================================================
 * RUSHGUARD CENTRAL STATE STORE (store.js)
 * ==============================================================================
 * Single shared reactive state object with subscribe() and set().
 * Provides pure actions: selectSession(id), clear(id), grantAmnesty(id), setMode(m).
 * Adheres strictly to the decision contract:
 * { session, count, window, decision, reason, time }
 * ==============================================================================
 */

(function (global) {
  'use strict';

  // Initial Mock Data (allows testing all panels immediately before engine/replay runs)
  const INITIAL_MOCK_SESSIONS = [
    {
      session: 'sess_norm_01',
      sessionId: 'sess_norm_01',
      count: 1,
      shortCount: 1,
      longCount: 1,
      window: 'None',
      decision: 'Allow',
      reason: '1 submit in 5.0 s (all windows under Warn)',
      time: 2.1,
      pacingDelay: 0,
      events: [{ time: 2.1, method: 'POST', route: '/submit', decision: 'Allow' }],
      receipts: [{ receiptId: 'R-0001', arrivalTime: 2.1, decision: 'Allow', delay: 0 }],
      gapEvidence: { count: 0, min: null, median: null, max: null, pattern: 'single submission' },
      formOpened: true
    },
    {
      session: 'sess_norm_02',
      sessionId: 'sess_norm_02',
      count: 2,
      shortCount: 2,
      longCount: 2,
      window: 'None',
      decision: 'Allow',
      reason: '2 submits in 8.4 s (all windows under Warn)',
      time: 8.4,
      pacingDelay: 0,
      events: [
        { time: 1.2, method: 'POST', route: '/submit', decision: 'Allow' },
        { time: 8.4, method: 'POST', route: '/submit', decision: 'Allow' }
      ],
      receipts: [
        { receiptId: 'R-0002', arrivalTime: 1.2, decision: 'Allow', delay: 0 },
        { receiptId: 'R-0003', arrivalTime: 8.4, decision: 'Allow', delay: 0 }
      ],
      gapEvidence: { count: 1, min: 7.2, median: 7.2, max: 7.2, pattern: 'human scatter' },
      formOpened: true
    }
  ];

  let state = {
    // Current scenario metadata
    activeScenario: null, // null | 'normal' | 'rush' | 'burst' | 'slowdrip' | 'nervous'
    scenarioNotice: 'Choose a scenario to begin.',
    isLoading: false,

    // Selected Session & Role
    selectedSessionId: null,
    operatorMode: 'Manual', // 'Manual' | 'Suggest' | 'Auto'
    currentRole: 'operator', // 'operator' | 'student'

    // Benchmark Mode
    guardEnabled: true,
    benchmark: {
      offAvgWait: 12.4,
      onAvgWait: 0.18,
      reductionPercent: 98.5,
      studentSessionsProtected: 30,
      throttledSessionsIsolated: 1
    },

    // Two-Window Metrics
    metrics: {
      activeSessions: 0,
      shortWindowMax: 0,
      longWindowMax: 0,
      currentDelay: 0,
      affectedSessions: 0,
      shortWindowFired: false,
      longWindowFired: false
    },

    // Status & Fairness
    status: {
      systemStatus: 'Normal', // 'Normal' | 'Busy' | 'Flood'
      activeSessions: 0,
      throttledSessions: 0,
      healthPercent: 100,
      fairnessScorecard: {
        totalSessions: 0,
        flaggedSessions: 0,
        legitimateSlowed: 0,
        summaryText: 'Choose a scenario to begin.'
      }
    },

    // Sessions conforming to decision contract
    sessions: [],

    // Raw evaluated requests for barcode timeline
    evaluatedRequests: [],

    // Replay Player State
    replay: {
      isPlaying: false,
      speed: 1, // 1 | 5 | 10
      currentTime: 0,
      maxTime: 60,
      progress: 0
    },

    // Active Session Amnesty Store: { [sessionId]: expiryTimestamp }
    activeAmnesties: {},

    // Mistake Recovery Audit Log
    auditLog: [
      {
        id: 1,
        time: '12:00:00',
        session: 'SYSTEM',
        rule: 'Init',
        count: 0,
        action: 'System Ready',
        actor: 'Engine',
        note: 'RushGuard monitor initialized.'
      }
    ],

    // AI Assistant Layer
    ai: {
      explanation: 'RushGuard engine is running in deterministic mode. Select a session or run a scenario to inspect.',
      suggestion: null, // { id, session, action, reason, timestamp }
      guardrailNotice: 'AI cannot block users, alter thresholds, or modify counts. All AI suggestions require operator approval in Suggest mode.',
      overturnedCount: 0
    },

    // Active Configuration (editable in What-if tuner)
    config: {
      shortWindowSeconds: 5.0,
      longWindowSeconds: 60.0,
      shortWarnThreshold: 4,
      shortSlowThreshold: 8,
      longWarnThreshold: 11,
      longSlowThreshold: 20,
      doubleClickGraceSeconds: 1.0,
      initialSlowDelaySeconds: 2,
      subsequentSlowDelaySeconds: 4,
      amnestySeconds: 300
    }
  };

  const listeners = new Set();

  function subscribe(listener) {
    if (typeof listener === 'function') {
      listeners.add(listener);
      // Immediately call with current state
      try {
        listener(state);
      } catch (err) {
        console.error('[RushGuardStore] Listener error on subscribe:', err);
      }
    }
    return () => listeners.delete(listener);
  }

  function get() {
    return state;
  }

  function set(updater) {
    const nextPartial = typeof updater === 'function' ? updater(state) : updater;
    state = Object.assign({}, state, nextPartial);
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('[RushGuardStore] Listener execution error:', err);
      }
    });
  }

  // ============================================================================
  // PURE ACTIONS (Buttons & UI components call ONLY these actions)
  // ============================================================================

  function selectSession(sessionId) {
    if (state.selectedSessionId === sessionId) return;
    set({ selectedSessionId: sessionId });
  }

  function setMode(mode) {
    if (['Manual', 'Suggest', 'Auto'].includes(mode)) {
      set({ operatorMode: mode });
      // When switching to Auto, if there's a pending suggestion, auto-apply it
      if (mode === 'Auto' && state.ai.suggestion && !state.ai.suggestion.approved) {
        approveAISuggestion(state.ai.suggestion.id, 'AI Operator (Auto)');
      }
    }
  }

  function setRole(role) {
    if (['operator', 'student'].includes(role)) {
      set({ currentRole: role });
    }
  }

  function toggleGuard() {
    set((prev) => ({ guardEnabled: !prev.guardEnabled }));
  }

  function clear(sessionId, note = 'Manual operator reset') {
    if (!sessionId) return;
    const sessionObj = state.sessions.find((s) => s.session === sessionId || s.sessionId === sessionId);
    if (!sessionObj) return;

    // Clear session in current list
    const updatedSessions = state.sessions.map((s) => {
      if (s.session === sessionId || s.sessionId === sessionId) {
        return Object.assign({}, s, {
          decision: 'Allow',
          pacingDelay: 0,
          currentDelaySeconds: 0,
          reason: 'Cleared by operator: counts and delay reset to 0'
        });
      }
      return s;
    });

    const newAuditEntry = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      session: sessionId,
      rule: sessionObj.window || 'Manual',
      count: sessionObj.count || 0,
      action: 'Clear',
      actor: state.operatorMode === 'Auto' ? 'AI Operator' : 'Human Operator',
      note: note || 'Session delay and counts cleared.'
    };

    set((prev) => ({
      sessions: updatedSessions,
      auditLog: [newAuditEntry, ...prev.auditLog]
    }));
  }

  function grantAmnesty(sessionId, note = '5-minute temporary amnesty') {
    if (!sessionId) return;
    const sessionObj = state.sessions.find((s) => s.session === sessionId || s.sessionId === sessionId);
    if (!sessionObj) return;

    const expiryTime = Date.now() + 300 * 1000; // 5 minutes

    const updatedSessions = state.sessions.map((s) => {
      if (s.session === sessionId || s.sessionId === sessionId) {
        return Object.assign({}, s, {
          decision: 'Allow',
          pacingDelay: 0,
          currentDelaySeconds: 0,
          reason: 'Under 5-minute amnesty: requests counted, cannot trigger Slow'
        });
      }
      return s;
    });

    const newAuditEntry = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      session: sessionId,
      rule: sessionObj.window || 'Short (5s)',
      count: sessionObj.count || 0,
      action: 'Grant Amnesty (5 min)',
      actor: state.operatorMode === 'Auto' ? 'AI Operator' : 'Human Operator',
      note: note || 'Granted 5-minute amnesty window.'
    };

    set((prev) => ({
      sessions: updatedSessions,
      activeAmnesties: Object.assign({}, prev.activeAmnesties, { [sessionId]: expiryTime }),
      auditLog: [newAuditEntry, ...prev.auditLog]
    }));
  }

  function approveAISuggestion(suggestionId, actor = 'Human Operator') {
    const suggestion = state.ai.suggestion;
    if (!suggestion || suggestion.id !== suggestionId) return;

    if (suggestion.action === 'Grant Amnesty') {
      grantAmnesty(suggestion.session, `AI Recommended: ${suggestion.reason}`);
    } else if (suggestion.action === 'Clear') {
      clear(suggestion.session, `AI Recommended: ${suggestion.reason}`);
    }

    set((prev) => ({
      ai: Object.assign({}, prev.ai, {
        suggestion: null,
        explanation: `${prev.ai.explanation} (Action applied by ${actor})`
      })
    }));
  }

  function updateConfig(newConfigPartial) {
    set((prev) => ({
      config: Object.assign({}, prev.config, newConfigPartial)
    }));
  }

  // Bind to global window object
  global.RushGuardStore = {
    get,
    set,
    subscribe,
    actions: {
      selectSession,
      clear,
      grantAmnesty,
      setMode,
      setRole,
      toggleGuard,
      approveAISuggestion,
      updateConfig
    }
  };

})(typeof window !== 'undefined' ? window : this);
