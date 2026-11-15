# Charlo Films · 视频作品集

统一管理交互演示、动态视觉、产品宣传和教程视频。

- 展示站：https://charlo.cn/video-library/
- 交互实验室：https://charlo.cn/interactive-lab/
- 完整原片：本仓库按项目发布的 GitHub Releases。

## 文件分工

- `data/catalog.json`：项目、版本、时长、原片尺寸、SHA-256 和下载地址。
- `media/`：网页封面与轻量 MP4 预览。90 秒以内的影片保留完整内容；长片提供 24 秒无声精选画面。
- `credits/`：来源、改编和音效署名。
- `site/`、`scripts/build.mjs`：静态展示页面、筛选与播放器。
- 原始成片作为 Releases 附件保存，不进入 Git 历史，不随 `git clone` 自动下载。

## 下载原片

需要 Node.js 22 或更新版本及系统 curl，无需安装 npm 依赖。下载会继承系统代理设置，并保持 HTTPS 证书校验。

```sh
npm run download -- ripples watercat
npm run download -- --all --output /absolute/folder
```

脚本逐个下载并核对文件大小与 SHA-256，校验通过后才将临时文件改为正式文件名。默认下载到被 Git 忽略的 `downloads/`。

## 本地预览与检查

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:4180/video-library/ 。`npm run preview` 使用现有 dist；`npm run check` 检查所有目录、链接和媒体索引；`npm run smoke` 用本机 Chrome 验证分类、搜索、视频播放、版本切换与手机布局。截图写入系统临时目录，不进入仓库。

## 添加或更新影片

1. 在 Git 忽略的本地清单中记录项目和原片路径。清单结构参考公开 catalog，视频条目用 `source` 指向绝对路径；本地路径不会写入公开目录。
2. `npm run prepare-media -- /absolute/private-sources.json`：需要 FFmpeg/FFprobe，生成封面、压缩预览和公开索引。原片不会改动。
3. 确认来源与署名，构建并检查后提交代码。
4. `npm run publish-videos -- /absolute/private-sources.json`：通过已登录的 GitHub CLI 上传原片、校验清单和版本记录；附件校验通过后公开发布。
5. 推送 main 后，GitHub Actions 构建、检查并统一部署 Pages。构建不重复编码视频。

本地 `sources.local.json` 保存了首批来源路径，且被 Git 忽略。导入脚本将首批作品发布为 `项目ID-v1.0.0`。发布新作品版本时，在该项目清单中设置 `version`（例如 `1.1.0`），生成新标签与新文件名，保留旧版本下载地址。发布器会拒绝用同一已发布版本替换不同成片。

## 来源与范围

只收录已完成的项目输出；参考片、测试片、粗剪、分镜素材与他人作品归档没有纳入首批。全年圆环演示由当前交互实现重新录制。

视频与其中的第三方内容保留原有的权利归属；本集合没有统一重新授权全部视频。逐项署名见项目页面和 `credits/`。
