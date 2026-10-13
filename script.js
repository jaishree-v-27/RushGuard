document.addEventListener("DOMContentLoaded", function () {
  // Get the existing dashboard elements
  const activeSessions = document.getElementById("active-sessions");
  const slowedSessions = document.getElementById("slowed-sessions");
  const systemHealth = document.getElementById("system-health");
  const sessionTable = document.getElementById("session-table");
  
const sessionSearch = document.getElementById("session-search");
const statusFilter = document.getElementById("status-filter");
const sessionCount = document.getElementById("session-count");

  const scenarioStatus = document.getElementById("scenario-status");
  const scenariosSection = document.querySelector(".scenarios");
  const chartCanvas = document.getElementById("traffic-chart");
const chartScenarioLabel = document.getElementById("chart-scenario-label");
let trafficChart = null;

const distributionCanvas = document.getElementById("risk-distribution-chart");
const distributionScenarioLabel = document.getElementById("distribution-scenario-label");
let distributionChart = null;


  if (!sessionTable || !scenariosSection) {
    console.error("RushGuard: Required dashboard elements are missing.");
    return;
  }

  // Add the detection summary dynamically.
  // Your existing HTML and layout do not need to be edited.
  let summary = document.getElementById("detection-summary");

  if (!summary) {
    summary = document.createElement("div");
    summary.id = "detection-summary";
    summary.innerHTML = `
      <h3>Detection Summary</h3>
      <p>Allowed Sessions: <strong id="allowed-count">0</strong></p>
      <p>Warned Sessions: <strong id="warned-count">0</strong></p>
      <p>Slowed Sessions: <strong id="summary-slowed-count">0</strong></p>
    `;
    scenariosSection.appendChild(summary);
  }

  const allowedCount = document.getElementById("allowed-count");
  const warnedCount = document.getElementById("warned-count");
  const summarySlowedCount = document.getElementById(
    "summary-slowed-count"
  );

  // Simulated session data for each scenario.
  // These are test values, not live network traffic.
  const scenarioData = {
    Normal: [
      1, 2, 1, 3, 2, 1, 4, 2, 3, 1, 5, 2
    ],
    Rush: [
      2, 4, 6, 3, 8, 5, 9, 2, 7, 10, 4, 6
    ],
    "Script Flood": [
  12, 15, 18, 2, 14, 20, 3, 16, 11, 5, 6, 1
],
    "Slow-drip": [
      2, 4, 6, 8, 3, 5, 7, 9, 4, 6, 8, 3
    ]
  };
  
  const comparisonTable = document.getElementById("comparison-table");

  
function updateComparisonTable() {
  comparisonTable.replaceChildren();

  Object.keys(scenarioData).forEach(function (name) {
    const results = scenarioData[name].map(function (count) {
      return detectStatus(count);
    });

    const allowed = results.filter(
      status => status === "Allow"
    ).length;

    const warned = results.filter(
      status => status === "Warn"
    ).length;

    const slowed = results.filter(
      status => status === "Slow"
    ).length;

    const total = allowed + warned + slowed;
    const row = document.createElement("tr");

    [name, allowed, warned, slowed, total].forEach(function (value) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    comparisonTable.appendChild(row);
  });
}


  updateComparisonTable();


  // Simulated detection rules:
  // 1–3 submissions: Allow
  // 4–7 submissions: Warn
  // 8 or more submissions: Slow
  function detectStatus(submissions) {
    if (submissions >= 8) {
      return "Slow";
    }

    if (submissions >= 4) {
      return "Warn";
    }

    return "Allow";
  }
  
function calculateRiskScore(submissions) {
  if (submissions >= 8) {
    return Math.min(100, 80 + (submissions - 8) * 4);
  }

  if (submissions >= 4) {
    return 40 + (submissions - 4) * 8;
  }

  return 10 + submissions * 5;
}

function updateActivityLog(name, results) {
  const activityLog = document.getElementById("activity-log-list");

  if (!activityLog) {
    return;
  }

  activityLog.replaceChildren();
const eventCounter = document.getElementById("activity-event-count");
  function addEvent(message, type) {
    const item = document.createElement("li");
    item.textContent = message;

    if (type) {
      item.classList.add("activity-" + type);
    }

    activityLog.appendChild(item);
  }

  addEvent("Scenario started: " + name, "info");

  const warned = results.filter(function (session) {
    return session.status === "Warn";
  }).length;

  const slowed = results.filter(function (session) {
    return session.status === "Slow";
  }).length;

  if (warned > 0) {
    addEvent(
      warned + " session(s) showed elevated submission activity.",
      "warning"
    );
  }

  if (slowed > 0) {
    addEvent(
      slowed + " session(s) reached the slowdown threshold.",
      "danger"
    );
  }

  addEvent(
    "Scenario complete. " + results.length + " simulated sessions analyzed.",
    "info"
  );
  
if (eventCounter) {
  const totalEvents = activityLog.querySelectorAll("li").length;
  eventCounter.textContent =
    totalEvents + (totalEvents === 1 ? " event" : " events");
}
}

  function runScenario(name) {
    const submissions = scenarioData[name];

    if (!submissions) {
      return;
    }

    const results = submissions.map(function (count, index) {
  return {
    id: "S-" + String((index + 1) * 7).padStart(3, "0"),
    submissions: count,
    status: detectStatus(count),
    riskScore: calculateRiskScore(count)
  };
});
updateActivityLog(name, results);
// Update the traffic analytics chart.
if (chartCanvas && typeof Chart !== "undefined") {
  const chartContext = chartCanvas.getContext("2d");

  const labels = submissions.map(function (_, index) {
    return "S-" + String((index + 1) * 7).padStart(3, "0");
  });

  const chartData = {
    labels: labels,
    datasets: [
      {
        label: "Submissions",
        data: submissions,
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.18)",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true
      },
      {
        label: "Warn threshold (4)",
        data: labels.map(() => 4),
        borderColor: "#fbbf24",
        borderWidth: 1.5,
        pointRadius: 0,
        borderDash: [5, 5],
        fill: false
      },
      {
        label: "Slow threshold (8)",
        data: labels.map(() => 8),
        borderColor: "#fb7185",
        borderWidth: 1.5,
        pointRadius: 0,
        borderDash: [5, 5],
        fill: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        labels: {
          color: "#c2d0e2",
          usePointStyle: true,
          padding: 18
        }
      },
      tooltip: {
        backgroundColor: "#14263b",
        titleColor: "#ffffff",
        bodyColor: "#e7f0ff",
        borderColor: "#38516d",
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: "#91a4bd", maxRotation: 0 },
        grid: { color: "rgba(145, 164, 189, 0.08)" }
      },
      y: {
        beginAtZero: true,
        suggestedMax: Math.max(10, ...submissions) + 2,
        ticks: { color: "#91a4bd", precision: 0 },
        grid: { color: "rgba(145, 164, 189, 0.12)" },
        title: {
          display: true,
          text: "Submission count",
          color: "#91a4bd"
        }
      }
    }
  };

  if (trafficChart) {
    trafficChart.destroy();
  }

  trafficChart = new Chart(chartContext, {
    type: "line",
    data: chartData,
    options: chartOptions
  });

  if (chartScenarioLabel) {
    chartScenarioLabel.textContent = name.toUpperCase();
  }
}


    // Calculate the summary counts.
    const allowed = results.filter(function (session) {
      return session.status === "Allow";
    }).length;

    const warned = results.filter(function (session) {
      return session.status === "Warn";
    }).length;

    const slowed = results.filter(function (session) {
      return session.status === "Slow";
    }).length;
    
    // Update the risk distribution doughnut chart.
    if (distributionCanvas && typeof Chart !== "undefined") {
      const distributionData = {
        labels: ["Allow", "Warn", "Slow"],
        datasets: [{
          data: [allowed, warned, slowed],
          backgroundColor: ["#4ade80", "#fbbf24", "#fb7185"],
          borderColor: "#14263b",
          borderWidth: 3,
          hoverOffset: 8
        }]
      };

      if (distributionChart) {
        distributionChart.destroy();
      }

      distributionChart = new Chart(distributionCanvas, {
        type: "doughnut",
        data: distributionData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: "#c2d0e2",
                padding: 18,
                usePointStyle: true
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return context.label + ": " + context.raw + " sessions";
                }
              }
            }
          }
        }
      });

      if (distributionScenarioLabel) {
        distributionScenarioLabel.textContent = name.toUpperCase();
      }
    }


    // Update the existing metrics.
    if (activeSessions) {
      activeSessions.textContent = "34";
    }

    if (slowedSessions) {
      slowedSessions.textContent = slowed;
    }

    // Keep the existing health metric as a display value.
    // It is not a measurement of real system health.

    // Update the existing session table.
    sessionTable.replaceChildren();

    results.forEach(function (session) {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = session.id;

      const submissionsCell = document.createElement("td");
      submissionsCell.textContent = session.submissions;

      
const statusCell = document.createElement("td");

const statusBadge = document.createElement("span");
statusBadge.textContent = session.status;
statusBadge.className =
  "status-badge status-" + session.status.toLowerCase();

statusCell.appendChild(statusBadge);


const riskCell = document.createElement("td");
riskCell.className = "risk-score";

const riskScore = session.riskScore;

const riskValue = document.createElement("div");
riskValue.textContent = riskScore + " / 100";
riskValue.className = "risk-score-value";

const riskBar = document.createElement("div");
riskBar.className = "risk-bar";

const riskFill = document.createElement("div");
riskFill.className = "risk-bar-fill";
riskFill.style.width = riskScore + "%";

if (riskScore < 40) {
  riskValue.classList.add("risk-low");
  riskFill.classList.add("risk-fill-low");
} else if (riskScore < 70) {
  riskValue.classList.add("risk-medium");
  riskFill.classList.add("risk-fill-medium");
} else {
  riskValue.classList.add("risk-high");
  riskFill.classList.add("risk-fill-high");
}

riskBar.appendChild(riskFill);
riskCell.append(riskValue, riskBar);

const reasonCell = document.createElement("td");

if (session.submissions >= 8) {
  reasonCell.textContent = "High submission activity";
} else if (session.submissions >= 4) {
  reasonCell.textContent = "Elevated submission activity";
} else {
  reasonCell.textContent = "Normal submission activity";
}

      row.append(
  idCell,
  submissionsCell,
  statusCell,
  riskCell,
  reasonCell
);
      sessionTable.appendChild(row);
    });
