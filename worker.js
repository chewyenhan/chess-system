// ============================================================
// 学校国际象棋比赛系统 — Cloudflare Worker
// chess-system
// ============================================================

import { generatePairings } from './swiss.js';
import { calculateStandings } from './tiebreakers.js';

// ── CORS ──
const ALLOWED_ORIGINS = [
  'https://chewyenhan.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
];

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && (origin === o || origin.startsWith(o)));
  const ao = allowed && origin ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ao,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// ── 限流 ──
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 30, windowSec = 60) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + windowSec * 1000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ── JSON 响应辅助 ──
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

// ── 认证中间件（校验 admin_token 归属于哪个比赛） ──
async function authAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const tournament = await env.DB.prepare(
    'SELECT id, name, total_rounds, current_round, status, tie_breakers FROM tournaments WHERE admin_token = ?'
  ).bind(token).first();

  return tournament || null;  // 返回比赛对象或 null
}

// ── 路径参数提取 ──
// 从 /api/tournaments/:id/... 中提取 tournament id 和剩余路径
function extractParams(pathname, pattern) {
  const parts = pathname.split('/').filter(Boolean);
  // pattern 如: ['api', 'tournaments', ':id']
  const patternParts = pattern.split('/').filter(Boolean);
  if (parts.length < patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = parts[i];
    } else if (parts[i] !== patternParts[i]) {
      return null;
    }
  }
  // 返回剩余部分（无剩余时为空字符串）
  const rest = parts.slice(patternParts.length).join('/');
  params._rest = rest ? '/' + rest : '';
  return params;
}

// ═══════════════════════════════════════════
//  主入口
// ═══════════════════════════════════════════
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = getCorsHeaders(origin);

    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // 限流（公开端点宽松，管理端点由具体 handler 内再次检查）
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    if (!checkRateLimit(ip)) {
      return json({ error: '请求过于频繁，请稍后再试' }, 429, cors);
    }

    try {
      const path = url.pathname;
      const method = request.method;

      // === 公开端点 ===

      // POST /api/tournaments — 创建比赛
      if (method === 'POST' && path === '/api/tournaments') {
        return handleCreateTournament(request, env, cors);
      }

      // GET /api/tournaments — 比赛列表（支持搜索和筛选）
      if (method === 'GET' && path === '/api/tournaments') {
        return handleGetTournaments(request, env, cors);
      }

      // GET /api/tournaments/:id — 比赛基本信息
      if (method === 'GET' && path.startsWith('/api/tournaments/')) {
        const params = extractParams(path, 'api/tournaments/:id');
        if (params && !params._rest) {
          return handleGetTournament(request, env, params, cors);
        }
      }

      // GET /api/tournaments/:id/standings — 积分榜
      if (method === 'GET' && path.endsWith('/standings')) {
        const params = extractParams(path, 'api/tournaments/:id/standings');
        if (params) {
          return handleGetStandings(request, env, params, cors);
        }
      }

      // GET /api/tournaments/:id/matches — 对局列表（可选 ?round=N）
      if (method === 'GET' && path.endsWith('/matches')) {
        const params = extractParams(path, 'api/tournaments/:id/matches');
        if (params) {
          return handleGetMatches(request, env, params, url, cors);
        }
      }

      // === 管理端点（需 Bearer Token） ===

      const tournament = await authAdmin(request, env);

      // PUT /api/tournaments/:id — 更新比赛设置
      if (method === 'PUT' && path.startsWith('/api/tournaments/')) {
        const params = extractParams(path, 'api/tournaments/:id');
        if (params && !params._rest) {
          return handleUpdateTournament(request, env, params, tournament, cors);
        }
      }

      // POST /api/tournaments/:id/players — 批量导入选手
      if (method === 'POST' && path.endsWith('/players')) {
        const params = extractParams(path, 'api/tournaments/:id/players');
        if (params) {
          return handleImportPlayers(request, env, params, tournament, cors);
        }
      }

      // === 管理端点（继续）===

      // DELETE /api/tournaments/:id/matches/:mid — 撤销成绩
      if (method === 'DELETE' && path.includes('/matches/')) {
        const params = extractParams(path, 'api/tournaments/:id/matches/:mid');
        if (params && !params._rest) {
          return handleUndoResult(request, env, params, tournament, cors);
        }
      }

      // DELETE /api/tournaments/:id/players/:pid — 移除选手
      if (method === 'DELETE' && path.includes('/players/')) {
        const params = extractParams(path, 'api/tournaments/:id/players/:pid');
        if (params) {
          return handleRemovePlayer(request, env, params, tournament, cors);
        }
      }

      // PUT /api/tournaments/:id/matches/:mid — 录入结果
      if (method === 'PUT' && path.includes('/matches/')) {
        const params = extractParams(path, 'api/tournaments/:id/matches/:mid');
        if (params) {
          return handleSubmitResult(request, env, params, tournament, cors);
        }
      }

      // POST /api/tournaments/:id/pairings — 生成配对
      if (method === 'POST' && path.endsWith('/pairings')) {
        const params = extractParams(path, 'api/tournaments/:id/pairings');
        if (params) {
          return handleGeneratePairings(request, env, params, tournament, cors);
        }
      }

      // DELETE /api/tournaments/:id — 删除比赛（软删除）
      if (method === 'DELETE' && path.startsWith('/api/tournaments/')) {
        const params = extractParams(path, 'api/tournaments/:id');
        if (params && !params._rest) {
          return handleDeleteTournament(request, env, params, tournament, cors);
        }
      }

      // POST /api/tournaments/:id/restore — 恢复比赛
      if (method === 'POST' && path.endsWith('/restore')) {
        const params = extractParams(path, 'api/tournaments/:id/restore');
        if (params) {
          return handleRestoreTournament(request, env, params, tournament, cors);
        }
      }

      // POST /api/tournaments/:id/export — 导出比赛数据
      if (method === 'POST' && path.endsWith('/export')) {
        const params = extractParams(path, 'api/tournaments/:id/export');
        if (params) {
          return handleExportTournament(request, env, params, tournament, cors);
        }
      }

      // POST /api/tournaments/:id/import — 导入比赛数据
      if (method === 'POST' && path.endsWith('/import')) {
        const params = extractParams(path, 'api/tournaments/:id/import');
        if (params) {
          return handleImportTournament(request, env, params, tournament, cors);
        }
      }

      // PUT /api/tournaments/:id/advance — 进入下一轮
      if (method === 'PUT' && path.endsWith('/advance')) {
        const params = extractParams(path, 'api/tournaments/:id/advance');
        if (params) {
          return handleAdvanceRound(request, env, params, tournament, cors);
        }
      }

      // 未匹配路由
      return json({ error: 'Not Found' }, 404, cors);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: '服务器内部错误: ' + err.message }, 500, cors);
    }
  }
};

