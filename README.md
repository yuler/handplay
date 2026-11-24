# HandPlay · 手机摄像头体感小游戏

基于 `@mediapipe/tasks-vision`（WASM + WebGL2 GPU Delegate）与 **One Euro Filter** 构建的纯手机端前置摄像头体感小游戏，画面完全在本地浏览器推理，不上传服务器。

在线体验：**https://handplay.yuler.dev**

## 内置两款游戏

1. **闪电结印（Gesture Rush）**
   - 单手持机，另一只手在倒计时结束前比出对应手势（✊ 石头 / ☝️ 一指 / ✌️ 剪刀 / 🖐️ 五指 / 👍 点赞 / 👌 OK）
   - 5 连击进入 **FEVER ×2** 狂热模式，并穿插「手指算数题」
2. **空气弹弓（Air Slingshot）**
   - 食指与拇指隔空捏合（Pinch）拉起底部能量弹弓，实时预览抛物线轨迹，松手弹射打爆漂浮靶标与金星，避开炸弹

## 本地开发与部署

```bash
bun install
bun run dev       # 本地预览（手机访问需 HTTPS 或 localhost）
bun run build     # TypeScript 类型检查 + Vite 打包
bun run deploy    # 打包并通过 Wrangler 部署到 handplay.yuler.dev
```