filterSessions();
    // Update the detection summary.
    allowedCount.textContent = allowed;
    warnedCount.textContent = warned;
    summarySlowedCount.textContent = slowed;

    // Update the scenario message.
    
if (scenarioStatus) {
  scenarioStatus.textContent =
    "Simulation complete — " + name + ": " +
    allowed + " allowed, " +
    warned + " warned, " +
    slowed + " slowed. These are simulated results.";
  
  scenarioStatus.classList.remove("status-running");
  scenarioStatus.classList.add("status-complete");
}


    // Print a summary for debugging in the browser console.
    console.log("RushGuard scenario:", name);
    console.log("Allowed sessions:", allowed);
    console.log("Warned sessions:", warned);
    console.log("Slowed sessions:", slowed);
  }

  // Filter session rows using both search and status.
  function filterSessions() {
    const searchTerm = sessionSearch
      ? sessionSearch.value.trim().toLowerCase()
      : "";

    const selectedStatus = statusFilter
      ? statusFilter.value
      : "All";

    const rows = sessionTable.querySelectorAll("tr");
    let visibleCount = 0;

    rows.forEach(function (row) {
      // Ignore the initial placeholder row.
      if (row.cells.length < 5) {
        return;
      }

      const sessionId = row.cells[0].textContent.toLowerCase();
      const sessionStatus = row.cells[2].textContent.trim();

      const matchesSearch = sessionId.includes(searchTerm);
      const matchesStatus =
        selectedStatus === "All" ||
        sessionStatus === selectedStatus;

      const isVisible = matchesSearch && matchesStatus;

      row.style.display = isVisible ? "" : "none";

      if (isVisible) {
        visibleCount++;
      }
    });

    if (sessionCount) {
      sessionCount.textContent =
        visibleCount + (visibleCount === 1 ? " session" : " sessions");
    }
  }

  // Respond to search and status changes.
  if (sessionSearch) {
    sessionSearch.addEventListener("input", filterSessions);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", filterSessions);
  }

  // Connect the four existing buttons without duplicating them.
  const buttons = scenariosSection.querySelectorAll("button");

  buttons.forEach(function (button) {
    
const name = button.dataset.scenario || button.textContent.trim();


    if (Object.prototype.hasOwnProperty.call(scenarioData, name)) {
      

button.addEventListener("click", function () {
  buttons.forEach(function (item) {
    item.classList.remove("active");
  });

  button.classList.add("active");

  if (scenarioStatus) {
    scenarioStatus.textContent =
      "Simulation running — processing " + name + "...";

    scenarioStatus.classList.remove("status-complete");
    scenarioStatus.classList.add("status-running");
  }
setTimeout(function () {
  runScenario(name);
}, 400);

});

    }
  });

  // Export the currently displayed session data to CSV.
  const exportButton = document.getElementById("export-button");

  if (exportButton) {
    exportButton.addEventListener("click", function () {
      const rows = sessionTable.querySelectorAll("tr");
      const csvRows = [
        ["Session ID", "Submissions", "Status", "Risk Score", "Detection Reason"]
      ];

      rows.forEach(function (row) {
        if (row.cells.length < 5 || row.style.display === "none") {
          return;
        }

        csvRows.push([
          row.cells[0].textContent.trim(),
          row.cells[1].textContent.trim(),
          row.cells[2].textContent.trim(),
          row.cells[3].querySelector(".risk-score-value")?.textContent.trim() || "",
          row.cells[4].textContent.trim()
        ]);
      });

      if (csvRows.length === 1) {
        alert("No session data to export. Please select a scenario first.");
        return;
      }

      const csvContent = csvRows.map(function (row) {
        return row.map(function (value) {
          return '"' + String(value).replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\r\n");

      const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "rushguard-sessions.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  // Reset the dashboard to its initial demo state.
  const resetButton = document.getElementById("reset-button");

  if (resetButton) {
    resetButton.addEventListener("click", function () {
        
  buttons.forEach(function (button) {
    button.classList.remove("active");
  });

      // Clear the session filters.
      if (sessionSearch) {
        sessionSearch.value = "";
      }

      if (statusFilter) {
        statusFilter.value = "All";
      }

      // Clear the session table.
      sessionTable.replaceChildren();
      
const activityLog = document.getElementById("activity-log-list");

const resetEventCounter =
  document.getElementById("activity-event-count");

if (resetEventCounter) {
  resetEventCounter.textContent = "0 events";
}

if (activityLog) {
  activityLog.replaceChildren();

  const emptyMessage = document.createElement("li");
  emptyMessage.className = "activity-empty";
  emptyMessage.textContent =
    "Select a scenario to view simulated activity.";

  activityLog.appendChild(emptyMessage);
}


      const placeholderRow = document.createElement("tr");
      const placeholderCell = document.createElement("td");

      placeholderCell.colSpan = 5;
      placeholderCell.textContent =
        "Choose a scenario to view sessions.";

      placeholderRow.appendChild(placeholderCell);
      sessionTable.appendChild(placeholderRow);

      // Reset dashboard metrics and summary.
      if (activeSessions) activeSessions.textContent = "34";
      if (slowedSessions) slowedSessions.textContent = "0";
      if (allowedCount) allowedCount.textContent = "0";
      if (warnedCount) warnedCount.textContent = "0";
      if (summarySlowedCount) summarySlowedCount.textContent = "0";
      if (sessionCount) sessionCount.textContent = "0 sessions";

      if (scenarioStatus) {
        scenarioStatus.textContent =
          "Select a scenario to begin. Results are simulated.";
      }

      // Reset chart labels.
      if (chartScenarioLabel) {
        chartScenarioLabel.textContent = "NO SCENARIO SELECTED";
      }

      if (distributionScenarioLabel) {
        distributionScenarioLabel.textContent = "NO SCENARIO SELECTED";
      }

      // Remove the current charts.
      if (trafficChart) {
        trafficChart.destroy();
        trafficChart = null;
      }

      if (distributionChart) {
        distributionChart.destroy();
        distributionChart = null;
      }

      // Refresh the comparison table.
      updateComparisonTable();

      console.log("RushGuard demo reset.");
    });
  }

  console.log("RushGuard initialized successfully.");
});
