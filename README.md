# pi-cc-extension-patches

搭配 `pi-cc-extensions` 使用的个人 UI 补丁包。提供：

- 星形 spinner：`· ✢ ✳ ✶ ✻ ✽` 正序、倒序播放，每帧默认 170ms。
- 工具执行状态：bash、read 等工具名前显示绿色实心圆，每 600ms 在圆点和空格间切换，一轮 1.2 秒。
- 每次 `turn_start` 随机选一个动词，例如 `Baking…`、`Crafting…`；同一轮保持不变。
- 保留主插件的 token、耗时和 compact 状态摘要。
- 内置 `claude-dark` 和 `claude-light` 主题：深灰或中性浅灰背景、Claude 橙色强调色。
- cc-my-pi 风格双栏启动头：静态 π 图案、可选入场动画、模型与思考级别、工作目录、已加载资源统计。
- 紧凑用户消息：移除发送后消息的上下 padding，保留背景、左右间距和正文空行。
- 输入框与用户消息显示 `❯ ` 前缀，续行对齐；只装饰显示，不加入草稿或发给模型的正文。

```text
✳ Baking… (↓ 1,234 tokens · 12s)
```

## 安装

已在 Pi 1.1.0 的原生 `setWorkingIndicator()` API 上验证。旧版缺少此 API 时会提示并跳过。

```bash
pi install git:github.com/KevinZonda/pi-cc-extension-patches
```

然后在 Pi 执行 `/reload`。主插件仍安装 `pi-cc-extensions`；这个包无需安装 `cc-my-pi`。
如果当前装着完整的 `cc-my-pi`，先移除它，避免两个 UI 套件同时接管界面。
spinner 和动词补丁只在 TUI 模式启用，不改变 print/RPC 输出。

## Claude 主题

安装或更新后执行 `/reload`，再通过 `/settings` 的 Theme 选择 `claude-dark` 或 `claude-light`。
也可以在 `~/.pi/agent/settings.json` 中设置：

```json
{ "theme": "claude-dark" }
```

自动随终端明暗切换（浅色在前、深色在后）：

```json
{ "theme": "claude-light/claude-dark" }
```

浅色主题名为 `claude-light`，避免与主插件的 `cc-light` 重名。
主题由包清单自动注册，无需单独复制到用户的 themes 目录。
`claude-dark` 使用深灰背景；`claude-light` 使用黑色正文、中性灰消息与工具背景，失败工具保留淡红背景。
浅色主题只在重点提示中使用品牌橙，标题和行内代码使用正文色，避免浅底上的亮橙文字。
两者均包含语法高亮、diff、思考级别和 HTML 导出颜色；浅色配色是近似风格，不是 Claude Code 的官方色表。

## 本地开发

也可以在项目目录里临时加载，退出即结束，不写入安装设置：

```bash
pi -e ./pi-cc-extensions -e ./pi-cc-extension-patches
```

本地开发时，可以克隆后使用绝对路径安装：

```bash
git clone https://github.com/KevinZonda/pi-cc-extension-patches.git
pi install /absolute/path/to/pi-cc-extension-patches
```

## 配置

可选文件：`~/.pi/agent/pi-cc-extension-patches.json`。
设置 `PI_CODING_AGENT_DIR` 时使用该目录。修改后执行 `/reload`。

```json
{
  "headerEnabled": true,
  "headerAnimationEnabled": false,
  "compactUserMessages": true,
  "promptPrefixEnabled": true,
  "spinnerEnabled": true,
  "toolStatusDotsEnabled": true,
  "verbsEnabled": true,
  "intervalMs": 170,
  "toolBlinkIntervalMs": 600,
  "verbs": ["Baking", "Crafting", "Thinking", "Cooking"]
}
```

省略 `verbs` 使用 cc-my-pi 的完整动词列表。空数组也回退到默认列表。
`intervalMs` 控制星形动画的每帧间隔，默认 170ms。
`toolBlinkIntervalMs` 独立控制工具圆点每次显示或隐藏的时长，默认 600ms（一轮 1.2 秒）；
例如设为 1000 即显示 1 秒、隐藏 1 秒。两个间隔均限制为 50–2000ms。
spinner、工具状态圆点和动词可以分别关闭。
`/ccpatches` 查看当前配置。

