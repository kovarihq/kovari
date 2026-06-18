import fs from "fs";
import readline from "readline";
import path from "path";

interface PerformanceLog {
  metric: string;
  duration: number;
  timestamp: string;
  [key: string]: any;
}

interface TraceLog {
  event: "REQUEST_TRACE";
  route: string;
  duration: number;
  status: number;
  timestamp: string;
}

async function generateReport(logFilePath: string) {
  if (!fs.existsSync(logFilePath)) {
    console.error(`Log file not found: ${logFilePath}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const metrics: Record<string, number[]> = {};
  const traces: Record<string, number[]> = {};
  const botTraffic: Record<string, number> = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      // Find the JSON part of the log line (in case Vercel prepends timestamps)
      const jsonStr = line.substring(line.indexOf("{"));
      if (!jsonStr) continue;

      const log = JSON.parse(jsonStr);

      if (log.event === "REQUEST_TRACE") {
        const trace = log as TraceLog;
        if (!traces[trace.route]) traces[trace.route] = [];
        traces[trace.route].push(trace.duration);
      } else if (log.metric) {
        const perfLog = log as PerformanceLog;
        if (!metrics[perfLog.metric]) metrics[perfLog.metric] = [];
        metrics[perfLog.metric].push(perfLog.duration);

        if (perfLog.metric === "homepage_traffic") {
          const ua = perfLog.userAgent || "Unknown";
          botTraffic[ua] = (botTraffic[ua] || 0) + 1;
        }
      }
    } catch (e) {
      // Ignore lines that aren't our JSON
    }
  }

  // --- Aggregate Data ---
  const aggregate = (data: Record<string, number[]>) => {
    return Object.entries(data).map(([key, durations]) => {
      const count = durations.length;
      const total = durations.reduce((a, b) => a + b, 0);
      const avg = total / count;
      const max = Math.max(...durations);
      return { key, count, total, avg, max };
    });
  };

  const metricStats = aggregate(metrics);
  const traceStats = aggregate(traces);

  // --- Generate Markdown ---
  let md = `# KOVARI Performance Forensics Report\n\n`;
  md += `*Generated: ${new Date().toISOString()}*\n\n`;

  md += `## 🚀 Client Request Traces (Top Routes by Duration)\n\n`;
  md += `| Route | Count | Avg Duration (ms) | Max Duration (ms) |\n`;
  md += `| --- | --- | --- | --- |\n`;
  traceStats
    .sort((a, b) => b.avg - a.avg)
    .forEach((s) => {
      md += `| \`${s.key}\` | ${s.count} | ${s.avg.toFixed(2)} | ${s.max} |\n`;
    });
  md += `\n`;

  md += `## ⏱️ Backend Metrics (Top Queries & Executions)\n\n`;
  md += `| Metric | Count | Avg Duration (ms) | Max Duration (ms) |\n`;
  md += `| --- | --- | --- | --- |\n`;
  metricStats
    .sort((a, b) => b.avg - a.avg)
    .forEach((s) => {
      if (s.key === "homepage_traffic") return;
      md += `| \`${s.key}\` | ${s.count} | ${s.avg.toFixed(2)} | ${s.max} |\n`;
    });
  md += `\n`;

  md += `## 🤖 Homepage Traffic (Bot Analysis)\n\n`;
  md += `| User-Agent | Requests |\n`;
  md += `| --- | --- |\n`;
  Object.entries(botTraffic)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ua, count]) => {
      md += `| \`${ua}\` | ${count} |\n`;
    });

  const outputPath = path.join(process.cwd(), "performance-report.md");
  fs.writeFileSync(outputPath, md);
  console.log(`✅ Performance report generated: ${outputPath}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: npx ts-node scripts/performance-report.ts <path-to-vercel-logs.txt>");
  process.exit(1);
}

generateReport(args[0]).catch(console.error);
