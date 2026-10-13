/**
 * ==============================================================================
 * PANEL 7: OPERATOR PANEL (panels/operator.js)
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Buttons call actions ONLY via RushGuardStore.actions.clear(id) & grantAmnesty(id).
 * Features:
 * - 1-Tap Clear Session (resets counts and returns to Allow)
 * - 1-Tap Grant Amnesty (starts 5-minute time-boxed safe period)
 * - Operator Note input attached to audit entry
 * - Mistake Recovery Audit Log (Time, Session, Rule, Count, Action, Actor, Note)
 * - Rule Tuning Hint: Alert if 3+ amnesties granted on the same rule
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
          <h2 id="heading-operator" class="card-title">
            <span aria-hidden="true">🛠️</span> 6. Operator Panel & Audit Log
          </h2>
          <p class="card-subtitle">
            Reversible overrides, time-boxed amnesty control, and Mistake Recovery Log.
          </p>
        </div>
        <div class="header-actions">
          <span id="selected-session-tag" class="badge badge-neutral">No session selected</span>
        </div>
      </div>
      <div class="card-body">
        <!-- Operator Action Bar -->
        <div class="operator-actions-bar">
          <div style="display: flex; gap: 0.5rem; flex: 1; min-width: 260px;">
            <button id="op-clear-btn" class="btn btn-secondary btn-sm" type="button" disabled>
              <span aria-hidden="true">↺</span> Clear Session
            </button>
            <button id="op-amnesty-btn" class="btn btn-action btn-sm" type="button" disabled>
              <span aria-hidden="true">🕊️</span> Grant Amnesty (5 min)
            </button>
          </div>
          <div style="flex: 2; min-width: 240px;">
            <input type="text" id="op-note-input" placeholder="Operator note (e.g. Student phoned helpdesk...)" style="width: 100%;">
          </div>
        </div>

        <!-- Rule Tuning Hint Banner -->
        <div id="op-tuning-hint" class="tuning-alert-box visually-hidden" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span id="op-tuning-hint-text">Tuning advice appears here.</span>
        </div>

        <!-- Mistake Recovery Log Table -->
        <div class="table-section">
          <div class="table-section-header">
            <h3 class="table-title">Mistake Recovery Log</h3>
            <span class="field-hint" id="audit-log-counter">0 logged actions</span>
          </div>
          <div class="table-container table-compact" tabindex="0" role="region" aria-label="Mistake Recovery Audit Log">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Session</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Count</th>
                  <th scope="col">Action</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody id="audit-log-body">
                <tr>
                  <td colspan="7" class="empty-state-cell">No operator actions logged yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="caption-simulated">100% reversible actions · All interventions permanently audited</p>
      </div>
    `;

    bindOperatorEvents();
  }

  function bindOperatorEvents() {
    if (!rootEl) return;

    const clearBtn = rootEl.querySelector('#op-clear-btn');
    const amnestyBtn = rootEl.querySelector('#op-amnesty-btn');
    const noteInput = rootEl.querySelector('#op-note-input');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const curState = global.RushGuardStore.get();
        const sId = curState.selectedSessionId;
        if (!sId) return;
        const note = noteInput ? noteInput.value.trim() : '';
        global.RushGuardStore.actions.clear(sId, note);
        if (noteInput) noteInput.value = '';
      });
    }

    if (amnestyBtn) {
      amnestyBtn.addEventListener('click', () => {
        const curState = global.RushGuardStore.get();
        const sId = curState.selectedSessionId;
        if (!sId) return;
        const note = noteInput ? noteInput.value.trim() : '';
        global.RushGuardStore.actions.grantAmnesty(sId, note);
        if (noteInput) noteInput.value = '';
      });
    }
  }

  function render(state) {
    if (!rootEl) return;

    const selectedId = state.selectedSessionId;
    const tagEl = rootEl.querySelector('#selected-session-tag');
    const clearBtn = rootEl.querySelector('#op-clear-btn');
    const amnestyBtn = rootEl.querySelector('#op-amnesty-btn');
    const hintEl = rootEl.querySelector('#op-tuning-hint');
    const hintText = rootEl.querySelector('#op-tuning-hint-text');
    const logCounter = rootEl.querySelector('#audit-log-counter');
    const tbody = rootEl.querySelector('#audit-log-body');

    // Button states
    if (tagEl) {
      if (selectedId) {
        tagEl.className = 'badge badge-allow';
        tagEl.textContent = `Selected: ${selectedId}`;
      } else {
        tagEl.className = 'badge badge-neutral';
        tagEl.textContent = 'No session selected';
      }
    }

    if (clearBtn) clearBtn.disabled = !selectedId;
    if (amnestyBtn) amnestyBtn.disabled = !selectedId;

    // Check tuning threshold hint (3+ amnesties on same rule)
    const logs = state.auditLog || [];
    if (logCounter) logCounter.textContent = `${logs.length} logged action(s)`;

    const amnestyRuleCounts = {};
    logs.forEach((item) => {
      if (item.action && item.action.includes('Amnesty') && item.rule) {
        amnestyRuleCounts[item.rule] = (amnestyRuleCounts[item.rule] || 0) + 1;
      }
    });

    let hintFound = false;
    for (const [rule, count] of Object.entries(amnestyRuleCounts)) {
      if (count >= 3) {
        hintFound = true;
        if (hintEl && hintText) {
          hintEl.className = 'tuning-alert-box';
          hintText.textContent = `Threshold Hint: ${count} amnesties granted for rule "${rule}". Consider loosening threshold in What-If Tuner.`;
        }
        break;
      }
    }
    if (!hintFound && hintEl) {
      hintEl.className = 'tuning-alert-box visually-hidden';
    }

    // Render Audit Log Table
    if (tbody) {
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-cell">No operator actions logged yet.</td></tr>';
        return;
      }

      let logRows = '';
      logs.forEach((item) => {
        const actorClass = item.actor && item.actor.includes('AI') ? '#a855f7' : '#38bdf8';
        logRows += `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 11px;">${item.time}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">${item.session}</td>
            <td><span class="badge badge-neutral">${item.rule}</span></td>
            <td>${item.count}</td>
            <td><strong>${item.action}</strong></td>
            <td style="color: ${actorClass}; font-weight: 600;">${item.actor}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.note || '—'}</td>
          </tr>
        `;
      });
      tbody.innerHTML = logRows;
    }
  }

  const panel = { mount, render };
  global.OperatorPanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