`compactUserMessages` 默认开启，只控制发送后消息的上下 padding。
设为 `false` 并 `/reload` 可恢复原生上下 padding。正文空行、代码块、图片行与终端复制区域标记均保留。

`promptPrefixEnabled` 默认开启，输入框和用户消息第一条内容行显示主题强调色的 `❯ `，
续行对齐，并保留原生左右间距；可独立设为 `false` 后 `/reload` 关闭。
输入以 `!` 或 `!!` 开头时保留原生 shell 显示，不额外叠加 `❯`。
补丁在原生布局中预留前缀列，保持换行、光标、IME 硬件光标标记、鼠标点击与补全菜单一致。
图片终端协议行不加前缀；消息窗口小于 4 列时回退到原显示。
输入框可用宽度不足以预留前缀并容纳双宽字符时也回退，避免中文/emoji 的原生换行错误。
仅 TUI 启用，不修改模型消息、草稿、提交内容或 print/RPC 输出，也不替换现有编辑器组件。
编辑器补丁覆盖继承当前 Pi `CustomEditor` 的编辑器；另带 Pi 副本或完全独立的编辑器不保证覆盖。

## 双栏启动头

![双栏启动头预览](assets/header-preview.png)

左侧显示 π 图案、当前模型、思考级别和工作目录；右侧显示设置入口及 skills、prompts、
extensions 的总数与 global/project 分布。`/loaded` 查看资源名称和主题列表。
主题不计入 global/project 汇总。统计读取当前会话的资源加载器，不再次执行扩展或扫描文件。

补丁启用时接管启动头，主插件无需关闭 `showStartupHeader`，两种加载顺序都只显示一个 header。
将 `headerEnabled` 设为 `false` 并 `/reload`，可恢复主插件的启动头。
终端过窄时隐藏右栏。默认直接显示完整的橙色 π，不播放入场动画。
将 `headerAnimationEnabled` 设为 `true` 并 `/reload` 可启用约 1.5 秒的入场动画，
播放后停止。颜色跟随当前主题。

## 实现与维护

工作状态的星形动画通过原生 `setWorkingIndicator()` 设置，颜色使用主题 `accent`。
默认原生 Loader 也使用同样的星形帧，因此手动 `!command`、重试、上下文压缩、分支摘要
和其他原生加载提示均使用星形动画，保留各自的提示文字与颜色。
显式自定义或隐藏的 indicator 保留。定时器由 Pi 管理，补丁只改变默认帧和间隔，
不重写 Loader 的 start/stop；关闭补丁时恢复已有实例和原型。

工具卡与工具分组里的独立点阵状态图标，在工具渲染范围内改为绿色实心圆闪烁。
尚未开始执行的工具显示静态暗色圆点；完成的 `✓`、失败的 `✗` 和输出正文保留。
工具卡继续使用主插件的刷新机制，补丁不新增动画计时器。
`toolStatusDotsEnabled: false` 可恢复主插件的点阵图标。

动词通过 Loader 显示边界的轻量原型补丁，只替换 working 指示器中开头的
`Working...` / `Working…`。主插件保存的原始文字不会改变，不需要重算 token 或添加刷新计时器。
compact 的 `Running...` 等摘要、重试、压缩和其他加载提示的文字保持原样。
紧凑用户消息与消息前缀依赖 UserMessageComponent 的渲染结构与 Markdown 的内部 padding 字段；
输入前缀依赖 CustomEditor 的渲染方法、可见内容行数与鼠标事件坐标结构。
动词依赖 Loader 的内部 `updateDisplay` 方法；启动头接入依赖 InteractiveMode 的内部
`setExtensionHeader` 方法。默认星形动画依赖 Loader 的 `setIndicator` 与 `getRenderedIndicator`，
工具状态补丁依赖 Container、Theme 及主插件的工具分组标记。升级 Pi 或主插件时需要验证，
目前在 Pi 1.1.0、pi-cc-extensions 0.9.11 上验证。

`/reload` 和退出时恢复补丁；所有权检查避免旧实例撤销新实例的补丁。

```bash
npm install
npm run typecheck
npm test
npm run pack:dry-run
```

包可从 GitHub 安装，尚未发布到 npm。主插件源码无需修改。
