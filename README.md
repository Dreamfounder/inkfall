# 墨蚀：拾字纪 · INKFALL

<p align="center">
  <img src="assets/banner.svg" alt="墨蚀：拾字纪 · 当世界开始失字，你是最后一个补字师" width="100%">
</p>

一款中文叙事打字游戏。你是拾遗城最年轻的补字师沈砚，要在“白蚀”吞掉整座城之前，把被删去的字一句句写回来。

- **主线**：12 卷 · 36 个刻印节点 · 约 7,300 字剧情
- **支线**：20 篇独立档案，每篇含一段刻印文本
- **挑战**：40 篇文本，1—5 星，每阶 8 篇，同难度随机抽取
- **结局**：十二枚字印拼成一句“万物有时，字里重逢，记得就好”，最后一页可留下你自己的字

## 如何游玩

直接双击 `index.html` 或 `打开游戏.bat` 即可，无需安装、无需联网。

如果浏览器对 `file://` 下的本地存档有限制，可在本目录启动一个静态服务器：

```bash
python -m http.server 8787
```

然后访问 `http://127.0.0.1:8787/`。

进度保存在浏览器的 `localStorage` 中，键名为 `inkfall_save_v1`。

想从头重玩，可在浏览器开发者工具控制台执行：

```js
localStorage.removeItem('inkfall_save_v1');
location.reload();
```

## 玩法

1. 在主线卷宗中选择已解锁的卷与刻印节点。
2. 阅读剧情，进入刻印台，用中文输入法逐字写出上方原文。
3. 计时从第一次落笔或输入法开始组字时启动；组字期间不判定，上屏后再比较。
4. 写错可按退格修改，笔误会计入准确率。
5. 标点支持半角等价输入：`，` 可打 `,`，`。` 可打 `.`，`；` 可打 `;`，`：` 可打 `:`，`、` 可打 `,`，`？` 可打 `?`。
6. 主线完成三段刻印即完卷，解锁下一卷与对应支线；挑战模式按星级随机抽题，完成一次即记为“已遇”。

## 难度与评分

- 主线 / 支线三星：准确率 ≥ 97%，字速 ≥ 60 字/分
- 主线 / 支线二星：准确率 ≥ 93%，字速 ≥ 40 字/分
- 挑战评级 S / A / B / C：由准确率与本阶速度线共同决定，难度越高速度线越高

字速按“正确完成的最终字符数 / 实际用时”计算，单位为字/分。

## 文件结构

```
inkfall/
├─ index.html               页面骨架、刻印台、终页
├─ favicon.svg
├─ assets/banner.svg        README 横幅
├─ css/
│  └─ style.css             墨色视觉系统、响应式布局、动效
├─ js/
│  ├─ data-story.js         12 卷主线剧情与 36 段刻印文本
│  ├─ data-side.js          20 篇支线档案
│  ├─ data-challenge.js     40 篇挑战题库（每阶 8 篇）
│  ├─ data.js               世界观、难度、墨阶与总装
│  └─ app.js                存档、路由、打字引擎、评分、流程
├─ .nojekyll                GitHub Pages 静态站点标记
├─ .gitignore / .gitattributes
└─ 打开游戏.bat             Windows 本地启动
```

## 发布到 GitHub Pages

这个项目不需要构建，直接把仓库根目录当作静态站点即可。

### 网页上传（不安装 Git 也可以）

1. 在 GitHub 新建一个空仓库，仓库名建议 `inkfall`，可见性选 **Public**。
2. 进入仓库，点 **Add file → Upload files**。
3. 如果拿到的是 `inkfall-github.zip` 上传包，先解压；进入解压后的文件夹，按 `Ctrl+A` 全选所有内容，拖进 GitHub 上传区域。
4. 确认文件列表里至少包含 `index.html`、`css/`、`js/`、`assets/`，然后点 **Commit changes**。
5. 打开仓库 **Settings → Pages**。
6. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
7. Branch 选择 **main**，目录选择 **/(root)**，点 **Save**。
8. 等待一两分钟，访问：

```text
https://<你的用户名>.github.io/inkfall/
```

如果仓库名不是 `inkfall`，把地址最后的路径换成实际仓库名。游戏使用哈希路由（`#/story`、`#/challenge/3`），GitHub Pages 不需要额外的 404 重写规则。

### 用 Git 命令推送

```bash
git init
git add .
git commit -m "feat: 墨蚀：拾字纪 打字游戏"
git branch -M main
git remote add origin https://github.com/<你的用户名>/inkfall.git
git push -u origin main
```

推送后，仍然在 **Settings → Pages** 里选择 `main` / `(root)` 即可。


## 内容说明

世界围绕“字即存在”的规则展开：三十年前，三位校书人从《万卷初版》末行删去“万物终将归于空白”九个字，被删去的句子化作“白蚀”从纸外渗回。主线从报晓钟失字开始，经过纸雨、活字塔、借名市场、无名宴、逆流河与白页之门，最终走到需要重写结局的最后一页。

支线是主线世界里的市井侧影：点灯人、纸鸢匠、面馆老板、抄书人、邮差、校对员、戏子、守夜人、纸片人、幼儿园的孩子。它们不改变主线结局，但补全了“被空白吃掉的不只是字”这一主题。

挑战题库覆盖从 19 字短句到 97 字长段，标题与正文均可在挑战页查看；每阶固定 8 篇，抽取时不会连续重复同一篇。

## 开发

纯静态 HTML / CSS / JavaScript，无构建步骤、无第三方运行时依赖。

- 数据与界面分离：新增关卡只需修改 `js/data-*.js`
- 存档结构带默认值合并，新增字段不会破坏旧存档
- 打字引擎支持 IME `compositionstart/end`、半角标点等价、退格纠错、暂停计时
- 已使用 jsdom 自动化冒烟测试覆盖：主线三关、完卷解锁、支线、挑战抽题、暂停、半角标点、终页留言与首页回显
