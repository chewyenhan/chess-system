// ============================================================
// 瑞士制配对算法 (Swiss System Pairing)
// 纯函数，输入选手 + 历史 → 输出当前轮对阵表
// ============================================================

/**
 * 生成当前轮的配对
 * @param {Array} players — 活跃选手 [{id, name, grade}]
 * @param {Array} history — 已完成对局 [{white_player_id, black_player_id, result}]
 * @param {number} round — 当前轮次 (1-based)
 * @returns {Array} 配对结果 [{board_number, white_player_id, black_player_id, result}]
 *   result = 'PENDING' 正常 / 'BYE' 轮空
 */
export function generatePairings(players, history, round) {
  if (players.length === 0) return [];

  // 1. 计算每位选手的当前积分
  const scores = calculateScores(players, history);

  // 2. 统计每位选手的执白次数
  const whiteCount = countWhiteGames(players, history);

  // 3. 按积分分组
  const groups = groupByScore(players, scores);

  // 4. 在每个积分组内配对
  const pairings = [];
  const paired = new Set();
  let boardNumber = 1;

  // 收集所有未被配对的选手（按积分从高到低）
  const allPlayers = [];
  for (const group of groups) {
    // 组内随机打乱
    shuffle(group);
    allPlayers.push(...group);
  }

  // 创建"已相遇"映射
  const metBefore = buildMetMap(history);

  // 从高到低依次配对
  const unpaired = [];
  for (const player of allPlayers) {
    if (paired.has(player.id)) continue;

    // 寻找同组（或接近分数）的对手
    const opponent = findOpponent(player, allPlayers, paired, metBefore, whiteCount, scores);

    if (opponent) {
      paired.add(player.id);
      paired.add(opponent.id);

      // 决定颜色：优先让执白少的执白，均等则随机
      const [white, black] = assignColors(player, opponent, whiteCount);

      pairings.push({
        board_number: boardNumber++,
        white_player_id: white.id,
        black_player_id: black.id,
        result: 'PENDING',
      });
    } else {
      unpaired.push(player);
      paired.add(player.id);
    }
  }

  // 5. 处理轮空：只有1人未配对时给 BYE（得1分）
  // 如果 unpaired > 1，说明有配对冲突，强制配对（不重复检查）
  while (unpaired.length >= 2) {
    const p1 = unpaired.shift();
    const p2 = unpaired.shift();
    paired.add(p1.id);
    paired.add(p2.id);

    const [white, black] = assignColors(p1, p2, whiteCount);
    pairings.push({
      board_number: boardNumber++,
      white_player_id: white.id,
      black_player_id: black.id,
      result: 'PENDING',
    });
  }

  // 剩1人轮空
  if (unpaired.length === 1) {
    pairings.push({
      board_number: boardNumber++,
      white_player_id: unpaired[0].id,
      black_player_id: null,
      result: 'BYE',  // 直接计为轮空得1分
    });
  }

  return pairings;
}

/**
 * 计算每位选手的当前积分
 */
function calculateScores(players, history) {
  const scores = {};
  for (const p of players) {
    scores[p.id] = 0;
  }

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

/**
 * 统计执白次数
 */
function countWhiteGames(players, history) {
  const count = {};
  for (const p of players) {
    count[p.id] = 0;
  }
  for (const m of history) {
    if (m.white_player_id && m.result !== 'PENDING' && m.result !== 'BYE') {
      count[m.white_player_id] = (count[m.white_player_id] || 0) + 1;
    }
  }
  return count;
}

/**
 * 按积分分组（返回从高到低的组）
 */
function groupByScore(players, scores) {
  const map = {};
  for (const p of players) {
    const s = scores[p.id] || 0;
    if (!map[s]) map[s] = [];
    map[s].push(p);
  }

  const groups = Object.keys(map)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .map(k => map[k]);

  return groups;
}

/**
 * 创建"已相遇"映射
 */
function buildMetMap(history) {
  const map = {};
  const addEdge = (a, b) => {
    if (!a || !b) return;
    if (!map[a]) map[a] = new Set();
    if (!map[b]) map[b] = new Set();
    map[a].add(b);
    map[b].add(a);
  };

  for (const m of history) {
    addEdge(m.white_player_id, m.black_player_id);
  }

  return map;
}

/**
 * 在未配对选手中寻找最佳对手
 */
function findOpponent(player, allPlayers, paired, metBefore, whiteCount, scores) {
  const playerScore = scores[player.id] || 0;
  let bestOpponent = null;
  let bestScoreDiff = Infinity;

  for (const candidate of allPlayers) {
    if (candidate.id === player.id) continue;
    if (paired.has(candidate.id)) continue;

    // 检查是否已相遇
    const met = metBefore[player.id] && metBefore[player.id].has(candidate.id);
    if (met) continue;

    const candidateScore = scores[candidate.id] || 0;
    const diff = Math.abs(playerScore - candidateScore);

    // 优先选积分最接近的
    if (diff < bestScoreDiff) {
      bestScoreDiff = diff;
      bestOpponent = candidate;
    }
  }

  return bestOpponent;
}

/**
 * 分配白方/黑方（优先让执白少的执白）
 */
function assignColors(p1, p2, whiteCount) {
  const w1 = whiteCount[p1.id] || 0;
  const w2 = whiteCount[p2.id] || 0;

  if (w1 < w2) return [p1, p2];
  if (w2 < w1) return [p2, p1];
  // 均等则随机
  return Math.random() < 0.5 ? [p1, p2] : [p2, p1];
}

/**
 * Fisher-Yates 洗牌
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
