// ============================================================
// 破同分排序算法 (Tiebreaker Sorting)
// 纯函数，输入选手 + 历史 → 输出排序后的选手数组
// ============================================================

/**
 * 计算所有活跃选手的完整排名
 * @param {Array} players — 活跃选手 [{id, name, grade}]
 * @param {Array} history — 已完成对局 [{white_player_id, black_player_id, result}]
 * @param {Array} tieBreakers — 破同分规则优先级，如 ['buchholz', 'direct', 'sonneborn']
 * @returns {Array} 排序后的选手列表（含积分和破同分数据）
 */
export function calculateStandings(players, history, tieBreakers) {
  if (!players || players.length === 0) return [];

  // 基础积分
  const scores = calcScores(players, history);

  // 各种破同分指标
  const buchholz = calcBuchholz(players, history, scores);
  const medianBuchholz = calcMedianBuchholz(players, history, scores);
  const direct = calcDirectEncounter(players, history, scores);
  const sonneborn = calcSonneborn(players, history, scores);
  const progressive = calcProgressive(players, history);

  // 构建排名对象
  const standings = players.map(p => ({
    id: p.id,
    name: p.name,
    grade: p.grade || '',
    score: scores[p.id] || 0,
    buchholz: buchholz[p.id] || 0,
    median: medianBuchholz[p.id] || 0,
    direct: direct[p.id]?.score || 0,
    sonneborn: sonneborn[p.id] || 0,
    progressive: progressive[p.id] || 0,
    games_played: countGames(p.id, history),
    white_games: countWhiteGames(p.id, history),
    black_games: countBlackGames(p.id, history),
  }));

  // 按积分 + 破同分规则排序
  standings.sort((a, b) => {
    // 1. 积分高者在前
    if (a.score !== b.score) return b.score - a.score;

    // 2. 按破同分规则依次比较
    for (const rule of tieBreakers) {
      const cmp = compareByRule(a, b, rule);
      if (cmp !== 0) return cmp;
    }

    return 0;
  });

  // 添加排名
  standings.forEach((p, i) => {
    p.rank = i + 1;
  });

  return standings;
}

/** 比较两个积分相同的选手 */
function compareByRule(a, b, rule) {
  switch (rule) {
    case 'buchholz':
      return b.buchholz - a.buchholz;
    case 'median':
      return b.median - a.median;
    case 'direct':
      return b.direct - a.direct;
    case 'sonneborn':
      return b.sonneborn - a.sonneborn;
    case 'progressive':
      return b.progressive - a.progressive;
    default:
      return 0;
  }
}

// ── 基础积分 ──
function calcScores(players, history) {
  const scores = {};
  for (const p of players) scores[p.id] = 0;

  for (const m of history) {
    if (m.result === 'PENDING') continue;
    if (m.result === 'WHITE_WIN') {
      scores[m.white_player_id] = (scores[m.white_player_id] || 0) + 1;
    } else if (m.result === 'BLACK_WIN') {
      scores[m.black_player_id] = (scores[m.black_player_id] || 0) + 1;
    } else if (m.result === 'DRAW') {
      scores[m.white_player_id] = (scores[m.white_player_id] || 0) + 0.5;
      scores[m.black_player_id] = (scores[m.black_player_id] || 0) + 0.5;
    } else if (m.result === 'BYE') {
      scores[m.white_player_id] = (scores[m.white_player_id] || 0) + 1;
    }
  }

  return scores;
}

// ── Buchholz（对手分之和） ──
function calcBuchholz(players, history, scores) {
  const buchholz = {};
  for (const p of players) buchholz[p.id] = 0;

  for (const m of history) {
    if (m.result === 'PENDING') continue;
    const wid = m.white_player_id;
    const bid = m.black_player_id;

    if (wid && bid) {
      buchholz[wid] = (buchholz[wid] || 0) + (scores[bid] || 0);
      buchholz[bid] = (buchholz[bid] || 0) + (scores[wid] || 0);
    }
  }

  return buchholz;
}

