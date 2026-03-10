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
main.js              Electron 主进程，窗口创建 + DeepSeek API 调用
preload.js           IPC 桥接（窗口拖拽 + AI 决策）
config.json          API Key 配置（gitignore，从 config.example.json 复制）
config.example.json  配置模板
index.html     HTML 入口
renderer.js    全部客户端逻辑：骨骼系统、动画、物理、渲染、交互
```

## 交互方式
- 鼠标靠近：火柴人紧张躲避
- 左键点击：火柴人惊吓反应 + 星星特效
- 左键拖拽：抓起火柴人，松手投掷（有物理弹跳）
- 右键拖拽：移动窗口位置

## 动画系统
- 程序化关节角度插值（非关键帧序列）
- AI 驱动行为决策（DeepSeek API），无 Key 时回退随机选择
- 思考气泡：显示 AI 的内心独白
- 物理系统：重力、弹跳、墙壁碰撞
- 动作列表：idle、lookAround、walk、dance、crazyDance、jump、wave、kick、spin、backflip、sitDown、flex、pushUp、headstand、yawn、sneak、bow、run、sleep、stumble、celebrate
- 表情系统：normal、surprised、dizzy、nervous、sleepy、happy
- 粒子特效：星星（惊吓）、Zzz（睡眠）、彩色纸屑（庆祝）、灰尘（跑步）
- 颜色配置：`STICKMAN_COLOR` 常量控制全身颜色