// ═══════════════════════════════════════════
//  公开端点处理函数
// ═══════════════════════════════════════════

// POST /api/tournaments — 创建比赛
async function handleCreateTournament(request, env, cors) {
  try {
    const body = await request.json();
    const { name, total_rounds = 5, tie_breakers = '["buchholz","median","direct","sonneborn","progressive"]' } = body;

    if (!name || !name.trim()) {
      return json({ error: '请输入比赛名称' }, 400, cors);
    }

    const id = crypto.randomUUID();
    const adminToken = crypto.randomUUID();

    await env.DB.prepare(
      'INSERT INTO tournaments (id, name, total_rounds, tie_breakers, admin_token) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, name.trim(), total_rounds, tie_breakers, adminToken).run();

    return json({
      id,
      name: name.trim(),
      total_rounds,
      tie_breakers,
      admin_token: adminToken,
      current_round: 0,
      status: 'SETUP'
    }, 201, cors);

  } catch (err) {
    console.error('Create tournament error:', err);
    return json({ error: '创建比赛失败: ' + err.message }, 500, cors);
  }
}

// GET /api/tournaments — 比赛列表（支持搜索和筛选）
async function handleGetTournaments(request, env, cors) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';

    let query = 'SELECT id, name, total_rounds, tie_breakers, current_round, status, created_at, admin_token, deleted_at FROM tournaments';
    let conditions = [];
    let bindings = [];

    // 搜索条件（模糊匹配名称）
    if (search) {
      conditions.push('name LIKE ?');
      bindings.push('%' + search + '%');
    }

    // 状态条件
    if (status) {
      conditions.push('status = ?');
      bindings.push(status);
    }

    // 排除已删除比赛
    conditions.push('deleted_at IS NULL');

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const tournaments = await env.DB.prepare(query).bind(...bindings).all();
    return json({ tournaments: tournaments.results }, 200, cors);

  } catch (err) {
    console.error('Get tournaments error:', err);
    return json({ error: '获取比赛列表失败: ' + err.message }, 500, cors);
  }
}

