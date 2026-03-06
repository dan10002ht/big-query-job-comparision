const fetch = require('node-fetch');

/**
 * Send report to Discord via webhook
 * @param {string} webhookUrl
 * @param {Object} report
 * @returns {Promise<void>}
 */
async function sendDiscordReport(webhookUrl, report) {
  if (!webhookUrl) {
    console.warn('⚠️  Discord webhook URL not provided, skipping Discord send');
    return;
  }

  try {
    const message = buildDiscordMessage(report);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Discord webhook failed (${response.status}):`, error);
      throw new Error(`HTTP ${response.status}`);
    }

    console.log('✅ Report sent to Discord successfully');
  } catch (error) {
    console.error('❌ Error sending Discord report:', error.message);
    throw error;
  }
}

/**
 * Build Discord message with embeds
 * @param {Object} report
 * @returns {Object}
 */
function buildDiscordMessage(report) {
  const embeds = [];

  // Daily summary embed
  embeds.push(buildDailySummaryEmbed(report));

  // Top patterns comparison embed
  if (report.topPatternComparisons && report.topPatternComparisons.length > 0) {
    embeds.push(buildTopPatternsEmbed(report.topPatternComparisons));
  }

  // Anomalies embed (if any)
  const anomalies = report.topPatternComparisons.filter(p => Math.abs(p.changeScore) >= 20);
  if (anomalies.length > 0) {
    embeds.push(buildAnomaliesEmbed(anomalies));
  }

  return {
    username: '📊 BigQuery Job Analyzer',
    embeds: embeds
  };
}

/**
 * Build daily summary embed
 * @param {Object} report
 * @returns {Object}
 */
function buildDailySummaryEmbed(report) {
  const stats = report.dailyComparison;
  const today = report.todayDate;
  const yesterday = report.yesterdayDate;

  const queryChange = stats.queryChangePercent >= 0 ? '📈' : '📉';
  const gbChange = stats.gbChangePercent >= 0 ? '📈' : '📉';
  const costChange = stats.estimatedCostChangePercent >= 0 ? '📈' : '📉';

  return {
    title: '📊 BigQuery Job Analysis Report',
    description: `Daily comparison: ${yesterday} vs ${today}`,
    color: getColorByChange(Math.max(Math.abs(stats.queryChangePercent), Math.abs(stats.gbChangePercent))),
    fields: [
      {
        name: '📅 Yesterday',
        value: `Queries: ${stats.yesterdayQueries}\nGB: ${stats.yesterdayGB}\nCost: $${stats.yesterdayEstimatedCost}`,
        inline: true
      },
      {
        name: '📅 Today',
        value: `Queries: ${stats.todayQueries}\nGB: ${stats.todayGB}\nCost: $${stats.todayEstimatedCost}`,
        inline: true
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false
      },
      {
        name: `${queryChange} Query Change`,
        value: `${stats.queryChange > 0 ? '+' : ''}${stats.queryChange} queries (${stats.queryChangePercent > 0 ? '+' : ''}${stats.queryChangePercent}%)`,
        inline: true
      },
      {
        name: `${gbChange} GB Change`,
        value: `${stats.gbChange > 0 ? '+' : ''}${stats.gbChange.toFixed(2)} GB (${stats.gbChangePercent > 0 ? '+' : ''}${stats.gbChangePercent}%)`,
        inline: true
      },
      {
        name: `${costChange} Cost Change`,
        value: `${stats.estimatedCostChange > 0 ? '+' : ''}$${stats.estimatedCostChange.toFixed(2)} (${stats.estimatedCostChangePercent > 0 ? '+' : ''}${stats.estimatedCostChangePercent}%)`,
        inline: true
      }
    ],
    footer: {
      text: `Generated: ${new Date().toISOString()}`
    }
  };
}

/**
 * Build top patterns comparison embed
 * @param {Array} comparisons
 * @returns {Object}
 */
function buildTopPatternsEmbed(comparisons) {
  // Remove duplicate patterns (by combination of type + key characteristics)
  const uniquePatterns = [];
  const seenKeys = new Set();
  
  for (const comp of comparisons) {
    // Create unique key from query type and first substantial part
    const queryType = comp.originalQuery.trim().split(/\s+/)[0].toUpperCase();
    const querySubstance = comp.originalQuery.substring(0, 80);
    const uniqueKey = `${queryType}::${querySubstance}`;
    
    if (!seenKeys.has(uniqueKey)) {
      uniquePatterns.push(comp);
      seenKeys.add(uniqueKey);
      if (uniquePatterns.length >= 5) break;
    }
  }

  let patternText = '';
  uniquePatterns.forEach((comp, idx) => {
    const execIcon = comp.executionChange > 0 ? '📈' : (comp.executionChange < 0 ? '📉' : '➡️');
    const gbIcon = comp.gbChange > 0 ? '📈' : (comp.gbChange < 0 ? '📉' : '➡️');

    let statusLine = '';
    if (comp.isNew) {
      statusLine = `${comp.status} **NEW PATTERN**`;
    } else {
      statusLine = `${comp.status} Executions: ${comp.yesterdayExecutions} → ${comp.todayExecutions} ${comp.executionChangePercent !== 0 ? `(${execIcon} ${comp.executionChangePercent > 0 ? '+' : ''}${comp.executionChangePercent}%)` : '(no change)'}`;
    }

    const gbLine = comp.isNew 
      ? `📊 GB: ${comp.todayGB} GB (NEW)`
      : `📊 GB: ${comp.yesterdayGB} → ${comp.todayGB} GB ${comp.gbChangePercent !== 0 ? `(${gbIcon} ${comp.gbChangePercent > 0 ? '+' : ''}${comp.gbChangePercent}%)` : '(no change)'}`;

    // Get query type (first word)
    const queryLines = comp.originalQuery.trim().split('\n');
    const queryType = queryLines[0].split(/\s+/)[0].toUpperCase();
    
    // Show more of query for clarity
    const queryDisplay = comp.originalQuery.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const queryPreview = queryDisplay.length > 180 ? queryDisplay.substring(0, 180) + '...' : queryDisplay;

    patternText += `\n**${idx + 1}. [${queryType}]** ${comp.changeScore > 50 ? '🔴' : comp.changeScore > 20 ? '🟠' : '🟢'}\n`;
    patternText += `${statusLine}\n`;
    patternText += `${gbLine}\n`;
    patternText += `\n\`\`\`\n${queryPreview}\n\`\`\`\n`;
  });

  return {
    title: '📈 Top 5 Pattern Changes',
    description: `${uniquePatterns.length} unique patterns analyzed. Ranked by largest change.`,
    color: 9442302, // Purple
    fields: [
      {
        name: 'Pattern Analysis',
        value: patternText || '✅ No pattern changes detected',
        inline: false
      }
    ]
  };
}

