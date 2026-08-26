---
title: "zsh 终端启动速度优化复盘"
description: "通过基准测试与 zprof 定位重复初始化，将 macOS zsh 热启动从约 5 秒降到约 0.6 秒，并修复 PATH 与 CLI 版本回归。"
date: 2026-08-09
tags: ["zsh", "macOS", "终端", "性能优化", "开发工具"]
draft: true
---

> 环境与版本均为 2026 年 8 月 9 日的机器快照。本文记录的是一次具体优化，不代表这些工具的当前最新版本，也不保证相同配置在其他机器上得到相同耗时。

## 1. 优化结果

本次优化将登录交互式 zsh 的热启动时间从约 **4.5～4.9 秒**降低到约 **0.53～0.63 秒**。

最终验证结果：

| 项目 | 结果 |
| --- | --- |
| zsh 热启动 | 0.53～0.63 秒 |
| Node | v22.22.3 |
| npm | 10.9.8 |
| Codex | Homebrew 版本 0.147.0 |
| Cargo | 1.92.0 |
| 额外 CLI 补全函数 | 可加载 |
| 登录与非登录 shell 中的 Homebrew 命令 | 均可解析 |

## 2. 如何定位启动瓶颈

先建立纯净 shell 与用户配置 shell 的基准：

```zsh
/usr/bin/time -p zsh -dfi -c 'true'
/usr/bin/time -p zsh -ilc 'true'
```

纯净 zsh 几乎立即启动，而加载用户配置后需要约 5 秒，因此可以确认瓶颈在 zsh 初始化文件，而不是终端应用本身。

随后使用 zsh 自带的 profiler：

```zsh
zsh -dfc 'zmodload zsh/zprof; source ~/.zshrc; zprof'
```

主要瓶颈为：

- `compinit` 被执行两次，扫描和注册补全规则占用了大量时间。
- `nvm.sh` 被 source 两次，同时重复检查和切换默认 Node 版本。
- Cargo 和 Homebrew 也分别在多个启动文件中重复初始化。
- 主目录中积累了多份历史 `.zcompdump*` 补全缓存和旧锁目录。

经验：不要只凭感觉逐个关闭插件。先测量纯净 shell，再用 `zprof` 确认函数级耗时，通常能迅速找出真正的大头。

## 3. 最终采用的配置策略

### 3.1 补全只初始化一次

oh-my-zsh 已经负责执行 `compinit`，因此删除 `.zshrc` 中额外的手动初始化：

```zsh
autoload -Uz compinit
compinit
```

放在 oh-my-zsh `custom/completions` 目录中的补全仍可被自动发现；其他 CLI 的补全脚本在 oh-my-zsh 初始化之后加载。

补全缓存只保留当前主机使用的一份 `.zcompdump` 及其编译缓存。清理前必须先归档旧文件，因为缓存虽然可以重建，但备份能避免误删自定义状态。

### 3.2 Node 可直接使用，nvm 管理器按需加载

默认 Node 22 的 `bin` 目录直接加入 PATH，使 `node`、`npm`、`npx`、`pnpm` 和安装在该版本下的全局 CLI 无需加载 nvm 即可运行：

```zsh
export NVM_DIR="${XDG_CONFIG_HOME:-$HOME}/.nvm"
export PATH="$NVM_DIR/versions/node/v22.22.3/bin:$PATH"

function nvm() {
  unset -f nvm
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm "$@"
}
```

只有调用 `nvm` 管理 Node 版本时才加载完整的 nvm 脚本。这避免了每次开终端都承担约 1～2 秒的初始化成本。

需要注意：固定默认 Node 路径后，升级或更换默认 Node 版本时，要同步更新这里的版本目录。更稳妥的长期方案是增加一个低开销的版本路径生成机制，但不能重新引入每次启动都执行 nvm 的成本。

### 3.3 PATH 应增量维护，不能整体覆盖

本次最重要的回归来自这一类写法：

```zsh
export PATH="一组固定目录"
```

它会丢掉 `.zshenv`、父进程和系统工具此前加入的路径。第一次优化删除 `.zshrc` 中重复的 Cargo source 后，`~/.cargo/bin` 就被这行 PATH 重置覆盖，导致 `cargo`、`rustc`、`rustup` 等命令全部消失。

正确做法是保留现有 PATH，只追加或前置需要的目录：

```zsh
export PATH="/Applications/Visual Studio Code.app/Contents/Resources/app/bin:$PATH"
```

同时使用 zsh 的唯一数组属性消除重复目录：

```zsh
typeset -U path PATH
path=(/opt/homebrew/bin /opt/homebrew/sbin $path)
```

经验：调整启动文件时，必须同时验证 `PATH` 的最终结果，而不能只检查被移动的初始化语句是否仍然存在。

### 3.4 Cargo 与 Homebrew 各有一个权威初始化位置

- Cargo 由 `.zshenv` 中的 `~/.cargo/env` 负责，因此所有 zsh 类型都能得到 Rust 工具路径。
- Homebrew 的完整环境由 `.zprofile` 中的 `brew shellenv` 负责。
- `.zshrc` 只以零子进程开销的方式加入 `/opt/homebrew/bin` 和 `/opt/homebrew/sbin`，保证非登录交互 shell 也能找到 Homebrew 命令。