// GET /api/tournaments/:id — 比赛基本信息
async function handleGetTournament(request, env, params, cors) {
  try {
    const tournament = await env.DB.prepare(
      'SELECT id, name, total_rounds, tie_breakers, current_round, status, deleted_at FROM tournaments WHERE id = ?'
    ).bind(params.id).first();

    if (!tournament) {
      return json({ error: '比赛不存在' }, 404, cors);
    }

    // 获取选手数量
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM players WHERE tournament_id = ? AND is_active = 1'
    ).bind(params.id).first();

    tournament.player_count = countResult.count;

    return json(tournament, 200, cors);

  } catch (err) {
    console.error('Get tournament error:', err);
    return json({ error: '获取比赛信息失败' }, 500, cors);
  }
}

// GET /api/tournaments/:id/standings — 积分榜（含破同分排序）
async function handleGetStandings(request, env, params, cors) {
  try {
    // 验证比赛存在并获取破同分配置
    const tournament = await env.DB.prepare(
      'SELECT id, tie_breakers FROM tournaments WHERE id = ?'
    ).bind(params.id).first();

    if (!tournament) {
      return json({ error: '比赛不存在' }, 404, cors);
    }

    // 获取活跃选手
    const playersResult = await env.DB.prepare(
      'SELECT id, name, grade FROM players WHERE tournament_id = ? AND is_active = 1'
    ).bind(params.id).all();
    const players = playersResult.results;

    // 获取所有已完成对局
    const historyResult = await env.DB.prepare(
      'SELECT white_player_id, black_player_id, result, round FROM matches WHERE tournament_id = ? AND result != ?'
    ).bind(params.id, 'PENDING').all();

    // 解析破同分规则
    let tieBreakers;
    try {
      tieBreakers = JSON.parse(tournament.tie_breakers || '["buchholz","direct","sonneborn"]');
    } catch {
      tieBreakers = ['buchholz', 'direct', 'sonneborn'];
    }

    // 使用破同分引擎计算完整排名
    const standings = calculateStandings(players, historyResult.results, tieBreakers);

    return json({ standings }, 200, cors);

  } catch (err) {
    console.error('Get standings error:', err);
    return json({ error: '获取积分榜失败: ' + err.message }, 500, cors);
  }
}

// GET /api/tournaments/:id/matches — 对局列表
async function handleGetMatches(request, env, params, url, cors) {
  try {
    const tournament = await env.DB.prepare(
      'SELECT id FROM tournaments WHERE id = ?'
    ).bind(params.id).first();

    if (!tournament) {
      return json({ error: '比赛不存在' }, 404, cors);
    }

    const round = url.searchParams.get('round');
    let query = `
      SELECT m.*,
        wp.name as white_name, wp.grade as white_grade,
        bp.name as black_name, bp.grade as black_grade
      FROM matches m
      LEFT JOIN players wp ON m.white_player_id = wp.id
      LEFT JOIN players bp ON m.black_player_id = bp.id
      WHERE m.tournament_id = ?
    `;
    const bindings = [params.id];

    if (round) {
      query += ' AND m.round = ?';
      bindings.push(parseInt(round));
    }

    query += ' ORDER BY m.round, m.board_number';

    const matches = await env.DB.prepare(query).bind(...bindings).all();

    return json({ matches: matches.results }, 200, cors);

  } catch (err) {
    console.error('Get matches error:', err);
    return json({ error: '获取对局失败' }, 500, cors);
  }
}

// ═══════════════════════════════════════════
//  管理端点处理函数
// ═══════════════════════════════════════════

/** PUT /api/tournaments/:id — 更新比赛设置 */
async function handleUpdateTournament(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    const body = await request.json();
    const updates = [];
    const bindings = [];

    if (body.name) { updates.push('name = ?'); bindings.push(body.name.trim()); }
    if (body.total_rounds) { updates.push('total_rounds = ?'); bindings.push(body.total_rounds); }
    if (body.tie_breakers) { updates.push('tie_breakers = ?'); bindings.push(body.tie_breakers); }

    if (updates.length === 0) {
      return json({ error: '没有可更新的字段' }, 400, cors);
    }

    bindings.push(params.id);
    await env.DB.prepare(
      'UPDATE tournaments SET ' + updates.join(', ') + ' WHERE id = ?'
    ).bind(...bindings).run();

    const updated = await env.DB.prepare(
      'SELECT id, name, total_rounds, tie_breakers, current_round, status, created_at FROM tournaments WHERE id = ?'
    ).bind(params.id).first();
    return json(updated, 200, cors);
  } catch (err) {
    return json({ error: '更新比赛失败: ' + err.message }, 500, cors);
  }
}

