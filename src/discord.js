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

  return {
    title: '📊 BigQuery Job Analysis Report',
    description: `Daily comparison: ${yesterday} vs ${today}`,
    color: getColorByChange(Math.max(Math.abs(stats.queryChangePercent), Math.abs(stats.gbChangePercent))),
    fields: [
      {
        name: '📅 Yesterday',
        value: `${stats.yesterdayQueries} queries • ${stats.yesterdayGB} GB`,
        inline: true
      },
      {
        name: '📅 Today',
        value: `${stats.todayQueries} queries • ${stats.todayGB} GB`,
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
  const topPatterns = comparisons.slice(0, 5);

  let patternText = '';
  topPatterns.forEach((comp, idx) => {
    const execIcon = comp.executionChange > 0 ? '📈' : (comp.executionChange < 0 ? '📉' : '➡️');
    const gbIcon = comp.gbChange > 0 ? '📈' : (comp.gbChange < 0 ? '📉' : '➡️');

    let statusLine = '';
    if (comp.isNew) {
      statusLine = `${comp.status} **NEW PATTERN**\n`;
    } else {
      statusLine = `${comp.status} Executions: ${comp.yesterdayExecutions} → ${comp.todayExecutions} (${execIcon} ${comp.executionChangePercent > 0 ? '+' : ''}${comp.executionChangePercent}%)\n`;
    }

    const gbLine = comp.isNew 
      ? `GB Scanned: ${comp.todayGB} GB (NEW)\n`
      : `GB Scanned: ${comp.yesterdayGB} → ${comp.todayGB} GB (${gbIcon} ${comp.gbChangePercent > 0 ? '+' : ''}${comp.gbChangePercent}%)\n`;

    const querySnippet = comp.originalQuery.substring(0, 80).replace(/\n/g, ' ');

    patternText += `\n**${idx + 1}. ${comp.originalQuery.split(' ')[0] || 'QUERY'} ...**\n`;
    patternText += statusLine;
    patternText += gbLine;
    patternText += `\`${querySnippet}...\`\n`;
  });

  return {
    title: '📈 Top 5 Pattern Changes',
    description: 'Ranked by largest spike/change',
    color: 9442302, // Purple
    fields: [
      {
        name: 'Pattern Analysis',
        value: patternText || 'No pattern changes detected',
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
  let anomalyText = '';

  anomalies.slice(0, 3).forEach((anom, idx) => {
    const icon = Math.abs(anom.changeScore) >= 50 ? '🚨' : '⚠️';
    anomalyText += `${icon} **${anom.status} Significant change detected**\n`;
    anomalyText += `   Score: ${anom.changeScore.toFixed(1)}%\n`;
    if (anom.isNew) {
      anomalyText += `   Status: New pattern (+${anom.todayExecutions} executions)\n`;
    } else {
      anomalyText += `   Queries: ${anom.executionChangePercent > 0 ? '+' : ''}${anom.executionChangePercent}%\n`;
      anomalyText += `   GB: ${anom.gbChangePercent > 0 ? '+' : ''}${anom.gbChangePercent}%\n`;
    }
    anomalyText += '\n';
  });

  return {
    title: '🚨 Anomalies Detected',
    description: 'Patterns with significant changes',
    color: 16711680, // Red
    fields: [
      {
        name: 'Alerts',
        value: anomalyText || 'No anomalies',
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