这样既避免重复执行外部命令，也兼容登录与非登录 shell。

## 4. Codex 版本问题及处理

机器上曾同时存在多份 Codex：

| 来源 | 版本 |
| --- | --- |
| Homebrew | 0.147.0 |
| Node 22 全局包 | 0.147.0 |
| Node 20 全局包 | 0.133.0 |

第一次修复命令缺失时，临时增加了一个函数，强制调用 Node 20 目录下的 Codex。虽然命令恢复了，但也导致之后无论怎样升级，实际执行的仍然是旧版 0.133.0。

最终处理方式：

- 删除这个临时 `codex` 函数。
- 确保 `/opt/homebrew/bin` 在 PATH 中优先于 Node 全局命令目录。
- 在登录和非登录 shell 中分别验证 `whence -p codex`。

最终解析结果：

```text
/opt/homebrew/bin/codex
codex-cli 0.147.0
```

经验：命令恢复后不仅要执行 `--version`，还要使用 `type -a`、`whence -a` 或 `command -v` 检查实际命中的来源。函数和别名的优先级可能高于 PATH，使升级后的二进制永远无法被调用。

## 5. Node 全局命令的版本隔离风险

nvm 的每个 Node 版本都有独立的全局包目录。切换到 Node 22 后，只安装在 Node 18 或 Node 20 下的工具不会自动出现，例如：

- `bun`、`bunx`
- `yarn`、`yarnpkg`
- `openspec`
- `tsc`、`tsserver`、`ts-node`
- `create-react-app`
- 团队或项目专用 CLI

不要把多个 Node 版本的 `bin` 目录全部拼进 PATH。这样会让 `node`、`npm`、`npx`、`pnpm` 和全局包发生跨版本混用，问题会更加隐蔽。

推荐策略：

1. 长期使用的 CLI 统一安装到默认 Node 22。
2. 旧项目专用工具通过 `nvm use 18` 或 `nvm use 20` 临时使用。
3. Homebrew 已提供且与 Node 项目无关的 CLI，优先使用 Homebrew 安装。
4. 每次迁移后同时验证命令路径和版本，而不只是验证“能运行”。

## 6. 验证清单

每次修改 shell 配置后，至少执行以下检查。

### 语法检查

```zsh
zsh -n ~/.zshenv ~/.zprofile ~/.zshrc
```

### 登录与非登录 shell

```zsh
zsh -ilc 'command -v brew; command -v cargo; command -v codex; node -v'
zsh -ic  'command -v brew; command -v cargo; command -v codex; node -v'
```

### 实际来源和版本

```zsh
type -a codex cargo node npm
codex --version
cargo --version
node -v
npm -v
```

### 启动性能

```zsh
for i in 1 2 3 4 5; do
  /usr/bin/time -p zsh -ilc 'true'
done
```

首次启动可能需要重建补全缓存，应将它与后续热启动分别记录。验收应以多次热启动的中位数为准，而不是只看最快的一次。

## 7. 备份与回滚

每次调整前至少保留一套原始配置备份；如果优化分为多个阶段，可以为关键节点分别建立备份：

```text
~/.zsh-backups/startup-YYYYMMDD-HHMMSS
~/.zsh-backups/prefer-homebrew-codex-YYYYMMDD-HHMMSS
```

第一套用于保存最初的 zsh 启动文件和补全缓存；第二套用于保存切换命令来源前的已优化配置。

恢复最初配置时，先将下面的占位目录替换为实际备份目录：

```zsh
backup_dir=~/.zsh-backups/startup-YYYYMMDD-HHMMSS
cp "$backup_dir/.zshrc" ~/.zshrc
cp "$backup_dir/.zprofile" ~/.zprofile
cp "$backup_dir/.zshenv" ~/.zshenv
exec zsh -l
```

只回退命令来源调整：

```zsh
backup_dir=~/.zsh-backups/prefer-homebrew-codex-YYYYMMDD-HHMMSS
cp "$backup_dir/.zshrc" ~/.zshrc
exec zsh -l
```

## 8. 最终经验

1. **先备份，再修改，再验证备份确实有内容。** 仅创建空目录不算完成备份。
2. **先测量，再优化。** `zprof` 比猜测插件耗时更可靠。
3. **初始化职责要唯一。** `compinit`、nvm、Cargo、Homebrew 各自只保留一个权威入口。
4. **PATH 只能增量维护。** 整体重置 PATH 极易让其他启动层加入的工具消失。
5. **命令可用不等于版本正确。** 函数、别名和旧版本目录都可能遮蔽升级后的程序。
6. **同时测试登录和非登录 shell。** Terminal、IDE、脚本和子 shell 的启动方式可能不同。
7. **不要混合多个 Node 版本的全局 bin。** 应迁移工具或显式切换版本。
8. **性能优化必须带功能回归检查。** 至少覆盖 Node、Homebrew、Rust、Go、补全和常用 CLI。

## 9. 安全检查

如果在 shell 配置中发现明文访问密钥、令牌或其他凭据，不要将其复制到文档、日志或公开仓库。应立即在对应服务端吊销并重新生成，然后改用 macOS Keychain、系统凭据存储或权限严格受限的私有环境文件注入。