/** POST /api/tournaments/:id/players — 批量导入选手 */
async function handleImportPlayers(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  if (tournament.status !== 'SETUP') {
    return json({ error: '只能在准备阶段导入选手' }, 400, cors);
  }
  try {
    const body = await request.json();
    const { players } = body;

    if (!players || !Array.isArray(players) || players.length === 0) {
      return json({ error: '请提供有效的选手列表' }, 400, cors);
    }

    // 先清空原有选手再重新导入
    await env.DB.prepare(
      'DELETE FROM players WHERE tournament_id = ?'
    ).bind(params.id).run();

    const stmt = env.DB.prepare(
      'INSERT INTO players (id, tournament_id, name, grade) VALUES (?, ?, ?, ?)'
    );

    const batch = [];
    for (const p of players) {
      if (!p.name || !p.name.trim()) continue;
      batch.push(stmt.bind(crypto.randomUUID(), params.id, p.name.trim(), (p.grade || '').trim()));
    }

    await env.DB.batch(batch);

    const count = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM players WHERE tournament_id = ? AND is_active = 1'
    ).bind(params.id).first();

    return json({
      success: true,
      imported: batch.length,
      total_players: count.count,
    }, 200, cors);
  } catch (err) {
    return json({ error: '导入选手失败: ' + err.message }, 500, cors);
  }
}

/** DELETE /api/tournaments/:id/players/:pid — 移除选手（软删除：退赛） */
async function handleRemovePlayer(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    await env.DB.prepare(
      'UPDATE players SET is_active = 0 WHERE id = ? AND tournament_id = ?'
    ).bind(params.pid, params.id).run();
    return json({ success: true }, 200, cors);
  } catch (err) {
    return json({ error: '移除选手失败: ' + err.message }, 500, cors);
  }
}

/** POST /api/tournaments/:id/pairings — 生成当前轮配对 */
async function handleGeneratePairings(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  if (tournament.current_round >= tournament.total_rounds) {
    return json({ error: '已达到设定的总轮次数' }, 400, cors);
  }
  if (tournament.status === 'PAIRING_PUBLISHED') {
    return json({ error: '当前轮配对已生成，请先录入成绩并发布' }, 400, cors);
  }
  if (tournament.status === 'FINISHED') {
    return json({ error: '比赛已结束' }, 400, cors);
  }
  try {
    // 获取活跃选手
    const playersResult = await env.DB.prepare(
      'SELECT id, name, grade FROM players WHERE tournament_id = ? AND is_active = 1'
    ).bind(params.id).all();

    const players = playersResult.results;
    if (players.length < 2) {
      return json({ error: '需要至少2名活跃选手才能生成配对' }, 400, cors);
    }

    // 获取历史对局
    const historyResult = await env.DB.prepare(
      'SELECT white_player_id, black_player_id, result, round FROM matches WHERE tournament_id = ? AND result != ?'
    ).bind(params.id, 'PENDING').all();

    // 使用瑞士制引擎生成配对
    const nextRound = tournament.current_round + 1;
    const pairings = generatePairings(players, historyResult.results, nextRound);

    // 写入数据库
    const stmt = env.DB.prepare(
      'INSERT INTO matches (id, tournament_id, round, board_number, white_player_id, black_player_id, result) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const batch = [];
    for (const p of pairings) {
      batch.push(stmt.bind(
        crypto.randomUUID(),
        params.id,
        nextRound,
        p.board_number,
        p.white_player_id,
        p.black_player_id,
        p.result  // 'PENDING' or 'BYE'
      ));
    }

    await env.DB.batch(batch);

    // 更新比赛状态和轮次
    await env.DB.prepare(
      'UPDATE tournaments SET current_round = ?, status = ? WHERE id = ?'
    ).bind(nextRound, 'PAIRING_PUBLISHED', params.id).run();

    return json({
      success: true,
      round: nextRound,
      pairings_count: pairings.length,
      pairings,
    }, 200, cors);

  } catch (err) {
    console.error('Generate pairings error:', err);
    return json({ error: '生成配对失败: ' + err.message }, 500, cors);
  }
}

/** PUT /api/tournaments/:id/matches/:mid — 录入比赛结果 */
async function handleSubmitResult(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    const body = await request.json();
    const { result } = body;

    const validResults = ['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'PENDING'];
    if (!result || !validResults.includes(result)) {
      return json({ error: '无效的结果值。可选：WHITE_WIN, BLACK_WIN, DRAW, PENDING' }, 400, cors);
    }

    // 验证 match 属于此比赛
    const match = await env.DB.prepare(
      'SELECT id FROM matches WHERE id = ? AND tournament_id = ?'
    ).bind(params.mid, params.id).first();

    if (!match) {
      return json({ error: '对局不存在' }, 404, cors);
    }

    await env.DB.prepare(
      'UPDATE matches SET result = ? WHERE id = ?'
    ).bind(result, params.mid).run();

    return json({ success: true, match_id: params.mid, result }, 200, cors);

  } catch (err) {
    console.error('Submit result error:', err);
    return json({ error: '录入结果失败: ' + err.message }, 500, cors);
  }
}

/** DELETE /api/tournaments/:id — 删除比赛（软删除） */
async function handleDeleteTournament(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    // 软删除：设置 deleted_at，数据仍保留在数据库
    await env.DB.prepare(
      'UPDATE tournaments SET deleted_at = ? WHERE id = ?'
    ).bind(datetime('now'), params.id).run();
    return json({ success: true }, 200, cors);
  } catch (err) {
    return json({ error: '删除比赛失败: ' + err.message }, 500, cors);
  }
}

