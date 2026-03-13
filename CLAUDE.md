# Stickman Pet - 桌面火柴人桌宠

## 简介
透明窗口桌面火柴人桌宠，接入 DeepSeek AI 自我进化，本地规则引擎驱动行为。

## 技术栈
- Electron 33 + HTML5 Canvas
- DeepSeek API（自我进化，非实时决策）
- 纯 JS，无框架依赖
- 程序化骨骼动画系统

## 命令
- `npm start` — 启动应用
- `npm run dev` — 开发模式启动

## 工程结构
```
main.js              主进程：窗口 + 屏幕感知 + 进化定时器 + behaviors IPC
ai-manager.js        AI 核心：工具系统、进化逻辑、记忆管理、去重引擎
preload.js           IPC 桥接（窗口拖拽 + 行为规则加载 + 屏幕感知）
renderer.js          客户端：骨骼动画 + 本地行为规则引擎 + 交互
ai/behaviors.json    行为规则（AI 进化时可自主修改）
ai/rules.md          性格规则（AI 的灵魂）
ai/memory.md         持久化记忆（带去重，30 天压缩）
ai/profile.md        结构化用户画像
ai/evolution-log.md  进化日志
```

## AI 系统架构
- **本地行为引擎**：behaviors.json 规则匹配（应用/标题/时间/空闲/点击）
- **自我进化**：每 20 分钟调用 DeepSeek API，感知用户 + 更新行为规则
- **工具系统**：7 感知工具 + 3 自我修改工具（最多 8 轮调用）
- **记忆管理**：双维度去重（Dice + 词频），退出时压缩 + 画像更新
- **退出保存**：总结当天对话 → 更新 profile.md

## 动画系统
- 程序化关节角度插值，物理系统（重力/弹跳/碰撞）
- 29 个动作、9 种表情、10 种粒子特效
