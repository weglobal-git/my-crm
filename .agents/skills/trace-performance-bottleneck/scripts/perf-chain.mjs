#!/usr/bin/env node

/**
 * Universal State Machine & Exit Gate Controller for trace-performance-bottleneck
 * Usage:
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs status
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs init <url> <actionId> <actionName> "<completionSignal>"
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs record baseline --runs 120,115,118,122,119 --bytes 45200 --requests 8
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs record postfix --runs 35,32,34,36,33 --bytes 12100 --requests 2
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs pass-gate <phaseNum> "<evidenceSummary>"
 *   node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs reset
 */

import fs from "fs";
import path from "path";

const STATE_DIR = path.resolve(process.cwd(), ".perf-trace");
const SESSION_FILE = path.join(STATE_DIR, "session.json");

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch (err) {
    console.error("Error reading session file:", err.message);
    return null;
  }
}

function saveSession(data) {
  ensureStateDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function computeStats(samples) {
  if (!samples || samples.length === 0) return { p50: 0, p95: 0, min: 0, max: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  // p50 (median)
  const mid = Math.floor(sorted.length / 2);
  const p50 = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  
  // p95
  const idx95 = Math.ceil(0.95 * sorted.length) - 1;
  const p95 = sorted[Math.max(0, Math.min(idx95, sorted.length - 1))];

  return { p50, p95, min, max, count: sorted.length };
}

const args = process.argv.slice(2);
const command = args[0] || "status";

switch (command) {
  case "init": {
    const targetUrl = args[1] || "http://localhost:3003";
    const actionId = args[2] || "ACT-01";
    const actionName = args[3] || "Primary Action";
    const completionSignal = args[4] || "Observable DOM Element Painted";

    const session = {
      targetUrl,
      currentPhase: 1, // Phase 0 is complete by choosing the action
      selectedAction: {
        id: actionId,
        name: actionName,
        completionSignal,
      },
      phaseGates: {
        0: { status: "PASSED", at: new Date().toISOString(), note: `Selected single golden action: ${actionId}` },
        1: { status: "PENDING" },
        2: { status: "PENDING" },
        3: { status: "PENDING" },
        4: { status: "PENDING" },
        5: { status: "PENDING" },
      },
      baseline: null,
      causalProof: null,
      postFix: null,
      updatedAt: new Date().toISOString(),
    };

    saveSession(session);
    console.log(`\n✅ Session initialized!`);
    console.log(`- Target URL: ${targetUrl}`);
    console.log(`- Golden Action: [${actionId}] ${actionName}`);
    console.log(`- Completion Signal: "${completionSignal}"`);
    console.log(`- Current Active Phase: Phase 1 (Instrumentation)`);
    console.log(`\nNext Step: Read .agents/skills/trace-performance-bottleneck/phases/phase-1-instrumentation.md\n`);
    break;
  }

  case "status": {
    const session = loadSession();
    if (!session) {
      console.log("\n[PERF-CHAIN] No active performance tracing session.");
      console.log("Run: node .agents/skills/trace-performance-bottleneck/scripts/perf-chain.mjs init <url> <actionId> <actionName> \"<completionSignal>\"\n");
      process.exit(0);
    }

    console.log("\n=======================================================");
    console.log("       PERFORMANCE BOTTLENECK CHAIN SESSION STATUS");
    console.log("=======================================================");
    console.log(`Target URL:        ${session.targetUrl}`);
    console.log(`Golden Action:     [${session.selectedAction.id}] ${session.selectedAction.name}`);
    console.log(`Completion Signal: "${session.selectedAction.completionSignal}"`);
    console.log(`Current Phase:     PHASE ${session.currentPhase}`);
    console.log("-------------------------------------------------------");
    console.log("PHASE GATES:");
    for (let i = 0; i <= 5; i++) {
      const g = session.phaseGates[i] || { status: "PENDING" };
      const mark = g.status === "PASSED" ? "✅ PASSED" : (session.currentPhase === i ? "⏳ ACTIVE" : "⚪ PENDING");
      console.log(`  Phase ${i}: ${mark.padEnd(12)} ${g.note ? `(${g.note})` : ""}`);
    }
    console.log("-------------------------------------------------------");
    if (session.baseline) {
      console.log(`Baseline Metrics:  p50=${session.baseline.p50}ms | p95=${session.baseline.p95}ms | Requests=${session.baseline.requests} | Bytes=${session.baseline.bytes}B`);
    }
    if (session.causalProof) {
      console.log(`Causal Bottleneck: ${session.causalProof.bottleneckSpan} (predicted reduction: ${session.causalProof.predictedReduction}ms)`);
    }
    if (session.postFix) {
      console.log(`Post-Fix Metrics:  p50=${session.postFix.p50}ms | p95=${session.postFix.p95}ms | Requests=${session.postFix.requests} | Bytes=${session.postFix.bytes}B`);
      if (session.baseline) {
        const deltaP50 = session.baseline.p50 - session.postFix.p50;
        const pctP50 = ((deltaP50 / session.baseline.p50) * 100).toFixed(1);
        console.log(`Improvement:       Δp50 = -${deltaP50}ms (-${pctP50}%)`);
      }
    }
    console.log("=======================================================\n");
    break;
  }

  case "record": {
    const session = loadSession();
    if (!session) {
      console.error("Error: No session found. Run init first.");
      process.exit(1);
    }

    const type = args[1]; // 'baseline' | 'postfix'
    if (type !== "baseline" && type !== "postfix") {
      console.error("Error: Type must be 'baseline' or 'postfix'");
      process.exit(1);
    }

    let runs = [];
    let bytes = 0;
    let requests = 0;

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--runs" && args[i + 1]) {
        runs = args[i + 1].split(",").map(Number).filter(n => !isNaN(n));
      }
      if (args[i] === "--bytes" && args[i + 1]) {
        bytes = Number(args[i + 1]) || 0;
      }
      if (args[i] === "--requests" && args[i + 1]) {
        requests = Number(args[i + 1]) || 0;
      }
    }

    if (runs.length < 5) {
      console.error(`Error: Must record at least 5 measured runs (got ${runs.length}). Rule: Never present one run as representative.`);
      process.exit(1);
    }

    const stats = computeStats(runs);
    const payload = {
      rawRuns: runs,
      p50: stats.p50,
      p95: stats.p95,
      min: stats.min,
      max: stats.max,
      bytes,
      requests,
      recordedAt: new Date().toISOString(),
    };

    if (type === "baseline") {
      session.baseline = payload;
    } else {
      session.postFix = payload;
    }

    session.updatedAt = new Date().toISOString();
    saveSession(session);

    console.log(`\n✅ Recorded ${type.toUpperCase()} successfully:`);
    console.log(`  Raw Runs: [${runs.join(", ")}] ms`);
    console.log(`  p50 (Median): ${stats.p50} ms`);
    console.log(`  p95:          ${stats.p95} ms`);
    console.log(`  Requests:     ${requests}`);
    console.log(`  Transfer:     ${bytes} bytes\n`);
    break;
  }

  case "pass-gate": {
    const session = loadSession();
    if (!session) {
      console.error("Error: No session found. Run init first.");
      process.exit(1);
    }

    const phaseNum = parseInt(args[1], 10);
    const note = args[2] || "Exit gate satisfied";

    if (isNaN(phaseNum) || phaseNum < 0 || phaseNum > 5) {
      console.error("Error: Valid phase number (0 to 5) required.");
      process.exit(1);
    }

    // Gate checks
    if (phaseNum === 2 && !session.baseline) {
      console.error("Error: Cannot pass Phase 2 exit gate without recording baseline first! Use 'record baseline --runs ...'");
      process.exit(1);
    }

    if (phaseNum === 5 && !session.postFix) {
      console.error("Error: Cannot pass Phase 5 exit gate without recording postFix first! Use 'record postfix --runs ...'");
      process.exit(1);
    }

    session.phaseGates[phaseNum] = {
      status: "PASSED",
      at: new Date().toISOString(),
      note,
    };

    if (phaseNum < 5) {
      session.currentPhase = phaseNum + 1;
    }

    session.updatedAt = new Date().toISOString();
    saveSession(session);

    console.log(`\n🎉 PHASE ${phaseNum} EXIT GATE PASSED!`);
    console.log(`Evidence: "${note}"`);
    if (phaseNum < 5) {
      console.log(`🔓 Unlocked PHASE ${phaseNum + 1}`);
      console.log(`Read next: .agents/skills/trace-performance-bottleneck/phases/phase-${phaseNum + 1}-*.md\n`);
    } else {
      console.log(`🏆 ALL PHASES COMPLETE! Verification and cleanup finished.\n`);
    }
    break;
  }

  case "reset": {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
    console.log("\n🗑️ Session cleared.\n");
    break;
  }

  default:
    console.log(`Unknown command: ${command}`);
    process.exit(1);
}
