// ============================================================
// 国际象棋比赛系统 — 工具函数
// ============================================================

/** 从 URL 获取查询参数 */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** 格式化日期 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** 格式化时间 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
}

/** 状态中文映射 */
const STATUS_LABELS = {
  'SETUP':    '🔧 准备中',
  'PAIRING_PUBLISHED': '♟️ 对战中',
  'ROUND_ENDED': '⏸️ 本回合结束',
  'FINISHED': '🏆 比赛结束',
};

/** 结果中文映射 */
const RESULT_LABELS = {
  'PENDING':   '⏳ 等待中',
  'WHITE_WIN': '⚪ 白胜 (1-0)',
  'BLACK_WIN': '⚫ 黑胜 (0-1)',
  'DRAW':      '🤝 平局 (½-½)',
  'BYE':       '🔄 轮空 (+1)',
};

/** 结果简称 */
const RESULT_SHORT = {
  'WHITE_WIN': '1-0',
  'BLACK_WIN': '0-1',
  'DRAW':      '½-½',
  'BYE':       'BYE',
  'PENDING':   '-',
};

/** 生成桌号标签 */
function boardLabel(n) {
  return '第 ' + n + ' 桌';
}

/** 转义 HTML（防 XSS） */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 显示错误消息 */
function showError(elementOrId, message) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (el) {
    el.textContent = '❌ ' + message;
    el.style.display = 'block';
  }
}

/** 隐藏错误消息 */
function hideError(elementOrId) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

/** 切换到指定 Tab */
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const content = document.getElementById('tab-' + tabName);
  const btn = document.getElementById('btn-' + tabName);
  if (content) content.style.display = 'block';
  if (btn) btn.classList.add('active');
}
