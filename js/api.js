// ============================================================
// 国际象棋比赛系统 — API 封装
// ============================================================

// ⚠️ 部署时改为此 Worker URL
const API_BASE = 'https://chess-system.chewyenhan.workers.dev';

// ── Token 管理（localStorage，持久存储不随标签页关闭丢失） ──
// key: chess_admin_{id}
function getToken(tournamentId) {
  return localStorage.getItem('chess_admin_' + (tournamentId || ''));
}
function setToken(tournamentId, token) {
  localStorage.setItem('chess_admin_' + tournamentId, token);
}
function clearToken(tournamentId) {
  localStorage.removeItem('chess_admin_' + tournamentId);
}

// 保存当前管理的比赛 ID 列表（方便首页查找已有比赛）
function getSavedTournaments() {
  try { return JSON.parse(localStorage.getItem('chess_tournaments') || '[]'); } catch { return []; }
}
function saveTournament(id, name, token) {
  const list = getSavedTournaments().filter(t => t.id !== id);
  list.unshift({ id, name, token });
  localStorage.setItem('chess_tournaments', JSON.stringify(list));
}

// ── fetchWithAuth（管理端点用） ──
async function fetchWithAuth(tournamentId, path, options = {}) {
  const token = getToken(tournamentId);
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearToken(tournamentId);
    throw new Error('管理权限已过期，请重新进入管理页面');
  }
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// ── 公开 API ──

/** 创建新比赛 */
async function createTournament(name, totalRounds = 5, tieBreakers = null) {
  const body = { name, total_rounds: totalRounds };
  if (tieBreakers && tieBreakers.length > 0) {
    body.tie_breakers = JSON.stringify(tieBreakers);
  }
  const res = await fetch(API_BASE + '/api/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '创建失败');
  return data; // { id, admin_token, ... }
}

/** 获取比赛基本信息（公开） */
async function getTournament(id) {
  const res = await fetch(API_BASE + '/api/tournaments/' + id);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '获取失败');
  return data;
}

/** 获取积分榜（公开） */
async function getStandings(tournamentId) {
  const res = await fetch(API_BASE + '/api/tournaments/' + tournamentId + '/standings');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '获取失败');
  return data.standings || [];
}

/** 获取对局列表（公开，可选 ?round=N） */
async function getMatches(tournamentId, round) {
  let url = API_BASE + '/api/tournaments/' + tournamentId + '/matches';
  if (round) url += '?round=' + round;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '获取失败');
  return data.matches || [];
}

// ── 管理 API（需 admin_token） ──

/** 批量导入选手（需要 tournamentId + admin_token） */
async function importPlayers(tournamentId, playerList) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId + '/players', {
    method: 'POST',
    body: JSON.stringify({ players: playerList }),
  });
}

/** 更新比赛设置 */
async function updateTournament(tournamentId, updates) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/** 生成当前轮配对 */
async function generatePairings(tournamentId) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId + '/pairings', {
    method: 'POST',
  });
}

/** 录入比赛结果 */
async function submitResult(tournamentId, matchId, result) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId + '/matches/' + matchId, {
    method: 'PUT',
    body: JSON.stringify({ result }),
  });
}

/** 发布成绩并进入下一轮 */
async function advanceRound(tournamentId) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId + '/advance', {
    method: 'PUT',
  });
}

/** 删除比赛（需 admin_token） */
async function deleteTournament(tournamentId) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId, {
    method: 'DELETE',
  });
}

/** 移除选手（退赛） */
async function removePlayer(tournamentId, playerId) {
  return fetchWithAuth(tournamentId, '/api/tournaments/' + tournamentId + '/players/' + playerId, {
    method: 'DELETE',
  });
}
