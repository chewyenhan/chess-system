# ♟️ 学校国际象棋比赛系统

瑞士制自动配对 + 实时积分榜 + 手机看板。为华联中学（初一至高三）设计。

## 架构

- **前端**：纯 HTML/CSS/JS + Pico.css v2 → GitHub Pages
- **后端**：Cloudflare Worker + D1 (SQLite)
- **算法**：瑞士制配对引擎 + 破同分排序（Buchholz / Direct Encounter / Sonneborn-Berger / Progressive）

## 文件结构

```
chess-system/
├── index.html          # 首页（创建比赛 / 已有比赛入口）
├── admin.html          # 管理控制台（导入选手 / 生成配对 / 录入成绩）
├── match.html          # 学生看板（只读对战表 + 积分榜）
├── css/pico.min.css    # Pico.css v2
├── js/
│   ├── api.js          # API 封装
│   └── utils.js        # 工具函数
├── worker.js           # Cloudflare Worker
├── swiss.js            # 瑞士制配对算法
├── tiebreakers.js      # 破同分排序算法
├── schema.sql          # 数据库参考
├── wrangler.json       # Wrangler 部署配置
└── migrations/
    └── 0001_schema.sql # D1 建表迁移
```

## 部署

```bash
# 前端 → GitHub Pages
git push origin main

# Worker → Cloudflare
npx wrangler deploy
```

## API

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/tournaments` | 无 | 创建比赛 |
| GET | `/api/tournaments/:id` | 无 | 比赛信息 |
| GET | `/api/tournaments/:id/standings` | 无 | 积分榜 |
| GET | `/api/tournaments/:id/matches` | 无 | 对局列表 |
| POST | `/api/tournaments/:id/players` | Bearer | 导入选手 |
| POST | `/api/tournaments/:id/pairings` | Bearer | 生成配对 |
| PUT | `/api/tournaments/:id/matches/:mid` | Bearer | 录入结果 |
| PUT | `/api/tournaments/:id/advance` | Bearer | 发布下一轮 |
| DELETE | `/api/tournaments/:id/players/:pid` | Bearer | 移除选手 |

## 许可证

© 2026 华联中学 · Hua Lian High School
