/**
 * ==============================================================================
 * RUSHGUARD DECISION ENGINE & REPLAY GENERATOR (engine.js)
 * ==============================================================================
 * Pure functional core — Zero DOM access.
 * Strictly adheres to project spec sections 6, 7, 9, 11, 12, 15.
 * Features:
 * 1. Configuration Constants (RUSHGUARD_CONFIG)
 * 2. Deterministic Replay Scenario Generators (Fixed seeds / values)
 * 3. Two-Window Sliding Decision Engine (Per session AND per route)
 * 4. RFC-4180 / Quoted-CSV Parser & Row Validator (5,000 row cap)
 * 5. Explainability Helpers: explainSession & studentMessage
 * 6. Self-Checks Test Suite (Tests 1–6, 2b, 2c, 5b, 7, 7b–7g, 8)
 * ==============================================================================
 */

(function (global) {
  'use strict';

  // ============================================================================
  // 1. CONFIGURATION CONSTANTS (One config object, spec default values)
  // ============================================================================
  const RUSHGUARD_CONFIG = Object.freeze({
    shortWindowSeconds: 5.0,
    longWindowSeconds: 60.0,
    shortWarnThreshold: 4,
    shortSlowThreshold: 8,
    longWarnThreshold: 11,
    longSlowThreshold: 20,
    doubleClickGraceSeconds: 1.0,
    initialSlowDelaySeconds: 2,
    subsequentSlowDelaySeconds: 4,
    amnestySeconds: 300,
    // Assumption: at least 10 distinct student sessions in any 5 s span triggers "Busy" status
    busyThresholdSessions: 10,
    // Assumption: gap differences within 0.1 s are considered evenly spaced
    evenGapToleranceSeconds: 0.1,
    maxCsvRows: 5000,
    decayStepSeconds: 5
  });

  const DECISION_SEVERITY = Object.freeze({
    Allow: 0,
    Warn: 1,
    Slow: 2
  });

  // ============================================================================
  // 2. DETERMINISTIC REPLAY GENERATORS
  // ============================================================================
  const SCENARIO_ANSWER_KEYS = Object.freeze({
    normal: { flaggedSessionIds: [], expectedStatus: 'Normal' },
    rush: { flaggedSessionIds: [], expectedStatus: 'Busy' },
    burst: { flaggedSessionIds: ['sess_burst_script'], expectedStatus: 'Flood' },
    slowdrip: { flaggedSessionIds: ['sess_slow_drip'], expectedStatus: 'Flood' },
    nervous: { flaggedSessionIds: [], expectedStatus: 'Normal' },
    benchflood: { flaggedSessionIds: ['sess_bench_script'], expectedStatus: 'Flood' }
  });

  /**
   * Generates deterministic fictional request lists for each scenario.
   */
  function generateScenario(scenarioName) {
    const route = '/submit-course-reg';
    const requests = [];

    switch (scenarioName) {
      case 'normal': {
        // ~6 sessions, mostly GETs, occasional single POST
        for (let i = 1; i <= 6; i++) {
          const sid = `sess_student_${String(i).padStart(2, '0')}`;
          const baseTime = (i - 1) * 3.5;
          requests.push({ timestamp: baseTime, sessionId: sid, route, method: 'GET', formOpened: 'yes' });
          requests.push({ timestamp: baseTime + 1.2, sessionId: sid, route, method: 'GET', formOpened: 'yes' });
          requests.push({ timestamp: baseTime + 2.4, sessionId: sid, route, method: 'POST', formOpened: 'yes' });
        }
        break;
      }

      case 'rush': {
        // 30 sessions, each 1 POST in a short burst (~4.5 s), plus 3 double-clicks
        for (let i = 1; i <= 30; i++) {
          const sid = `sess_rush_student_${String(i).padStart(2, '0')}`;
          const t = +(0.1 + (i - 1) * 0.14).toFixed(3);
          requests.push({ timestamp: t, sessionId: sid, route, method: 'POST', formOpened: 'yes' });

          // Double clicks on sessions 5, 12, 24 within 0.35s
          if (i === 5 || i === 12 || i === 24) {
            requests.push({ timestamp: +(t + 0.35).toFixed(3), sessionId: sid, route, method: 'POST', formOpened: 'yes' });
          }
        }
        break;
      }

      case 'burst': {
        // 33 student sessions with 1 POST each, plus 1 script session with 17 POSTs in ~3.4 s (34 sessions total)
        // 17 POSTs at 0.20 s gaps deviates from spec's 15 submits so two Slow receipts exist (delays 2 s then 4 s)
        for (let i = 1; i <= 33; i++) {
          const sid = `sess_honest_student_${String(i).padStart(2, '0')}`;
          const t = +(0.2 + (i - 1) * 0.12).toFixed(3);
          requests.push({ timestamp: t, sessionId: sid, route, method: 'POST', formOpened: 'yes' });
        }

        const scriptId = 'sess_burst_script';
        // 17 POSTs at 0.20 s gaps (alternating grace produces 9 counted POSTs, hitting Slow on submit 8 and submit 9)
        for (let k = 0; k < 17; k++) {
          const t = +(0.15 + k * 0.20).toFixed(3);
          requests.push({ timestamp: t, sessionId: scriptId, route, method: 'POST', formOpened: 'no' });
        }
        break;
      }

      case 'slowdrip': {
        // One session POSTing every 5.0 s for 60 s (13 submits), alongside 3 normal students
        const scriptId = 'sess_slow_drip';
        for (let k = 0; k < 13; k++) {
          const t = +(k * 5.0).toFixed(2);
          requests.push({ timestamp: t, sessionId: scriptId, route, method: 'POST', formOpened: 'not recorded' });
        }

        // 3 normal students
        requests.push({ timestamp: 2.0, sessionId: 'sess_student_alice', route, method: 'POST', formOpened: 'yes' });
        requests.push({ timestamp: 18.5, sessionId: 'sess_student_bob', route, method: 'POST', formOpened: 'yes' });
        requests.push({ timestamp: 42.0, sessionId: 'sess_student_carol', route, method: 'POST', formOpened: 'yes' });
        break;
      }

      case 'nervous': {
        // One session with 3 POSTs within 5 s (threshold is 4)
        const sid = 'sess_nervous_student';
        requests.push({ timestamp: 1.0, sessionId: sid, route, method: 'POST', formOpened: 'yes' });
        requests.push({ timestamp: 2.4, sessionId: sid, route, method: 'POST', formOpened: 'yes' });
        requests.push({ timestamp: 3.8, sessionId: sid, route, method: 'POST', formOpened: 'yes' });

        // A couple normal students
        requests.push({ timestamp: 0.5, sessionId: 'sess_student_dan', route, method: 'POST', formOpened: 'yes' });
        requests.push({ timestamp: 4.2, sessionId: 'sess_student_emma', route, method: 'POST', formOpened: 'yes' });
        break;
      }

      case 'benchflood': {
        // Benchmark flood: 5 honest students with 1 POST each, plus 1 script with 80 POSTs at 0.1 s gaps
        for (let i = 1; i <= 5; i++) {
          const sid = `sess_bench_student_${String(i).padStart(2, '0')}`;
          const t = +(0.5 + (i - 1) * 2.0).toFixed(2);
          requests.push({ timestamp: t, sessionId: sid, route, method: 'POST', formOpened: 'yes' });
        }
        const benchScriptId = 'sess_bench_script';
        for (let k = 0; k < 80; k++) {
          const t = +(0.1 + k * 0.1).toFixed(2);
          requests.push({ timestamp: t, sessionId: benchScriptId, route, method: 'POST', formOpened: 'no' });
        }
        break;
      }

      default:
        throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    requests.sort((a, b) => a.timestamp - b.timestamp);
    return requests;
  }

  // ============================================================================
  // 3. TWO-WINDOW DECISION ENGINE (Pure functional evaluation)
  // ============================================================================
  /**
   * Processes a list of requests through the Two-Window Decision Engine.
   * - Counts strictly per session AND per route.
   * - A counted POST absorbs at most ONE duplicate within doubleClickGraceSeconds.
   * - Records firstWarn and firstSlow as { t, count, window }.
   * - Computes gap evidence from ALL POST arrivals of the session.
   */
  function evaluateRequests(requests, customConfig, options) {
    // Backward compat: second arg can be config object or options
    if (customConfig === undefined || customConfig === null) customConfig = {};
    if (options === undefined || options === null) options = {};
    const config = Object.assign({}, RUSHGUARD_CONFIG, customConfig);
    const actions = (options.actions || []).slice().sort(function(a, b) { return a.at - b.at; });
    const asOfTime = options.asOf;

    // Filter requests by asOf if specified
    let filteredRequests = requests.slice();
    if (asOfTime !== undefined) {
      filteredRequests = filteredRequests.filter(function(r) { return r.timestamp <= asOfTime; });
    }
    const sortedRequests = filteredRequests.sort((a, b) => a.timestamp - b.timestamp);

    let totalRequests = sortedRequests.length;
    let getsIgnored = 0;
    let postsCounted = 0;
    let doubleClicksMerged = 0;
    let receiptSequence = 0;

    const sessionMap = new Map();
    const slowReceipts = [];
    const allValidPosts = [];

    sortedRequests.forEach((req) => {
      const { timestamp, sessionId, route = '/', method = 'POST', formOpened } = req;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          sessionId,
          routes: new Map(),
          events: [],
          receipts: [],
          formOpenedEvidence: normalizeFormOpened(formOpened),
          lastArrivalTime: timestamp
        });
      }

      const session = sessionMap.get(sessionId);
      if (timestamp > session.lastArrivalTime) {
        session.lastArrivalTime = timestamp;
      }

      if (session.formOpenedEvidence === 'not recorded' && formOpened) {
        session.formOpenedEvidence = normalizeFormOpened(formOpened);
      }

      // Initialize route state if new
      if (!session.routes.has(route)) {
        session.routes.set(route, {
          route,
          postHistory: [],
          lastCounted: null, // { t, absorbed: boolean, receiptId: string }
          peakCount5s: 0,
          peakCount60s: 0,
          worstDecision: 'Allow',
          windowFired: 'None',
          delaySeconds: 0,
          slowCount: 0,
          firstWarn: null, // { t, count, window }
          firstSlow: null, // { t, count, window }
          reason: 'Normal submission pacing (0 s delay).'
        });
      }

      const routeState = session.routes.get(route);

      // Handle GET requests (logged in events, no receipt, never counted)
      if (method !== 'POST') {
        getsIgnored++;
        session.events.push({
          t: timestamp,
          method: 'GET',
          route,
          kind: 'GET',
          counted: false,
          count5s: routeState.peakCount5s,
          count60s: routeState.peakCount60s,
          decision: routeState.worstDecision,
          windowFired: routeState.windowFired,
          receiptId: null
        });
        return;
      }

      // Check double-click grace:
      // Counted POST can absorb AT MOST ONE duplicate within doubleClickGraceSeconds
      if (
        routeState.lastCounted !== null &&
        (timestamp - routeState.lastCounted.t) <= config.doubleClickGraceSeconds &&
        !routeState.lastCounted.absorbed
      ) {
        doubleClicksMerged++;
        routeState.lastCounted.absorbed = true;
        session.events.push({
          t: timestamp,
          method: 'POST',
          route,
          kind: 'DUPLICATE_MERGED',
          counted: false,
          count5s: routeState.peakCount5s,
          count60s: routeState.peakCount60s,
          decision: routeState.worstDecision,
          windowFired: routeState.windowFired,
          receiptId: routeState.lastCounted.receiptId
        });
        return;
      }

      // Counted POST
      postsCounted++;
      receiptSequence++;
      const receiptId = `R-${String(receiptSequence).padStart(4, '0')}`;

      routeState.postHistory.push(timestamp);
      allValidPosts.push({ timestamp, sessionId });

      // Window counts strictly on THIS route's history: (timestamp - W, timestamp]
      const count5s = routeState.postHistory.filter(
        (t) => t > (timestamp - config.shortWindowSeconds) && t <= timestamp
      ).length;
      const count60s = routeState.postHistory.filter(
        (t) => t > (timestamp - config.longWindowSeconds) && t <= timestamp
      ).length;

      if (count5s > routeState.peakCount5s) routeState.peakCount5s = count5s;
      if (count60s > routeState.peakCount60s) routeState.peakCount60s = count60s;

      // Evaluate decisions for this route submit
      let dec5s = 'Allow';
      if (count5s >= config.shortSlowThreshold) dec5s = 'Slow';
      else if (count5s >= config.shortWarnThreshold) dec5s = 'Warn';

      let dec60s = 'Allow';
      if (count60s >= config.longSlowThreshold) dec60s = 'Slow';
      else if (count60s >= config.longWarnThreshold) dec60s = 'Warn';

      let submitDecision = 'Allow';
      let submitWindow = 'None';
      let submitReason = 'Normal submission pacing (0 s delay).';

      const s5 = DECISION_SEVERITY[dec5s];
      const s60 = DECISION_SEVERITY[dec60s];

      if (s5 >= s60 && s5 > 0) {
        submitDecision = dec5s;
        submitWindow = '5 s';
        const span = (timestamp - (routeState.postHistory[routeState.postHistory.length - count5s] || 0)).toFixed(1);
        submitReason = `${count5s} submits in ${span} s (5 s window, ${dec5s} at ${dec5s === 'Slow' ? config.shortSlowThreshold : config.shortWarnThreshold}).`;
      } else if (s60 > s5) {
        submitDecision = dec60s;
        submitWindow = '60 s';
        const span = (timestamp - (routeState.postHistory[routeState.postHistory.length - count60s] || 0)).toFixed(1);
        submitReason = `${count60s} submits in ${span} s (60 s window, ${dec60s} at ${dec60s === 'Slow' ? config.longSlowThreshold : config.longWarnThreshold}).`;
      }

      // Record firstWarn and firstSlow with exact count and window
      if (submitDecision === 'Warn' || submitDecision === 'Slow') {
        if (routeState.firstWarn === null) {
          routeState.firstWarn = {
            t: timestamp,
            count: submitWindow === '60 s' ? count60s : count5s,
            window: submitWindow
          };
        }
      }
      if (submitDecision === 'Slow') {
        if (routeState.firstSlow === null) {
          routeState.firstSlow = {
            t: timestamp,
            count: submitWindow === '60 s' ? count60s : count5s,
            window: submitWindow
          };
        }
      }

      // Pacing delay calculation
      let submitDelay = 0;
      if (submitDecision === 'Slow') {
        routeState.slowCount++;
        submitDelay = routeState.slowCount === 1 ? config.initialSlowDelaySeconds : config.subsequentSlowDelaySeconds;
        if (submitDelay > routeState.delaySeconds) {
          routeState.delaySeconds = submitDelay;
        }
      }

      if (DECISION_SEVERITY[submitDecision] >= DECISION_SEVERITY[routeState.worstDecision]) {
        routeState.worstDecision = submitDecision;
        routeState.windowFired = submitWindow;
        routeState.reason = submitReason;
      }

      routeState.lastCounted = {
        t: timestamp,
        absorbed: false,
        receiptId
      };

      const receipt = {
        id: receiptId,
        sessionId,
        route,
        arrivalTime: timestamp,
        decision: submitDecision,
        windowFired: submitWindow,
        delaySeconds: submitDelay,
        processedAt: timestamp + submitDelay,
        queuePosition: null,
        queueTotal: null
      };

      session.receipts.push(receipt);
      if (submitDecision === 'Slow') {
        slowReceipts.push(receipt);
      }

      session.events.push({
        t: timestamp,
        method: 'POST',
        route,
        kind: 'POST',
        counted: true,
        count5s,
        count60s,
        decision: submitDecision,
        windowFired: submitWindow,
        receiptId
      });
    });

    // Assign slow-lane queue positions across all slow receipts in arrival order
    const totalSlowReceipts = slowReceipts.length;
    slowReceipts.forEach((r, idx) => {
      r.queuePosition = idx + 1;
      r.queueTotal = totalSlowReceipts;
    });

    // Object.freeze on all receipts to ensure immutability
    sessionMap.forEach((session) => {
      session.receipts.forEach((r) => Object.freeze(r));
    });

    // Build session summary results
    const sessionList = [];
    sessionMap.forEach((session) => {
      let worstRoute = null;
      let highestPeak5s = 0;
      let highestPeak60s = 0;
      let maxDelay = 0;
      let earliestWarn = null;
      let earliestSlow = null;

      session.routes.forEach((rState) => {
        if (!worstRoute || DECISION_SEVERITY[rState.worstDecision] > DECISION_SEVERITY[worstRoute.worstDecision]) {
          worstRoute = rState;
        }
        if (rState.peakCount5s > highestPeak5s) highestPeak5s = rState.peakCount5s;
        if (rState.peakCount60s > highestPeak60s) highestPeak60s = rState.peakCount60s;
        if (rState.delaySeconds > maxDelay) maxDelay = rState.delaySeconds;

        if (rState.firstWarn !== null && (earliestWarn === null || rState.firstWarn.t < earliestWarn.t)) {
          earliestWarn = rState.firstWarn;
        }
        if (rState.firstSlow !== null && (earliestSlow === null || rState.firstSlow.t < earliestSlow.t)) {
          earliestSlow = rState.firstSlow;
        }
      });

      // Gap evidence across ALL POST arrivals of the session (including merged duplicates)
      const postEvents = session.events.filter((e) => e.method === 'POST');
      const gaps = [];
      for (let i = 1; i < postEvents.length; i++) {
        gaps.push(+(postEvents[i].t - postEvents[i - 1].t).toFixed(3));
      }

      let gapEvidence = {
        count: gaps.length,
        min: null,
        median: null,
        max: null,
        pattern: 'single'
      };

      if (gaps.length > 0) {
        const sortedGaps = gaps.slice().sort((a, b) => a - b);
        const minGap = sortedGaps[0];
        const maxGap = sortedGaps[sortedGaps.length - 1];
        const mid = Math.floor(sortedGaps.length / 2);
        const medianGap = sortedGaps.length % 2 !== 0 ? sortedGaps[mid] : +((sortedGaps[mid - 1] + sortedGaps[mid]) / 2).toFixed(3);

        const pattern = (maxGap - minGap) <= config.evenGapToleranceSeconds ? 'evenly spaced' : 'irregular';

        gapEvidence = {
          count: gaps.length,
          min: minGap,
          median: medianGap,
          max: maxGap,
          pattern
        };
      }

      sessionList.push({
        sessionId: session.sessionId,
        worstDecision: worstRoute ? worstRoute.worstDecision : 'Allow',
        windowFired: worstRoute ? worstRoute.windowFired : 'None',
        delaySeconds: maxDelay,
        reason: worstRoute ? worstRoute.reason : 'Normal submission pacing (0 s delay).',
        peakCount5s: highestPeak5s,
        peakCount60s: highestPeak60s,
        firstWarn: earliestWarn,
        firstSlow: earliestSlow,
        lastArrivalTime: session.lastArrivalTime,
        events: session.events,
        receipts: session.receipts,
        gapEvidence,
        formOpenedEvidence: session.formOpenedEvidence,
        // New Phase 4 fields — computed below
        currentDecision: worstRoute ? worstRoute.worstDecision : 'Allow',
        currentDelaySeconds: maxDelay,
        activeAmnestyUntil: null
      });
    });

    // ====================================================================
    // POST-PROCESSING: Operator actions, amnesty, and decay
    // ====================================================================
    // Only process if actions are provided
    if (actions.length > 0) {
      sessionList.forEach(function(sess) {
        // Find all actions for this session, sorted by time
        var sessActions = actions.filter(function(a) { return a.sessionId === sess.sessionId; });
        if (sessActions.length === 0) return;

        // Re-evaluate this session considering actions
        // Get all counted POST events for this session
        var countedPosts = sess.events.filter(function(e) { return e.counted && e.method === 'POST'; });
        var effectiveAsOf = asOfTime !== undefined ? asOfTime : sess.lastArrivalTime;

        var currentDelay = 0;
        var currentDec = 'Allow';
        var amnestyUntil = null;

        sessActions.forEach(function(action) {
          if (action.type === 'clear' || action.type === 'amnesty') {
            // Clear: reset counts from action.at — posts before action.at don't count
            currentDelay = 0;
            currentDec = 'Allow';

            if (action.type === 'amnesty') {
              amnestyUntil = action.at + config.amnestySeconds;
            }
          }
        });

        // Find the latest clear/amnesty action time
        var lastClearAt = null;
        for (var ai = sessActions.length - 1; ai >= 0; ai--) {
          if (sessActions[ai].type === 'clear' || sessActions[ai].type === 'amnesty') {
            lastClearAt = sessActions[ai].at;
            break;
          }
        }

        // Re-count posts after the latest clear
        if (lastClearAt !== null) {
          var postsAfterClear = countedPosts.filter(function(e) { return e.t > lastClearAt && e.t <= effectiveAsOf; });
          var count5s = 0;
          var count60s = 0;
          var slowCount = 0;

          postsAfterClear.forEach(function(e) {
            // Count in 5s window ending at effectiveAsOf
            if (e.t > effectiveAsOf - config.shortWindowSeconds) count5s++;
            // Count in 60s window ending at effectiveAsOf
            if (e.t > effectiveAsOf - config.longWindowSeconds) count60s++;
          });

          // Compute decision from counts
          var dec5s = 'Allow';
          if (count5s >= config.shortSlowThreshold) dec5s = 'Slow';
          else if (count5s >= config.shortWarnThreshold) dec5s = 'Warn';

          var dec60s = 'Allow';
          if (count60s >= config.longSlowThreshold) dec60s = 'Slow';
          else if (count60s >= config.longWarnThreshold) dec60s = 'Warn';

          var s5 = DECISION_SEVERITY[dec5s];
          var s60 = DECISION_SEVERITY[dec60s];
          currentDec = s5 >= s60 ? dec5s : dec60s;

          // Count slow submissions after clear for delay calculation
          postsAfterClear.forEach(function(e) {
            var eCount5 = postsAfterClear.filter(function(p) { return p.t > e.t - config.shortWindowSeconds && p.t <= e.t; }).length;
            var eCount60 = postsAfterClear.filter(function(p) { return p.t > e.t - config.longWindowSeconds && p.t <= e.t; }).length;
            var eDec5 = 'Allow';
            if (eCount5 >= config.shortSlowThreshold) eDec5 = 'Slow';
            var eDec60 = 'Allow';
            if (eCount60 >= config.longSlowThreshold) eDec60 = 'Slow';
            if (eDec5 === 'Slow' || eDec60 === 'Slow') slowCount++;
          });

          if (currentDec === 'Slow') {
            currentDelay = slowCount <= 1 ? config.initialSlowDelaySeconds : config.subsequentSlowDelaySeconds;
          }

          // Apply amnesty cap: if amnesty is active, cap at Warn
          if (amnestyUntil !== null && effectiveAsOf <= amnestyUntil) {
            if (currentDec === 'Slow') {
              currentDec = 'Warn';
              currentDelay = 0;
            }
          } else if (amnestyUntil !== null && effectiveAsOf > amnestyUntil) {
            // Amnesty expired, null it out
            amnestyUntil = null;
          }
        }

        sess.currentDecision = currentDec;
        sess.currentDelaySeconds = currentDelay;
        sess.activeAmnestyUntil = amnestyUntil;
      });
    }

    // Decay processing: step delay down during calm periods
    // Only applies when asOf is specified (replay mode)
    if (asOfTime !== undefined) {
      sessionList.forEach(function(sess) {
        var countedPosts = sess.events.filter(function(e) { return e.counted && e.method === 'POST'; });
        if (countedPosts.length === 0) return;

        var lastPostTime = countedPosts[countedPosts.length - 1].t;
        var calmDuration = asOfTime - lastPostTime;

        if (calmDuration > 0 && sess.currentDelaySeconds > 0) {
          var decaySteps = Math.floor(calmDuration / config.decayStepSeconds);
          var delay = sess.currentDelaySeconds;

          for (var ds = 0; ds < decaySteps && delay > 0; ds++) {
            if (delay >= 4) delay = 2;
            else if (delay >= 2) delay = 0;
            else delay = 0;
          }

          sess.currentDelaySeconds = delay;

          // If delay decayed to 0, check if counts are below Warn to return to Allow
          if (delay === 0) {
            // Recalculate counts at asOf
            var count5s = countedPosts.filter(function(e) {
              return e.t > asOfTime - config.shortWindowSeconds && e.t <= asOfTime;
            }).length;
            var count60s = countedPosts.filter(function(e) {
              return e.t > asOfTime - config.longWindowSeconds && e.t <= asOfTime;
            }).length;

            if (count5s < config.shortWarnThreshold && count60s < config.longWarnThreshold) {
              sess.currentDecision = 'Allow';
            }
          }
        }
      });
    }

    // Evaluate system-wide status
    const anyFlagged = sessionList.some((s) => s.worstDecision === 'Warn' || s.worstDecision === 'Slow');
    let isBusy = false;
    if (!anyFlagged && allValidPosts.length >= config.busyThresholdSessions) {
      for (let i = 0; i < allValidPosts.length; i++) {
        const windowEnd = allValidPosts[i].timestamp + config.shortWindowSeconds;
        const distinctInWindow = new Set();
        for (let j = i; j < allValidPosts.length; j++) {
          if (allValidPosts[j].timestamp <= windowEnd) {
            distinctInWindow.add(allValidPosts[j].sessionId);
          } else {
            break;
          }
        }
        if (distinctInWindow.size >= config.busyThresholdSessions) {
          isBusy = true;
          break;
        }
      }
    }

    const systemStatus = anyFlagged ? 'Flood' : isBusy ? 'Busy' : 'Normal';

    // Summary metrics
    const activeSessionsCount = sessionList.length;
    const highest5s = sessionList.reduce((max, s) => Math.max(max, s.peakCount5s), 0);
    const highest60s = sessionList.reduce((max, s) => Math.max(max, s.peakCount60s), 0);
    const highestDelay = sessionList.reduce((max, s) => Math.max(max, s.delaySeconds), 0);
    const flaggedSessionsCount = sessionList.filter((s) => s.worstDecision === 'Warn' || s.worstDecision === 'Slow').length;

    // Sort sessions: Slow first, then Warn, then Allow; tie-breaker: arrival time descending
    sessionList.sort((a, b) => {
      const sevDiff = DECISION_SEVERITY[b.worstDecision] - DECISION_SEVERITY[a.worstDecision];
      if (sevDiff !== 0) return sevDiff;
      return b.lastArrivalTime - a.lastArrivalTime;
    });

    return {
      metrics: {
        activeSessions: activeSessionsCount,
        highest5s,
        highest60s,
        highestDelay,
        flaggedSessions: flaggedSessionsCount,
        totalSessions: activeSessionsCount
      },
      summary: {
        totalRequests,
        postsCounted,
        getsIgnored,
        doubleClicksMerged,
        systemStatus
      },
      sessions: sessionList
    };
  }

  function normalizeFormOpened(val) {
    if (val === undefined || val === null || val === '') return 'not recorded';
    const s = String(val).trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return 'yes';
    if (s === 'no' || s === 'false' || s === '0') return 'no';
    return 'not recorded';
  }

  // ============================================================================
  // 4. WHY CARD & STUDENT VIEW HELPERS
  // ============================================================================
  /**
   * Generates comprehensive explanation data for the Why card.
   */
  function explainSession(session, customConfig) {
    if (!session) return null;
    var cfg = customConfig ? Object.assign({}, RUSHGUARD_CONFIG, customConfig) : RUSHGUARD_CONFIG;

    const isSlow = session.worstDecision === 'Slow';
    const isWarn = session.worstDecision === 'Warn';
    const fired5s = session.windowFired === '5 s';
    const fired60s = session.windowFired === '60 s';

    let count, windowLength, threshold;
    if (fired60s) {
      count = session.peakCount60s;
      windowLength = 60;
      threshold = isSlow ? RUSHGUARD_CONFIG.longSlowThreshold : RUSHGUARD_CONFIG.longWarnThreshold;
    } else if (fired5s) {
      count = session.peakCount5s;
      windowLength = 5;
      threshold = isSlow ? RUSHGUARD_CONFIG.shortSlowThreshold : RUSHGUARD_CONFIG.shortWarnThreshold;
    } else {
      // Allow session: choose window with higher relative activity
      if ((session.peakCount60s / RUSHGUARD_CONFIG.longWarnThreshold) > (session.peakCount5s / RUSHGUARD_CONFIG.shortWarnThreshold)) {
        count = session.peakCount60s;
        windowLength = 60;
        threshold = RUSHGUARD_CONFIG.longWarnThreshold;
      } else {
        count = session.peakCount5s;
        windowLength = 5;
        threshold = RUSHGUARD_CONFIG.shortWarnThreshold;
      }
    }

    let otherWindowText = '';
    if (fired60s) {
      otherWindowText = `5 s window never reached Warn (peak count ${session.peakCount5s} of ${RUSHGUARD_CONFIG.shortWarnThreshold}).`;
    } else if (fired5s) {
      otherWindowText = `60 s window peak count was ${session.peakCount60s} of ${RUSHGUARD_CONFIG.longWarnThreshold}.`;
    } else {
      otherWindowText = 'Both sliding windows remained comfortably below Warn thresholds.';
    }

    return {
      sessionId: session.sessionId,
      decision: session.worstDecision,
      windowFired: session.windowFired,
      count,
      windowLength,
      threshold,
      reasonSentence: session.reason,
      otherWindowText,
      firstWarn: session.firstWarn,
      firstSlow: session.firstSlow,
      gapEvidence: session.gapEvidence,
      formOpenedEvidence: session.formOpenedEvidence,
      evidenceNote: 'Evidence only. It explains a decision and never triggers one.'
    };
  }

  /**
   * Generates calm, transparent student-facing receipt text.
   * Strictly never uses the words: blocked, denied, banned, locked.
   */
  function studentMessage(receipt) {
    if (!receipt) return 'No submissions from this session.';

    const tStr = receipt.arrivalTime.toFixed(2);
    if (receipt.decision === 'Allow') {
      return `Submission received at ${tStr} s.`;
    }
    if (receipt.decision === 'Warn') {
      return `Submission received at ${tStr} s. You're submitting quickly. One submit is enough.`;
    }
    if (receipt.decision === 'Slow') {
      const qPos = receipt.queuePosition !== null ? ` Slow-lane position: ${receipt.queuePosition} of ${receipt.queueTotal}.` : '';
      return `Your draft is saved. You can submit again in ${receipt.delaySeconds} s. Your submission time is protected: received at ${tStr} s.${qPos}`;
    }
    return `Submission received at ${tStr} s.`;
  }

  // ============================================================================
  // 5. CSV PARSER & ROW VALIDATOR (RFC-4180 / Quotes Safe, 5,000 Row Cap)
  // ============================================================================
  function splitCsvLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && i + 1 < line.length && line[i + 1] === char) {
          current += char;
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  function parseAndValidateCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') {
      return { success: false, error: 'Empty or invalid CSV file content.' };
    }

    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      return { success: false, error: 'CSV file must contain a header row and at least one data row.' };
    }

    if (lines.length - 1 > RUSHGUARD_CONFIG.maxCsvRows) {
      return { success: false, error: `CSV exceeds maximum limit of ${RUSHGUARD_CONFIG.maxCsvRows} rows (found ${lines.length - 1}).` };
    }

    const headerCols = splitCsvLine(lines[0]).map((c) => c.toLowerCase().replace(/^["']|["']$/g, ''));
    const tsIdx = headerCols.indexOf('timestamp');
    const sidIdx = headerCols.indexOf('session_id');
    const routeIdx = headerCols.indexOf('route');
    const methodIdx = headerCols.indexOf('method');

    if (tsIdx === -1 || sidIdx === -1 || routeIdx === -1 || methodIdx === -1) {
      return {
        success: false,
        error: 'Missing required header columns: timestamp, session_id, route, method.'
      };
    }

    const requiredIndices = [tsIdx, sidIdx, routeIdx, methodIdx];
    const minColsNeeded = Math.max(...requiredIndices) + 1;
    const formOpenedIdx = headerCols.indexOf('form_opened');
    const requests = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = splitCsvLine(line).map((c) => c.replace(/^["']|["']$/g, ''));

      // Reject a row that has fewer columns than the highest required column index
      if (cols.length < minColsNeeded) {
        return { success: false, error: `Row ${i + 1}: Malformed row has fewer than ${minColsNeeded} columns required by header: "${line}"` };
      }

      const rawTs = cols[tsIdx];
      // Require fully numeric timestamp
      if (!/^-?\d+(\.\d+)?$/.test(rawTs) || !Number.isFinite(parseFloat(rawTs))) {
        return { success: false, error: `Row ${i + 1}: Invalid numeric timestamp "${rawTs}".` };
      }

      const timestamp = parseFloat(rawTs);
      if (timestamp < 0) {
        return { success: false, error: `Row ${i + 1}: Negative timestamp "${rawTs}" is not allowed.` };
      }

      const sessionId = cols[sidIdx];
      if (!sessionId) {
        return { success: false, error: `Row ${i + 1}: Missing session_id.` };
      }

      const route = cols[routeIdx] || '/';
      const method = cols[methodIdx].toUpperCase();
      if (method !== 'GET' && method !== 'POST') {
        return { success: false, error: `Row ${i + 1}: Unsupported HTTP method "${cols[methodIdx]}" (expected GET or POST).` };
      }

      const formOpened = formOpenedIdx !== -1 && cols[formOpenedIdx] !== undefined ? cols[formOpenedIdx] : undefined;

      requests.push({ timestamp, sessionId, route, method, formOpened });
    }

    return { success: true, requests };
  }

  // ============================================================================
  // 6. SELF-CHECKS TEST SUITE (window.RushGuardTests.run)
  // ============================================================================
  const RushGuardTests = {
    run: function () {
      console.log('%c[RushGuard Engine] Running Comprehensive Tests...', 'font-weight:bold; color:#0f172a;');
      let allPassed = true;

      function test(name, assertion) {
        try {
          const pass = Boolean(assertion());
          if (pass) {
            console.log(`%c PASS %c ${name}`, 'color:#065f46; background:#ecfdf5; font-weight:bold;', 'color:#1e293b;');
          } else {
            console.error(` FAIL: ${name}`);
            allPassed = false;
          }
        } catch (err) {
          console.error(` FAIL: ${name} (Exception: ${err.message})`, err);
          allPassed = false;
        }
      }

      // Test 1: Rush: 0 flagged, badge "Busy"
      test('Test 1 - Rush Scenario: 0 flagged sessions and system status is "Busy"', () => {
        const reqs = generateScenario('rush');
        const res = evaluateRequests(reqs);
        return res.metrics.flaggedSessions === 0 && res.summary.systemStatus === 'Busy';
      });

      // Test 2: Script burst: Warn occurs before Slow, flagged set equals answer key
      test('Test 2 - Script Burst: Warn occurs before Slow; flagged set equals answer key', () => {
        const reqs = generateScenario('burst');
        const res = evaluateRequests(reqs);
        const scriptSession = res.sessions.find((s) => s.sessionId === 'sess_burst_script');
        const flaggedIds = res.sessions.filter((s) => s.worstDecision !== 'Allow').map((s) => s.sessionId);
        const answerKey = SCENARIO_ANSWER_KEYS.burst.flaggedSessionIds;
        const matchesKey = flaggedIds.length === answerKey.length && flaggedIds.every((id) => answerKey.includes(id));
        const warnBeforeSlow = scriptSession && scriptSession.firstWarn !== null && scriptSession.firstSlow !== null && scriptSession.firstWarn.t < scriptSession.firstSlow.t;
        return matchesKey && warnBeforeSlow && scriptSession.worstDecision === 'Slow' && scriptSession.windowFired === '5 s';
      });

      // Test 2b: Raw flood of 15 POSTs at 0.2s gaps must reach Slow
      test('Test 2b - Raw flood of 15 POSTs at 0.2 s gaps must reach Slow', () => {
        const floodReqs = [];
        for (let i = 0; i < 15; i++) {
          floodReqs.push({ timestamp: +(i * 0.2).toFixed(2), sessionId: 'sess_flood_bot', route: '/submit', method: 'POST' });
        }
        const res = evaluateRequests(floodReqs);
        const bot = res.sessions.find((s) => s.sessionId === 'sess_flood_bot');
        return bot && bot.worstDecision === 'Slow';
      });

      // Test 2c: Route A at 0, 1.1, 2.2 and Route B at 0.55, 1.65, 2.75 expect Allow and peakCount5s === 3
      test('Test 2c - Per-route isolation: Route A at 0, 1.1, 2.2 and Route B at 0.55, 1.65, 2.75 stay Allow and peakCount5s === 3', () => {
        const multiRouteReqs = [
          { timestamp: 0.0, sessionId: 'sess_multi', route: '/route-A', method: 'POST' },
          { timestamp: 1.1, sessionId: 'sess_multi', route: '/route-A', method: 'POST' },
          { timestamp: 2.2, sessionId: 'sess_multi', route: '/route-A', method: 'POST' },
          { timestamp: 0.55, sessionId: 'sess_multi', route: '/route-B', method: 'POST' },
          { timestamp: 1.65, sessionId: 'sess_multi', route: '/route-B', method: 'POST' },
          { timestamp: 2.75, sessionId: 'sess_multi', route: '/route-B', method: 'POST' }
        ];
        const res = evaluateRequests(multiRouteReqs);
        const session = res.sessions.find((s) => s.sessionId === 'sess_multi');
        return session && session.worstDecision === 'Allow' && session.peakCount5s === 3;
      });

      // Test 3: Slow-drip: 60 s window flags, 5 s does not
      test('Test 3 - Slow-drip: 60 s window flags script session; 5 s window never triggers', () => {
        const reqs = generateScenario('slowdrip');
        const res = evaluateRequests(reqs);
        const scriptSession = res.sessions.find((s) => s.sessionId === 'sess_slow_drip');
        return scriptSession &&
               scriptSession.worstDecision === 'Warn' &&
               scriptSession.windowFired === '60 s' &&
               scriptSession.peakCount5s <= 1;
      });

      // Test 4: GET spam is never counted
      test('Test 4 - GET requests are ignored and never trigger Warn or Slow', () => {
        const reqs = [];
        for (let i = 0; i < 50; i++) {
          reqs.push({ timestamp: i * 0.1, sessionId: 'sess_get_spammer', route: '/form', method: 'GET' });
        }
        const res = evaluateRequests(reqs);
        return res.metrics.flaggedSessions === 0 &&
               res.summary.getsIgnored === 50 &&
               res.summary.postsCounted === 0 &&
               res.sessions[0].worstDecision === 'Allow';
      });

      // Test 5: Double-click grace period merges at most ONE duplicate
      test('Test 5 - Double-click grace absorbs at most one duplicate per counted submit', () => {
        const reqs = [
          { timestamp: 1.0, sessionId: 'sess_grace', route: '/submit', method: 'POST' },
          { timestamp: 1.4, sessionId: 'sess_grace', route: '/submit', method: 'POST' }, // Absorbed
          { timestamp: 1.8, sessionId: 'sess_grace', route: '/submit', method: 'POST' }  // Counted!
        ];
        const res = evaluateRequests(reqs);
        return res.summary.postsCounted === 2 &&
               res.summary.doubleClicksMerged === 1;
      });

      // Test 5b: POSTs at 0.0, 0.2, 0.4 give 2 counted and 1 merged
      test('Test 5b - POSTs at 0.0, 0.2, 0.4 give 2 counted and 1 merged', () => {
        const reqs = [
          { timestamp: 0.0, sessionId: 's_grace2', route: '/submit', method: 'POST' },
          { timestamp: 0.2, sessionId: 's_grace2', route: '/submit', method: 'POST' }, // Absorbed
          { timestamp: 0.4, sessionId: 's_grace2', route: '/submit', method: 'POST' }  // Counted!
        ];
        const res = evaluateRequests(reqs);
        return res.summary.postsCounted === 2 &&
               res.summary.doubleClicksMerged === 1;
      });

      // Test 6: Nervous student: Allow
      test('Test 6 - Nervous Student (3 submits in 5 s): Allow', () => {
        const reqs = generateScenario('nervous');
        const res = evaluateRequests(reqs);
        const nervousSession = res.sessions.find((s) => s.sessionId === 'sess_nervous_student');
        return nervousSession &&
               nervousSession.worstDecision === 'Allow' &&
               res.metrics.flaggedSessions === 0;
      });

      // Test 7: Receipt arrivalTime immutable, processedAt - arrivalTime equals delaySeconds
      test('Test 7 - Receipts immutability and arrival timestamp protection', () => {
        const reqs = generateScenario('burst');
        const res = evaluateRequests(reqs);
        const scriptSession = res.sessions.find((s) => s.sessionId === 'sess_burst_script');
        const slowReceipt = scriptSession.receipts.find((r) => r.decision === 'Slow');
        const frozen = Object.isFrozen(slowReceipt);
        const timingPreserved = slowReceipt && (slowReceipt.processedAt - slowReceipt.arrivalTime === slowReceipt.delaySeconds);
        return frozen && timingPreserved;
      });

      // Test 7b: Slow-lane queue positions are 1..n in arrival order
      test('Test 7b - Slow-lane queue positions are sequential 1..n in arrival order', () => {
        const reqs = generateScenario('burst');
        const res = evaluateRequests(reqs);
        const slowReceipts = [];
        res.sessions.forEach((s) => s.receipts.forEach((r) => { if (r.decision === 'Slow') slowReceipts.push(r); }));
        const positions = slowReceipts.map((r) => r.queuePosition);
        const expected = Array.from({ length: slowReceipts.length }, (_, i) => i + 1);
        return positions.length > 0 && positions.every((p, i) => p === expected[i]);
      });

      // Test 7c: Why data names 5s window for burst and 60s for slow-drip
      test('Test 7c - Why data explainSession names correct windows and thresholds', () => {
        const resBurst = evaluateRequests(generateScenario('burst'));
        const burstScript = resBurst.sessions.find((s) => s.sessionId === 'sess_burst_script');
        const whyBurst = explainSession(burstScript);

        const resDrip = evaluateRequests(generateScenario('slowdrip'));
        const dripScript = resDrip.sessions.find((s) => s.sessionId === 'sess_slow_drip');
        const whyDrip = explainSession(dripScript);

        return whyBurst.windowFired === '5 s' &&
               whyBurst.firstWarn !== null &&
               whyBurst.firstSlow !== null &&
               whyDrip.windowFired === '60 s' &&
               whyDrip.otherWindowText.includes('5 s window never reached Warn');
      });

      // Test 7d: form_opened evidence does not influence decisions or counts
      test('Test 7d - form_opened evidence is purely non-interfering', () => {
        const reqsYes = [
          { timestamp: 1.0, sessionId: 's1', route: '/f', method: 'POST', formOpened: 'yes' },
          { timestamp: 2.0, sessionId: 's1', route: '/f', method: 'POST', formOpened: 'yes' }
        ];
        const reqsNo = [
          { timestamp: 1.0, sessionId: 's1', route: '/f', method: 'POST', formOpened: 'no' },
          { timestamp: 2.0, sessionId: 's1', route: '/f', method: 'POST', formOpened: 'no' }
        ];
        const resYes = evaluateRequests(reqsYes);
        const resNo = evaluateRequests(reqsNo);
        return resYes.metrics.flaggedSessions === resNo.metrics.flaggedSessions &&
               resYes.summary.postsCounted === resNo.summary.postsCounted;
      });

      // Test 7e: Gap evidence at 0, 1.2, 2.4 gives count 2, min 1.2, max 1.2, pattern "evenly spaced"
      test('Test 7e - Gap evidence at 0, 1.2, 2.4 gives count 2, min 1.2, max 1.2, pattern "evenly spaced"', () => {
        const reqs = [
          { timestamp: 0.0, sessionId: 'sgap', route: '/f', method: 'POST' },
          { timestamp: 1.2, sessionId: 'sgap', route: '/f', method: 'POST' },
          { timestamp: 2.4, sessionId: 'sgap', route: '/f', method: 'POST' }
        ];
        const res = evaluateRequests(reqs);
        const s = res.sessions.find((sess) => sess.sessionId === 'sgap');
        return s && s.gapEvidence.pattern === 'evenly spaced' &&
               s.gapEvidence.count === 2 &&
               s.gapEvidence.min === 1.2 &&
               s.gapEvidence.max === 1.2;
      });

      // Test 7f: Merged duplicates have no receipt and point to valid parent receipt
      test('Test 7f - Merged duplicates carry kind DUPLICATE_MERGED pointing to parent receipt', () => {
        const reqs = [
          { timestamp: 1.0, sessionId: 'sdup', route: '/f', method: 'POST' },
          { timestamp: 1.5, sessionId: 'sdup', route: '/f', method: 'POST' }
        ];
        const res = evaluateRequests(reqs);
        const s = res.sessions.find((sess) => sess.sessionId === 'sdup');
        const dupEvent = s.events.find((e) => e.kind === 'DUPLICATE_MERGED');
        return dupEvent && dupEvent.receiptId === 'R-0001' && s.receipts.length === 1;
      });

      // Test 7g: Gap evidence across all POST arrivals for 15 POSTs at 0.2 s gaps
      test('Test 7g - Gap evidence across all POST arrivals for 15 POSTs at 0.2 s gaps reports ~0.2 s and evenly spaced', () => {
        const flood = [];
        for (let i = 0; i < 15; i++) {
          flood.push({ timestamp: +(i * 0.2).toFixed(2), sessionId: 's_gap_flood', route: '/f', method: 'POST' });
        }
        const res = evaluateRequests(flood);
        const s = res.sessions.find((sess) => sess.sessionId === 's_gap_flood');
        return s && s.gapEvidence.count === 14 &&
               Math.abs(s.gapEvidence.min - 0.2) < 0.01 &&
               Math.abs(s.gapEvidence.median - 0.2) < 0.01 &&
               Math.abs(s.gapEvidence.max - 0.2) < 0.01 &&
               s.gapEvidence.pattern === 'evenly spaced';
      });

      // Test 8: CSV parser rejects short row with reordered header without throwing
      test('Test 8 - CSV parser rejects short row with reordered header without throwing', () => {
        const reorderedCsv = 'method,route,session_id,timestamp\nPOST,/submit,user1'; // only 3 cols, needs 4
        const res = parseAndValidateCSV(reorderedCsv);
        return res.success === false && res.error.includes('Row 2') && res.error.includes('fewer than 4 columns');
      });

      console.log(`%c[RushGuard Engine] Tests Complete: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`, `font-weight:bold; color:${allPassed ? '#065f46' : '#9a3412'};`);
      return allPassed;
    }
  };

  // Expose clean namespace on global window object
  global.RushGuardConfig = RUSHGUARD_CONFIG;
  global.RushGuardEngine = {
    evaluateRequests,
    generateScenario,
    parseAndValidateCSV,
    explainSession,
    studentMessage,
    SCENARIO_ANSWER_KEYS
  };
  global.RushGuardTests = RushGuardTests;

})(typeof window !== 'undefined' ? window : this);