/** POST /api/tournaments/:id/restore — 恢复比赛 */
async function handleRestoreTournament(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    // 恢复比赛：设置 deleted_at 为 NULL
    await env.DB.prepare(
      'UPDATE tournaments SET deleted_at = ? WHERE id = ?'
    ).bind(NULL, params.id).run();
    return json({ success: true }, 200, cors);
  } catch (err) {
    return json({ error: '恢复比赛失败: ' + err.message }, 500, cors);
  }
}

/** POST /api/tournaments/:id/export — 导出比赛数据（需 admin_token） */
async function handleExportTournament(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    // 获取所有数据
    const tournamentData = await env.DB.prepare(
      'SELECT id, name, total_rounds, tie_breakers, current_round, status, admin_token, created_at FROM tournaments WHERE id = ?'
    ).bind(params.id).first();

    if (!tournamentData) {
      return json({ error: '比赛不存在' }, 404, cors);
    }

    const players = await env.DB.prepare(
      'SELECT id, name, grade, is_active FROM players WHERE tournament_id = ?'
    ).bind(params.id).all();

    const matches = await env.DB.prepare(
      'SELECT id, white_player_id, black_player_id, round, board_number, result FROM matches WHERE tournament_id = ? ORDER BY round, board_number'
    ).bind(params.id).all();

    // 构建导出对象
    const exportData = {
      tournament: tournamentData,
      players: players.results.map(p => ({
        id: p.id,
        name: p.name,
        grade: p.grade,
        is_active: p.is_active === 1
      })),
      matches: matches.results
    };

    // 转换为 JSON 字符串
    const jsonStr = JSON.stringify(exportData, null, 2);

    // 返回 JSON 文件
    return new Response(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tournament_${params.id}.json"`,
      },
    });

  } catch (err) {
    console.error('Export tournament error:', err);
    return json({ error: '导出失败: ' + err.message }, 500, cors);
  }
}

