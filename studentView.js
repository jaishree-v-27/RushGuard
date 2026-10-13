/**
 * ==============================================================================
 * PANEL 9: STUDENT VIEW (panels/studentView.js)
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Features:
 * - Student Perspective preview for the currently selected session
 * - Calm, reassuring messaging ("Your draft is saved. You can submit again in 8s.")
 * - Arrival Timestamp Guarantee Receipt (never changed by being slowed!)
 * - Slow-Lane Queue Position display
 * - Submission Receipts History Table (up to 20 recent receipts)
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
          <h2 id="heading-student" class="card-title">
            <span aria-hidden="true">🎓</span> Student View Preview
          </h2>
          <p class="card-subtitle">
            Preview of student-facing interface for the selected session. Guaranteed deadline timestamps.
          </p>
        </div>
        <div class="header-actions">
          <span id="student-session-badge" class="badge badge-neutral">—</span>
        </div>
      </div>
      <div class="card-body">
        <!-- Latest Receipt Card -->
        <div id="student-receipt-card" class="student-receipt-card">
          <div class="receipt-card-header">
            <div>
              <span class="field-hint" style="text-transform: uppercase; font-weight:700;">Submission Receipt</span>
              <div id="student-receipt-id" class="receipt-id-tag">No Receipt Yet</div>
            </div>
            <span id="student-receipt-badge" class="badge badge-neutral">—</span>
          </div>

          <p id="student-receipt-time" class="receipt-time-text">
            Arrival Timestamp: Select a session to view receipt.
          </p>

          <!-- Calm, Reassuring Student Message -->
          <div id="student-receipt-message" class="receipt-message-text">
            Your draft is safely recorded. No submission penalties apply.
          </div>

          <div id="student-queue-box" class="field-hint" style="display: flex; gap: 1rem; align-items: center; color: #94a3b8;">
            <span id="student-queue-pos">Queue Position: Direct lane</span>
            <span id="student-lane-delay">Pacing Delay: 0s</span>
          </div>
        </div>

        <!-- Receipts History Table (Latest 20) -->
        <div class="receipts-history-wrap">
          <div class="table-section-header">
            <h3 class="why-heading">Submission Receipts History (Latest 20)</h3>
            <span class="field-hint" id="receipts-count-tag">0 receipts</span>
          </div>
          <div class="table-container table-compact" tabindex="0" role="region" aria-label="Student Submission Receipts History">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Receipt ID</th>
                  <th scope="col">Arrival Time</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Pacing Delay</th>
                  <th scope="col">Slow-Lane Order</th>
                </tr>
              </thead>
              <tbody id="student-receipts-body">
                <tr>
                  <td colspan="5" class="empty-state-cell">No submissions recorded for this session.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Guarantee Note -->
        <p class="receipt-guarantee-note">
          <span aria-hidden="true">🔒</span>
          <strong>Timestamp Guarantee:</strong> Your submission time is recorded the exact millisecond it arrives. Being placed in a pacing queue never alters your recorded deadline time.
        </p>
        <p class="caption-simulated">Simulated student portal · Zero login tracking required</p>
      </div>
    `;
  }

  function render(state) {
    if (!rootEl) return;

    // Visual emphasis if Student Role is active
    if (state.currentRole === 'student') {
      rootEl.style.borderColor = 'rgba(56, 189, 248, 0.7)';
      rootEl.style.boxShadow = '0 0 30px rgba(56, 189, 248, 0.3)';
    } else {
      rootEl.style.borderColor = '';
      rootEl.style.boxShadow = '';
    }

    const selectedId = state.selectedSessionId;
    const sessionBadge = rootEl.querySelector('#student-session-badge');
    const receiptIdEl = rootEl.querySelector('#student-receipt-id');
    const receiptBadge = rootEl.querySelector('#student-receipt-badge');
    const receiptTimeEl = rootEl.querySelector('#student-receipt-time');
    const receiptMsgEl = rootEl.querySelector('#student-receipt-message');
    const queuePosEl = rootEl.querySelector('#student-queue-pos');
    const laneDelayEl = rootEl.querySelector('#student-lane-delay');
    const tbody = rootEl.querySelector('#student-receipts-body');
    const countTag = rootEl.querySelector('#receipts-count-tag');

    if (!selectedId || !state.sessions || state.sessions.length === 0) {
      if (sessionBadge) { sessionBadge.className = 'badge badge-neutral'; sessionBadge.textContent = '—'; }
      if (receiptIdEl) receiptIdEl.textContent = 'No Receipt Yet';
      if (receiptBadge) { receiptBadge.className = 'badge badge-neutral'; receiptBadge.textContent = '—'; }
      if (receiptTimeEl) receiptTimeEl.textContent = 'Select a session from the table or barcode to view student perspective.';
      if (receiptMsgEl) {
        receiptMsgEl.className = 'receipt-message-text';
        receiptMsgEl.textContent = 'Choose a scenario above to inspect student receipts.';
      }
      if (queuePosEl) queuePosEl.textContent = 'Queue Position: Direct lane';
      if (laneDelayEl) laneDelayEl.textContent = 'Pacing Delay: 0s';
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state-cell">No submissions recorded for this session.</td></tr>';
      if (countTag) countTag.textContent = '0 receipts';
      return;
    }

    const sessionObj = state.sessions.find((s) => s.session === selectedId || s.sessionId === selectedId);
    if (!sessionObj) return;

    const sId = sessionObj.sessionId || sessionObj.session;
    const dec = sessionObj.decision || 'Allow';

    if (sessionBadge) {
      sessionBadge.className = 'badge badge-neutral';
      sessionBadge.textContent = `Viewing: ${sId}`;
    }

    const receipts = sessionObj.receipts || [];
    if (countTag) countTag.textContent = `${receipts.length} receipt(s)`;

    const latestReceipt = receipts.length > 0 ? receipts[receipts.length - 1] : null;

    if (latestReceipt) {
      if (receiptIdEl) receiptIdEl.textContent = latestReceipt.receiptId || 'R-0001';
      if (receiptBadge) {
        receiptBadge.className = dec === 'Slow' ? 'badge badge-slow' : (dec === 'Warn' ? 'badge badge-warn' : 'badge badge-allow');
        receiptBadge.textContent = dec;
      }
      if (receiptTimeEl) {
        const arrTime = latestReceipt.arrivalTime !== undefined ? latestReceipt.arrivalTime : latestReceipt.timestamp;
        receiptTimeEl.innerHTML = `Arrival Timestamp: <strong>${arrTime ? arrTime.toFixed(2) + 's' : '0.00s'}</strong> (Recorded on arrival)`;
      }

      // Calm Student Messaging
      if (receiptMsgEl) {
        if (dec === 'Slow') {
          receiptMsgEl.className = 'receipt-message-text slow';
          receiptMsgEl.innerHTML = `Your submission is received and securely saved. Pacing slow lane active (+${sessionObj.pacingDelay || sessionObj.currentDelaySeconds || 2}s delay). You can submit again shortly.`;
        } else if (dec === 'Warn') {
          receiptMsgEl.className = 'receipt-message-text warn';
          receiptMsgEl.innerHTML = `Your submission is received. We noticed rapid retries—no action needed, your draft is safe.`;
        } else {
          receiptMsgEl.className = 'receipt-message-text';
          receiptMsgEl.innerHTML = `✓ Submission accepted and recorded at arrival time. Your receipt is confirmed.`;
        }
      }

      if (queuePosEl) {
        queuePosEl.textContent = dec === 'Slow' ? 'Queue Position: Position 1 of 1 (Paced Slow Lane)' : 'Queue Position: Direct lane (Instant)';
      }
      if (laneDelayEl) {
        const delay = sessionObj.pacingDelay || sessionObj.currentDelaySeconds || 0;
        laneDelayEl.textContent = `Pacing Delay: ${delay}s`;
      }
    } else {
      if (receiptIdEl) receiptIdEl.textContent = 'Awaiting Submission';
      if (receiptMsgEl) receiptMsgEl.textContent = 'Session active, no POST submissions completed.';
    }

    // Render Receipts Table
    if (tbody) {
      if (receipts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state-cell">No submissions recorded for this session.</td></tr>';
        return;
      }

      let rHtml = '';
      receipts.slice(-20).forEach((r, idx) => {
        const rDec = r.decision || dec;
        const rDecClass = rDec === 'Slow' ? 'badge-slow' : (rDec === 'Warn' ? 'badge-warn' : 'badge-allow');
        const rTime = r.arrivalTime !== undefined ? r.arrivalTime : (r.timestamp !== undefined ? r.timestamp : 0);
        const rDelay = r.delay !== undefined ? r.delay : (r.pacingDelay || 0);

        rHtml += `
          <tr>
            <td style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">${r.receiptId || `R-${String(idx + 1).padStart(4, '0')}`}</td>
            <td>${rTime.toFixed(2)}s</td>
            <td><span class="badge ${rDecClass}">${rDec}</span></td>
            <td>${rDelay}s</td>
            <td>${rDec === 'Slow' ? 'Paced slow lane' : 'Direct priority'}</td>
          </tr>
        `;
      });
      tbody.innerHTML = rHtml;
    }
  }

  const panel = { mount, render };
  global.StudentViewPanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
