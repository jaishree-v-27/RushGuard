/**
 * ==============================================================================
 * PANEL 1: CONTROL BAR (panels/controlBar.js)
 * ==============================================================================
 * Exports: mount(el) and render(state)
 * Buttons call actions ONLY via RushGuardStore.actions or events.
 * Handles:
 * - Scenario triggers (Normal, Nervous, Script burst, Slow-drip, Rush)
 * - Load Replay CSV (File API parsing)
 * - Replay speed & playback controls
 * - Config parameters & What-If tuner
 * - Operator Mode (Manual / Suggest / Auto)
 * - Operator / Student View role toggle
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
          <h2 id="heading-control-bar" class="card-title">
            <span aria-hidden="true">🎛️</span> Control Bar
          </h2>
          <p class="card-subtitle">Scenario triggers, simulation replay controls, and window threshold configuration.</p>
        </div>
        <div class="header-actions">
          <div class="button-group" role="group" aria-label="Role Switcher">
            <button id="role-operator-btn" class="btn btn-secondary btn-sm active" type="button" aria-pressed="true">
              <span aria-hidden="true">🛡️</span> Operator View
            </button>
            <button id="role-student-btn" class="btn btn-secondary btn-sm" type="button" aria-pressed="false">
              <span aria-hidden="true">🎓</span> Student View
            </button>
          </div>
        </div>
      </div>
      <div class="card-body">
        <!-- Scenario Trigger Buttons -->
        <div class="control-group">
          <div class="control-group-header">
            <h3 class="control-group-title">Scenario Selection</h3>
            <span class="field-hint">Deterministic evaluation patterns</span>
          </div>
          <p class="control-help">Select a test pattern to evaluate session traffic against the two-window engine.</p>
          <div class="button-group" role="group" aria-label="Scenario Selection">
            <button id="scenario-normal" class="btn btn-secondary" type="button" data-scenario="normal">
              Normal Traffic (6 sessions)
            </button>
            <button id="scenario-rush" class="btn btn-secondary" type="button" data-scenario="rush">
              Genuine Rush (30 students)
            </button>
            <button id="scenario-burst" class="btn btn-secondary" type="button" data-scenario="burst">
              Script Burst (15 in 3s)
            </button>
            <button id="scenario-slowdrip" class="btn btn-secondary" type="button" data-scenario="slowdrip">
              Slow-Drip Script (11 in 60s)
            </button>
            <button id="scenario-nervous" class="btn btn-secondary" type="button" data-scenario="nervous">
              Nervous Student (3 in 5s)
            </button>
          </div>
          <p id="scenario-notice" class="control-help" aria-live="polite">Choose a scenario to begin.</p>
        </div>

        <!-- Load Data & Replay Controls -->
        <div class="control-group">
          <div class="control-group-header">
            <h3 class="control-group-title">Replay & CSV Load</h3>
            <span class="badge badge-allow" id="replay-status-pill">Ready</span>
          </div>
          <div class="button-group" role="group" aria-label="Replay Controls">
            <input type="file" id="replay-load-csv" accept=".csv" class="visually-hidden">
            <label for="replay-load-csv" class="btn btn-secondary cursor-pointer" tabindex="0" role="button" aria-label="Upload Replay CSV">
              <span aria-hidden="true">📂</span> Load Replay CSV
            </label>

            <button id="replay-play-btn" class="btn btn-primary" type="button">
              <span id="replay-play-icon" aria-hidden="true">▶</span> <span id="replay-play-label">Play Replay</span>
            </button>
            <button id="replay-reset-btn" class="btn btn-secondary" type="button">
              <span aria-hidden="true">↺</span> Reset
            </button>

            <div class="button-group" role="group" aria-label="Replay Speed">
              <button id="speed-1x-btn" class="btn btn-secondary btn-sm active" type="button">1x</button>
              <button id="speed-5x-btn" class="btn btn-secondary btn-sm" type="button">5x</button>
              <button id="speed-10x-btn" class="btn btn-secondary btn-sm" type="button">10x Speed</button>
            </div>
          </div>
          <p id="csv-error-notice" class="field-hint error-hint" aria-live="polite"></p>
        </div>

        <!-- Operator Mode Selector -->
        <div class="control-group">
          <div class="control-group-header">
            <h3 class="control-group-title">Operator Mode</h3>
            <span class="field-hint">Defines AI involvement guardrails</span>
          </div>
          <div class="button-group" role="group" aria-label="Operator Mode Selection">
            <button id="mode-manual-btn" class="btn btn-secondary active" type="button" aria-pressed="true">
              <strong>Manual</strong> (Human decides all actions)
            </button>
            <button id="mode-suggest-btn" class="btn btn-secondary" type="button" aria-pressed="false">
              <strong>Suggest</strong> (AI recommends with 1-tap approval)
            </button>
            <button id="mode-auto-btn" class="btn btn-secondary" type="button" aria-pressed="false">
              <strong>Auto</strong> (AI acts within bounded amnesty limits)
            </button>
          </div>
        </div>

        <!-- Settings & What-If Tuner -->
        <details class="control-group" id="settings-accordion">
          <summary class="control-group-header cursor-pointer">
            <span class="control-group-title">⚙️ Two-Window Parameters & What-If Tuner</span>
            <span class="badge badge-neutral">Click to expand / edit</span>
          </summary>
          <div class="settings-grid">
            <div class="form-item">
              <label for="input-short-window">Short Window Length (s)</label>
              <input id="input-short-window" type="number" step="0.5" min="1" max="30" value="5">
              <span class="field-hint">Catches rapid-fire burst clicking</span>
            </div>
            <div class="form-item">
              <label for="input-long-window">Long Window Length (s)</label>
              <input id="input-long-window" type="number" step="1" min="10" max="300" value="60">
              <span class="field-hint">Catches slow-drip evasion scripts</span>
            </div>
            <div class="form-item">
              <label for="input-short-warn">Short Warn Threshold</label>
              <input id="input-short-warn" type="number" min="1" max="50" value="4">
              <span class="field-hint">Triggers amber advisory notice</span>
            </div>
            <div class="form-item">
              <label for="input-short-slow">Short Slow Threshold</label>
              <input id="input-short-slow" type="number" min="1" max="50" value="8">
              <span class="field-hint">Triggers orange pacing slow-lane delay</span>
            </div>
            <div class="form-item">
              <label for="input-long-warn">Long Warn Threshold</label>
              <input id="input-long-warn" type="number" min="1" max="100" value="11">
              <span class="field-hint">Catches sustained drip requests</span>
            </div>
            <div class="form-item">
              <label for="input-long-slow">Long Slow Threshold</label>
              <input id="input-long-slow" type="number" min="1" max="100" value="20">
              <span class="field-hint">Triggers slow-lane delay on sustained hammering</span>
            </div>
          </div>
          <div class="button-group" style="margin-top: 1rem;">
            <button id="apply-tuner-btn" class="btn btn-action btn-sm" type="button">
              Apply & Re-evaluate (What-If)
            </button>
            <button id="reset-tuner-btn" class="btn btn-secondary btn-sm" type="button">
              Reset Spec Defaults
            </button>
          </div>
        </details>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    if (!rootEl) return;

    // Scenario triggers
    const scenarioButtons = rootEl.querySelectorAll('[data-scenario]');
    scenarioButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenario = btn.getAttribute('data-scenario');
        if (global.RushGuardApp && global.RushGuardApp.loadScenario) {
          global.RushGuardApp.loadScenario(scenario);
        }
      });
    });

    // Role switcher
    const opBtn = rootEl.querySelector('#role-operator-btn');
    const stBtn = rootEl.querySelector('#role-student-btn');
    if (opBtn && stBtn) {
      opBtn.addEventListener('click', () => global.RushGuardStore.actions.setRole('operator'));
      stBtn.addEventListener('click', () => global.RushGuardStore.actions.setRole('student'));
    }

    // Operator modes
    const manBtn = rootEl.querySelector('#mode-manual-btn');
    const sugBtn = rootEl.querySelector('#mode-suggest-btn');
    const autoBtn = rootEl.querySelector('#mode-auto-btn');
    if (manBtn) manBtn.addEventListener('click', () => global.RushGuardStore.actions.setMode('Manual'));
    if (sugBtn) sugBtn.addEventListener('click', () => global.RushGuardStore.actions.setMode('Suggest'));
    if (autoBtn) autoBtn.addEventListener('click', () => global.RushGuardStore.actions.setMode('Auto'));

    // Replay controls
    const playBtn = rootEl.querySelector('#replay-play-btn');
    const resetBtn = rootEl.querySelector('#replay-reset-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (global.RushGuardApp && global.RushGuardApp.togglePlay) {
          global.RushGuardApp.togglePlay();
        }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (global.RushGuardApp && global.RushGuardApp.resetReplay) {
          global.RushGuardApp.resetReplay();
        }
      });
    }

    // Speed buttons
    const sp1 = rootEl.querySelector('#speed-1x-btn');
    const sp5 = rootEl.querySelector('#speed-5x-btn');
    const sp10 = rootEl.querySelector('#speed-10x-btn');
    if (sp1) sp1.addEventListener('click', () => global.RushGuardApp.setSpeed(1));
    if (sp5) sp5.addEventListener('click', () => global.RushGuardApp.setSpeed(5));
    if (sp10) sp10.addEventListener('click', () => global.RushGuardApp.setSpeed(10));

    // CSV file picker
    const fileInput = rootEl.querySelector('#replay-load-csv');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          if (global.RushGuardApp && global.RushGuardApp.loadCSV) {
            global.RushGuardApp.loadCSV(content, file.name);
          }
        };
        reader.readAsText(file);
      });
    }

    // What-If Tuner
    const applyTunerBtn = rootEl.querySelector('#apply-tuner-btn');
    const resetTunerBtn = rootEl.querySelector('#reset-tuner-btn');
    if (applyTunerBtn) {
      applyTunerBtn.addEventListener('click', () => {
        const sw = parseFloat(rootEl.querySelector('#input-short-window').value) || 5;
        const lw = parseFloat(rootEl.querySelector('#input-long-window').value) || 60;
        const swarn = parseInt(rootEl.querySelector('#input-short-warn').value, 10) || 4;
        const sslow = parseInt(rootEl.querySelector('#input-short-slow').value, 10) || 8;
        const lwarn = parseInt(rootEl.querySelector('#input-long-warn').value, 10) || 11;
        const lslow = parseInt(rootEl.querySelector('#input-long-slow').value, 10) || 20;

        global.RushGuardStore.actions.updateConfig({
          shortWindowSeconds: sw,
          longWindowSeconds: lw,
          shortWarnThreshold: swarn,
          shortSlowThreshold: sslow,
          longWarnThreshold: lwarn,
          longSlowThreshold: lslow
        });

        if (global.RushGuardApp && global.RushGuardApp.reEvaluateCurrentScenario) {
          global.RushGuardApp.reEvaluateCurrentScenario();
        }
      });
    }

    if (resetTunerBtn) {
      resetTunerBtn.addEventListener('click', () => {
        rootEl.querySelector('#input-short-window').value = 5;
        rootEl.querySelector('#input-long-window').value = 60;
        rootEl.querySelector('#input-short-warn').value = 4;
        rootEl.querySelector('#input-short-slow').value = 8;
        rootEl.querySelector('#input-long-warn').value = 11;
        rootEl.querySelector('#input-long-slow').value = 20;

        global.RushGuardStore.actions.updateConfig({
          shortWindowSeconds: 5,
          longWindowSeconds: 60,
          shortWarnThreshold: 4,
          shortSlowThreshold: 8,
          longWarnThreshold: 11,
          longSlowThreshold: 20
        });

        if (global.RushGuardApp && global.RushGuardApp.reEvaluateCurrentScenario) {
          global.RushGuardApp.reEvaluateCurrentScenario();
        }
      });
    }
  }

  function render(state) {
    if (!rootEl) return;

    // Highlight active scenario button
    const scenarioButtons = rootEl.querySelectorAll('[data-scenario]');
    scenarioButtons.forEach((btn) => {
      const isCurrent = btn.getAttribute('data-scenario') === state.activeScenario;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    });

    // Scenario announcement notice
    const noticeEl = rootEl.querySelector('#scenario-notice');
    if (noticeEl) {
      noticeEl.textContent = state.scenarioNotice || 'Choose a scenario to begin.';
    }

    // Role switcher states
    const opBtn = rootEl.querySelector('#role-operator-btn');
    const stBtn = rootEl.querySelector('#role-student-btn');
    if (opBtn) {
      const isOp = state.currentRole === 'operator';
      opBtn.classList.toggle('active', isOp);
      opBtn.setAttribute('aria-pressed', isOp ? 'true' : 'false');
    }
    if (stBtn) {
      const isSt = state.currentRole === 'student';
      stBtn.classList.toggle('active', isSt);
      stBtn.setAttribute('aria-pressed', isSt ? 'true' : 'false');
    }

    // Operator Mode buttons
    const manBtn = rootEl.querySelector('#mode-manual-btn');
    const sugBtn = rootEl.querySelector('#mode-suggest-btn');
    const autoBtn = rootEl.querySelector('#mode-auto-btn');
    if (manBtn) manBtn.classList.toggle('active', state.operatorMode === 'Manual');
    if (sugBtn) sugBtn.classList.toggle('active', state.operatorMode === 'Suggest');
    if (autoBtn) autoBtn.classList.toggle('active', state.operatorMode === 'Auto');

    // Replay controls
    const playLabel = rootEl.querySelector('#replay-play-label');
    const playIcon = rootEl.querySelector('#replay-play-icon');
    if (playLabel && playIcon) {
      if (state.replay && state.replay.isPlaying) {
        playLabel.textContent = 'Pause';
        playIcon.textContent = '⏸';
      } else {
        playLabel.textContent = 'Play Replay';
        playIcon.textContent = '▶';
      }
    }

    // Replay speeds
    const sp1 = rootEl.querySelector('#speed-1x-btn');
    const sp5 = rootEl.querySelector('#speed-5x-btn');
    const sp10 = rootEl.querySelector('#speed-10x-btn');
    const currentSpeed = (state.replay && state.replay.speed) || 1;
    if (sp1) sp1.classList.toggle('active', currentSpeed === 1);
    if (sp5) sp5.classList.toggle('active', currentSpeed === 5);
    if (sp10) sp10.classList.toggle('active', currentSpeed === 10);
  }

  const panel = { mount, render };
  global.ControlBarPanel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = panel;

})(typeof window !== 'undefined' ? window : this);
