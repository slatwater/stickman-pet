# Stickman Pet - 桌面火柴人桌宠

## 简介
透明窗口桌面火柴人桌宠，接入 DeepSeek AI 自主决策行为，支持鼠标互动。

## 技术栈
- Electron 33 + HTML5 Canvas
- DeepSeek API（AI 行为决策）
- 纯 JS，无框架依赖
- 程序化骨骼动画系统

## 命令
- `npm start` — 启动应用
- `npm run dev` — 开发模式启动

## 工程结构
```
main.js              Electron 主进程，窗口创建 + osascript 屏幕感知 + AI IPC
ai-manager.js        AI 逻辑封装：规则/记忆读写、批量决策、observation 合并
preload.js           IPC 桥接（窗口拖拽 + AI 决策 + 屏幕感知）
config.json          API Key 配置（gitignore，从 config.example.json 复制）
config.example.json  配置模板
ai/rules.md         火柴人性格规则（替代硬编码 prompt）
ai/memory.md        持久化记忆（按日写入，30 天截取）
index.html           HTML 入口
renderer.js          全部客户端逻辑：骨骼系统、动画、物理、渲染、交互
```

## 交互方式
- 鼠标靠近：火柴人紧张躲避
- 左键点击：火柴人惊吓反应 + 星星特效
- 左键拖拽：抓起火柴人，松手投掷（有物理弹跳）
- 右键拖拽：移动窗口位置

## AI 决策系统
- 屏幕感知：osascript 30 秒采集前台应用 + 窗口标题
- 批量决策：AI 返回动作队列 `actions[]`，带独立 duration
- observation 累积 3 条后触发合并，memorySummary 写入 memory.md
- 退出时 API 总结当天对话，追加到 memory.md
- 无 API Key 时回退本地随机选择

## 动画系统
- 程序化关节角度插值（非关键帧序列）
- 物理系统：重力、弹跳、墙壁碰撞
- 29 个动作：idle、lookAround、walk、dance、crazyDance、jump、wave、kick、spin、backflip、sitDown、flex、pushUp、headstand、yawn、sneak、bow、run、sleep、stumble、celebrate、cry、meditate、rage、guitar、peek、slip、swordFight、float
- 9 种表情：normal、surprised、dizzy、nervous、sleepy、happy、sad、peaceful、angry
- 粒子特效：星星、Zzz、彩色纸屑、灰尘、泪滴、光圈、火焰、音符、问号、剑光
- 颜色配置：`STICKMAN_COLOR` 常量控制全身颜色