/** POST /api/tournaments/:id/import — 导入比赛数据（需 admin_token，覆盖所有数据） */
async function handleImportTournament(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    const body = await request.json();
    const { players, matches } = body;

    if (!players || !Array.isArray(players)) {
      return json({ error: '缺少 players 数组' }, 400, cors);
    }

    if (!matches || !Array.isArray(matches)) {
      return json({ error: '缺少 matches 数组' }, 400, cors);
    }

    // 开始事务
    const tx = env.DB.prepare('BEGIN TRANSACTION');

    // 清空现有选手
    await env.DB.prepare(
      'DELETE FROM players WHERE tournament_id = ?'
    ).bind(params.id).run();

    // 清空现有对局
    await env.DB.prepare(
      'DELETE FROM matches WHERE tournament_id = ?'
    ).bind(params.id).run();

    // 批量插入选手
    const playerStmt = env.DB.prepare(
      'INSERT INTO players (id, tournament_id, name, grade, is_active) VALUES (?, ?, ?, ?, ?)'
    );
    const playerBatch = [];
    for (const p of players) {
      if (!p.name) continue;
      playerBatch.push(playerStmt.bind(
        crypto.randomUUID(),
        params.id,
        p.name.trim(),
        (p.grade || '').trim(),
        p.is_active ? 1 : 0
      ));
    }
    await env.DB.batch(playerBatch);

    // 批量插入对局
    const matchStmt = env.DB.prepare(
      'INSERT INTO matches (id, tournament_id, white_player_id, black_player_id, round, board_number, result) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const matchBatch = [];
    for (const m of matches) {
      matchBatch.push(matchStmt.bind(
        crypto.randomUUID(),
        params.id,
        m.white_player_id,
        m.black_player_id,
        m.round,
        m.board_number,
        m.result || 'PENDING'
      ));
    }
    await env.DB.batch(matchBatch);

    // 提交事务
    await tx.run();

    return json({
      success: true,
      imported_players: playerBatch.length,
      imported_matches: matchBatch.length,
    }, 200, cors);

  } catch (err) {
    console.error('Import tournament error:', err);
    return json({ error: '导入失败: ' + err.message }, 500, cors);
  }
}

/** DELETE /api/tournaments/:id/matches/:mid — 撤销成绩 */
async function handleUndoResult(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  try {
    // 验证 match 属于此比赛
    const match = await env.DB.prepare(
      'SELECT id, result FROM matches WHERE id = ? AND tournament_id = ?'
    ).bind(params.mid, params.id).first();

    if (!match) {
      return json({ error: '对局不存在' }, 404, cors);
    }

    // 验证是否在30分钟内
    const matchData = await env.DB.prepare(
      'SELECT updated_at FROM matches WHERE id = ?'
    ).bind(params.mid).first();

    if (!matchData) {
      return json({ error: '无法获取对局信息' }, 500, cors);
    }

    const updatedAt = new Date(matchData.updated_at);
    const now = new Date();
    const diffMs = now - updatedAt;
    const diffMins = diffMs / (1000 * 60);

    if (diffMins > 30) {
      return json({ error: '只能撤销30分钟内的成绩' }, 400, cors);
    }

    // 恢复为 PENDING
    await env.DB.prepare(
      'UPDATE matches SET result = ?, updated_at = ? WHERE id = ?'
    ).bind('PENDING', datetime('now'), params.mid).run();

    return json({ success: true }, 200, cors);
  } catch (err) {
    return json({ error: '撤销成绩失败: ' + err.message }, 500, cors);
  }
}

/** PUT /api/tournaments/:id/advance — 发布成绩进入下一轮 */
async function handleAdvanceRound(request, env, params, tournament, cors) {
  if (!tournament || tournament.id !== params.id) {
    return json({ error: '无权限操作此比赛' }, 401, cors);
  }
  if (tournament.status !== 'PAIRING_PUBLISHED') {
    return json({ error: '当前状态不可发布' }, 400, cors);
  }
  try {
    const cr = tournament.current_round;
    const tr = tournament.total_rounds;

    // 检查当前轮所有对局是否已录入
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM matches WHERE tournament_id = ? AND round = ? AND result = ?'
    ).bind(params.id, cr, 'PENDING').first();

    if (pendingCount && pendingCount.count > 0) {
      return json({ error: '还有 ' + pendingCount.count + ' 局比赛未录入结果' }, 400, cors);
    }

    // 判断是否最后一轮
    if (cr >= tr) {
      await env.DB.prepare(
        'UPDATE tournaments SET status = ? WHERE id = ?'
      ).bind('FINISHED', params.id).run();
      return json({ success: true, finished: true, message: '比赛已全部结束！' }, 200, cors);
    }

    // 进入下一轮（状态回到 READY，等待管理员再次生成配对）
    await env.DB.prepare(
      'UPDATE tournaments SET status = ? WHERE id = ?'
    ).bind('ROUND_ENDED', params.id).run();

    return json({ success: true, next_round: cr + 1, total_rounds: tr }, 200, cors);

  } catch (err) {
    console.error('Advance round error:', err);
    return json({ error: '发布失败: ' + err.message }, 500, cors);
  }
}