// ── Median Buchholz（中间对手分 = 对手分去掉最高和最低分） ──
function calcMedianBuchholz(players, history, scores) {
  const median = {};
  for (const p of players) median[p.id] = 0;

  // 先收集每个选手的所有对手分
  const opponentScores = {};
  for (const p of players) opponentScores[p.id] = [];

  for (const m of history) {
    if (m.result === 'PENDING') continue;
    const wid = m.white_player_id;
    const bid = m.black_player_id;
    if (wid && bid) {
      if (opponentScores[wid]) opponentScores[wid].push(scores[bid] || 0);
      if (opponentScores[bid]) opponentScores[bid].push(scores[wid] || 0);
    }
  }

  // 去掉最高和最低分后求和（如果对手数 ≤ 2 则保留全部）
  for (const p of players) {
    const arr = opponentScores[p.id] || [];
    if (arr.length <= 2) {
      median[p.id] = arr.reduce((a, b) => a + b, 0);
    } else {
      const sorted = [...arr].sort((a, b) => a - b);
      // 去掉最低和最高各1个
      median[p.id] = sorted.slice(1, -1).reduce((a, b) => a + b, 0);
    }
  }

  return median;
}

// ── Direct Encounter（直胜分） ──
function calcDirectEncounter(players, history, scores) {
  const direct = {};
  for (const p of players) direct[p.id] = { score: 0 };

  for (const m of history) {
    if (m.result === 'PENDING') continue;
    const wid = m.white_player_id;
    const bid = m.black_player_id;
    if (!wid || !bid) continue;

    if (m.result === 'WHITE_WIN') {
      direct[wid].score = (direct[wid].score || 0) + 1;
    } else if (m.result === 'BLACK_WIN') {
      direct[bid].score = (direct[bid].score || 0) + 1;
    } else if (m.result === 'DRAW') {
      direct[wid].score = (direct[wid].score || 0) + 0.5;
      direct[bid].score = (direct[bid].score || 0) + 0.5;
    }
  }

  return direct;
}

// ── Sonneborn-Berger ──
function calcSonneborn(players, history, scores) {
  const sb = {};
  for (const p of players) sb[p.id] = 0;

  for (const m of history) {
    if (m.result === 'PENDING') continue;
    const wid = m.white_player_id;
    const bid = m.black_player_id;
    if (!wid || !bid) continue;

    const wScore = scores[wid] || 0;
    const bScore = scores[bid] || 0;

    if (m.result === 'WHITE_WIN') {
      sb[wid] = (sb[wid] || 0) + bScore;
    } else if (m.result === 'BLACK_WIN') {
      sb[bid] = (sb[bid] || 0) + wScore;
    } else if (m.result === 'DRAW') {
      sb[wid] = (sb[wid] || 0) + bScore * 0.5;
      sb[bid] = (sb[bid] || 0) + wScore * 0.5;
    }
  }

  return sb;
}

// ── Progressive Score（渐进分） ──
function calcProgressive(players, history) {
  const prog = {};
  for (const p of players) prog[p.id] = 0;

  // 按轮次分组
  const rounds = {};
  for (const m of history) {
    if (m.result === 'PENDING') continue;
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  const roundScores = {};
  for (const p of players) roundScores[p.id] = 0;

  const roundNums = Object.keys(rounds).sort((a, b) => a - b);
  for (const r of roundNums) {
    for (const m of rounds[r]) {
      if (m.result === 'WHITE_WIN') roundScores[m.white_player_id] += 1;
      else if (m.result === 'BLACK_WIN') roundScores[m.black_player_id] += 1;
      else if (m.result === 'DRAW') {
        roundScores[m.white_player_id] += 0.5;
        roundScores[m.black_player_id] += 0.5;
      } else if (m.result === 'BYE') roundScores[m.white_player_id] += 1;
    }
    for (const p of players) {
      prog[p.id] = (prog[p.id] || 0) + (roundScores[p.id] || 0);
    }
  }

  return prog;
}

// ── 辅助统计 ──
function countGames(playerId, history) {
  return history.filter(m =>
    m.result !== 'PENDING' &&
    (m.white_player_id === playerId || m.black_player_id === playerId)
  ).length;
}

function countWhiteGames(playerId, history) {
  return history.filter(m =>
    m.result !== 'PENDING' && m.white_player_id === playerId
  ).length;
}

function countBlackGames(playerId, history) {
  return history.filter(m =>
    m.result !== 'PENDING' && m.black_player_id === playerId
  ).length;
}
