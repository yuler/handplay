# HandPlay · 手机摄像头体感小游戏

基于 `@mediapipe/tasks-vision`（HandLandmarker + FaceLandmarker WASM + WebGL2 GPU Delegate）与 **One Euro Filter** 构建的纯手机端前置摄像头体感小游戏合集，画面完全在本地浏览器推理，不上传服务器。

在线体验：**https://handplay.yuler.dev**

## 内置六款游戏

### ✋ 单手隔空玩
1. **闪电结印（Gesture Rush）**
   - 单手持机，另一只手在倒计时结束前比出对应手势（✊ 石头 / ☝️ 一指 / ✌️ 剪刀 / 🖐️ 五指 / 👍 点赞 / 👌 OK）
   - 5 连击进入 **FEVER ×2** 狂热模式，并穿插「手指算数题」
2. **空气弹弓（Air Slingshot）**
   - 食指与拇指隔空捏合（Pinch）拉起底部能量弹弓，实时预览抛物线轨迹，松手弹射打爆漂浮靶标与金星，避开炸弹
3. **一指画符（Finger Rune）**
   - 食指当魔法棒，隔空画出 `—` `|` `○` `∧` `∨` 五种符咒（内置 `$1 Unistroke` + 直线几何识别），闪电连锁秒杀场上所有同符号妖怪

### 😜 完全解放双手（脸部体感）
4. **大嘴吞星（Mouth Munch）**
   - 歪头操控萌宠位置、张大嘴开启漩涡狂吸星星与水果、眨眼发射双眼激光击碎冰块与怪兽、鼓腮开启护盾弹开炸弹
5. **别眨眼 / 憋笑（No Blink / Don't Laugh）**
   - 局内一键切换 **👁️ 别眨眼** 与 **😐 憋笑挑战**，躲避嗡嗡飞虫与冷笑话轰炸，破功瞬间自动抓拍并支持保存「破功照」

### 🙌 桌面支架挑战（双手同屏）
6. **左右手快闪（Dual Hand）**
   - 手机靠在桌上，同时举起左右手比出指定手势组合；热身后开启非对称脑力配对与「左右互换」突发挑战

## 本地开发与部署

```bash
bun install
bun run dev       # 本地预览（手机访问需 HTTPS 或 localhost）
bun run build     # TypeScript 类型检查 + Vite 打包
bun run deploy    # 打包并通过 Wrangler 部署到 handplay.yuler.dev
```
