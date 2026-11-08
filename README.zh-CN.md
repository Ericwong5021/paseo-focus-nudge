# Paseo 对话完成提醒

为 [Paseo](https://paseo.sh) 提供对话结束提醒。插件 ID 保留为 `focus-nudge`，触发时机已改为每轮对话结束。

[English](README.md) · [贡献指南](CONTRIBUTING.md) · [许可证](LICENSE)

## 提醒方式

| 状态 | 效果 |
| --- | --- |
| 手机上的 Paseo 在前台 | 应用内提示框；宿主支持 `showToast` 时显示 toast |
| 电脑或浏览器中的 Paseo 在前台 | 应用内 toast |
| 手机上的 Paseo 在后台 | 通过 Expo 推送，向系统申请横幅提醒 |
| 电脑窗口切走或最小化 | 在运行守护进程的电脑上发送系统通知 |

成功、失败、取消都会提醒，并区分结果。单纯切换窗口、切换应用或锁屏不会发通知。手机和电脑分别设置开关、提示词和通知选项，设置保存在同一台守护进程主机上。设置界面目前使用简体中文。

## 安装

手机 App 和守护进程均需 **Paseo 0.15.3 或更新版本**。使用已发布的 RPC 和生命周期钩子，不需要自己编译 Paseo。

```sh
paseo plugin install git:https://github.com/Ericwong5021/paseo-focus-nudge.git
paseo plugin ls focus-nudge
```

先在 Paseo 设置里启用插件。插件属于受信任代码：服务端入口在守护进程电脑上运行，客户端入口在 Paseo 内运行。

打开 **设置 → 插件 → 对话完成提醒**，设置手机和电脑的开关、提示词、电脑声音及手机强提醒。手机需要连接同一台守护进程，并允许通知。切后台前，先在手机上打开一次 Paseo。

```sh
paseo plugin update focus-nudge
paseo plugin logs focus-nudge
```

本地修改：

```sh
git clone https://github.com/Ericwong5021/paseo-focus-nudge.git
cd paseo-focus-nudge
npm ci
npm run typecheck
npm test
paseo plugin install "$PWD"
# 修改后热重载：
paseo plugin reload focus-nudge
```

相同 ID 已安装时，更新或重载已有插件。删除后重新安装会清除原设置。

## 手机验收

1. Paseo 保持前台，发送提示词，等待本轮结束：应出现应用内提醒。
2. 启动另一轮对话后切换到其他 App：本轮结束时应收到系统通知。
3. 没有运行对话时切换 App：不应出现提醒。
4. 分别尝试失败和取消：提醒正文应区分结果。

设置页的“测试后台通知”按钮会主动发送系统通知，即使设置页仍在前台。它只验证推送登记和发送链路。

## 平台限制

- iOS 是否显示横幅、播放声音、穿过专注模式，由系统通知设置决定；插件不能强制覆盖。
- Android 通知频道由宿主 App 管理。请在系统设置中把 Paseo 通知设为高重要性，并允许弹出通知。0.15.3 插件 SDK 无法修改宿主的原生频道。
- 电脑系统通知发在守护进程主机上。macOS 使用 `osascript`，Linux 需要 `notify-send`；暂不支持 Windows 系统通知。
- 前台每 1.5 秒同步一次完成事件。手机切后台时上报状态，守护进程保留最多 24 小时；重启守护进程或重载插件后，需要重新打开 Paseo。状态上报未送达时，后台推送无法启用。
- 手机推送会发给守护进程已登记的所有未过期 Expo token；暂不支持按手机单独路由。
- 快速连续完成的对话可能替换电脑上的 toast。旧版手机宿主使用原生应用内提示框，不是自动消失的 toast。

## 隐私

服务端读取 `$PASEO_HOME/push-tokens.json`，默认位于 `~/.paseo/push-tokens.json`，复用 Paseo 的通知登记。该文件是宿主内部格式，未来可能变化。推送 token、通知标题、正文和事件 ID 通过 HTTPS 发给 Expo，不包含对话全文或 Agent 回复。失败原因、取消原因可能写入通知正文，提示词里不要放密钥等敏感内容。

插件不记录 token，不收集统计数据，不上传对话全文。前后台状态和待发送提醒保存在内存中，偏好设置使用 Paseo 的主机设置存储。

## 修改与协作

`index.server.ts` 负责通知路由，`client/watch.ts` 上报状态并显示前台提醒，`shared/` 定义 RPC 和设置，`server/` 提供系统通知与手机推送。客户端和共享代码不要导入 Node API。

欢迎 fork 后按自己的需求修改，再通过 Git URL 安装。提交前请阅读 [贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md) 和 [安全报告](SECURITY.md)。项目采用 MIT 许可证，允许修改和再分发。