/**
 * Build anomalies embed
 * @param {Array} anomalies
 * @returns {Object}
 */
function buildAnomaliesEmbed(anomalies) {
  // Remove duplicates by unique key
  const uniqueAnomalies = [];
  const seenKeys = new Set();
  
  for (const anom of anomalies) {
    const queryType = anom.originalQuery.trim().split(/\s+/)[0].toUpperCase();
    const querySubstance = anom.originalQuery.substring(0, 80);
    const uniqueKey = `${queryType}::${querySubstance}`;
    
    if (!seenKeys.has(uniqueKey)) {
      uniqueAnomalies.push(anom);
      seenKeys.add(uniqueKey);
      if (uniqueAnomalies.length >= 3) break;
    }
  }

  let anomalyText = '';

  uniqueAnomalies.forEach((anom, idx) => {
    const severity = anom.changeScore >= 50 ? '🚨 CRITICAL' : anom.changeScore >= 20 ? '⚠️ WARNING' : '📌 NOTICE';
    
    let details = '';
    if (anom.isNew) {
      details = `New pattern: ${anom.todayExecutions} executions, ${anom.todayGB} GB`;
    } else {
      const execChangeDir = anom.executionChange > 0 ? '↑' : '↓';
      const gbChangeDir = anom.gbChange > 0 ? '↑' : '↓';
      details = `Executions: ${execChangeDir} ${Math.abs(anom.executionChangePercent)}% | GB: ${gbChangeDir} ${Math.abs(anom.gbChangePercent)}%`;
    }

    anomalyText += `**${idx + 1}. ${severity}** (Score: ${anom.changeScore.toFixed(1)}%)\n${details}\n\n`;
  });

  return {
    title: '🚨 Anomalies Detected',
    description: `${uniqueAnomalies.length} significant pattern changes found`,
    color: 16711680, // Red
    fields: [
      {
        name: 'Alerts',
        value: anomalyText || '✅ No anomalies detected',
        inline: false
      }
    ]
  };
}

/**
 * Get color based on change percentage
 * @param {number} changePercent
 * @returns {number}
 */
function getColorByChange(changePercent) {
  if (changePercent >= 50) return 16711680; // Red
  if (changePercent >= 20) return 16776960; // Orange
  return 65280; // Green
}

module.exports = {
  sendDiscordReport,
  buildDiscordMessage
};
