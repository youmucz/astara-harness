# Agent Note: Host 可配置的启动页展示

Status: implemented

[English](2026-09-12-host-configurable-boot-presentation.md) | 中文

## 问题

`packages/client/web` 会在任何客户端插件激活之前渲染无框架的[启动页](../../../../packages/client/web/src/boot-page.ts)，因为 React 只随 UI 渲染器到达；[启动内核决策](../../implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)拥有这一位置，[boot glue 决策](../../implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)拥有 `AppWebEntry.run()`。该页面是唯一能报告加载进度、bundle 导入失败或插件因缺失服务而卡住的界面，而它把英文文案 `HARNESS`、`Loading plugins…` 与 `Failed to load plugins` 写死在代码里。

因此 Host 消费方要么在本地化产品中显示英文启动文案，要么自建一个内核并不拥有的第二套启动界面。该页面私有的明暗回退配色（[boot-page.module.css](../../../../packages/client/web/src/boot-page.module.css) 中的 `--dsh-boot-*`）同样无法被消费方触及：消费方自己的主题 token 随插件到达，其深色标记所在的元素也不是内核选择器使用的 `body[data-ds-dark-theme]`。

## 决策

`AppWebEntry` 接受可选的第三个构造函数参数 `constructor(container, seams?, presentation?)`；它由内部模块 [boot-presentation.ts](../../../../packages/client/web/src/boot-presentation.ts) 在构造函数中一次性解析为一个封闭的只读记录，交给 `BootPage` 渲染。`BootSeams` 保持原有位置与唯一成员 `loadBundle`，因此 `new AppWebEntry(el)` 与 `new AppWebEntry(el, { loadBundle })` 都不变。包入口 [index.ts](../../../../packages/client/web/src/index.ts) 导出 `BootPresentation` 输入类型；解析器与解析结果保持内部。

### 第三个参数刻意标注为 `unknown`

根 [conventions](../../../../AGENTS.md#conventions) 要求在已标注类型的同进程边界信任 TypeScript，而在 parser、config、持久化、worker、进程与协议边界做运行时校验。Host 传入的展示对象正是跨越包边界进入内核的配置输入：它可能来自另一次构建或纯 JavaScript，而且恰恰是在页面仍须渲染失败报告时被传入。把参数标注为 `unknown`，就是让 [resolveBootPresentation](../../../../packages/client/web/src/boot-presentation.ts) 成为赋予它类型的解析器；这也正是 conventions 要求的显式 `resolve(request): Spec` 步骤，而不是在 `run()` 里隐藏默认值。解析器只读取文档化的字段名，绝不枚举键，绝不递归进嵌套值，也绝不调用传入的字段；每次读取都限制在 `try`/`catch` 内。诚实的边界是：读取 getter 或 proxy trap 就会执行该 trap，所以这是有界读取，不是沙箱。

### 解析后的字段与默认值

| 字段 | 接受的输入 | 默认值 |
|---|---|---|
| `wordmark` | 去空白后非空、至多 256 字符的字符串 | `HARNESS` |
| `loading` | 去空白后非空、至多 1024 字符的字符串 | `Loading plugins…` |
| `failure` | 去空白后非空、至多 1024 字符的字符串 | `Failed to load plugins` |
| `failureExplanation` | 去空白后非空、至多 1024 字符的字符串 | 缺失 |
| `lang` | 去空白后非空、至多 35 字符的字符串 | 缺失 |
| `dir` | 恰好为 `ltr`、`rtl` 或 `auto` | 缺失 |
| `cssVariables` | 六个文档化颜色名称，值为非空的十六进制、颜色名或所列函数、至多 256 字符 | 缺失 |

超长字符串按缺失处理而不截断，因此 Host 无法悄悄发出只渲染一半的标题。解析逐字段且全量：配置缺失、不是普通对象（包括数组）或某个字段非法时，该字段保留默认值，因此 `BootPage` 不做任何校验，下游的每次读取都是全量的。`lang` 与 `dir` 只作为属性设置在启动页根元素上。

### 六个颜色属性属于页面自身的回退层

`cssVariables` 恰好接受 `boot-page.module.css` 读取的六个颜色输入：`--dsh-boot-bg`、`--dsh-boot-label-primary`、`--dsh-boot-label-secondary`、`--dsh-boot-label-tertiary`、`--dsh-boot-border` 与 `--dsh-boot-brand`。每个被接受的值都成为启动页根元素上的内联自定义属性，各自处于独立的 `try`/`catch` 中；并且只有非空、至多 256 字符、可独立解析且同时被 `CSS.supports('color', value)` 接受的字符串才会被接受。接受的形式是：3、4、6、8 位十六进制颜色；有限的 CSS 颜色名表，含 `transparent` 与 `gray`/`grey` 两种拼写，不含 `currentColor` 与系统颜色；以及小写函数 `rgb()`、`rgba()`、`hsl()`、`hsla()`、`hwb()`、`lab()`、`lch()`、`oklab()`、`oklch()` 与 `color()`，其函数体只含数字、`.`、`%`、逗号、斜杠、加号、减号与空格，其中 `color()` 只限 `srgb`、`srgb-linear`、`display-p3`、`a98-rgb`、`prophoto-rgb`、`rec2020`、`xyz`、`xyz-d50` 与 `xyz-d65` 空间且函数体为数字。角度单位、`none`、指数写法、`calc()` 与嵌套函数、相对颜色 `from` 语法、转义与注释一律拒绝，`var()` 之类的引用同样拒绝。

这项语法是必需的而非装饰性的：语法接受但引擎拒绝的值，与 `var(--missing)` 或 `inherit` 这类根本无法独立解析的值，结局相同。非法的自定义属性值不会通过 `var()` 回退；声明会在计算值阶段失效，属性转而取其继承值或初始值，因此未校验的值会让标签不可读，而不是被无害地忽略。

样式表保留 `var(--dsw-alias-*, var(--dsh-boot-*))` 链，因此已定义的 `--dsw-alias-*` 变量仍是生效值，传入的私有值只在其别名缺失处生效。这六个名称就是页面所读颜色输入的封闭集合，因此传入的名称无法触及布局、可见性或生成内容，也无法隐藏失败报告；`--dsh-boot-arc` 仍由内核在 spinner 上独占，且任何字体或排版属性都不可设置。

### 保持不变的部分

不传该参数时，页面仍渲染 `HARNESS`、`Loading plugins…` 与 `Failed to load plugins`，不设置 `lang` 或 `dir` 属性，也不写入任何调用方提供的属性。所有展示字符串仍是纯文本节点，因此任何值都不会变成标记，渲染期间也不会执行调用方提供的回调。entry 名称、`fail(message)` 报告以及 `web boot: N entries did not activate` 审计文本保持 loader 产出的原样。启动页根元素保留 `data-dsh-boot`，spinner 保留 `data-dsh-boot-spinner`，`updateProgress` 仍计算 `72 + ratio * 216` 度，`dispose()` 仍只移除启动页根元素；内核不新增依赖，不读取主题或 locale 状态，也不在 entry 名单就绪前加载任何插件。

### locale 归属不变

三个默认字面量属于内核常量，位于 [boot-presentation.ts](../../../../packages/client/web/src/boot-presentation.ts)，而不是 locale 字典条目，因为页面在任何 locale 服务存在之前就已渲染；[locale 归属的 client UI 文案](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)已记录启动标记不属于字典路径。`verify-client-ui-i18n` 发现的是 `packages/client/*/src` 下的 JSX、`packages/client/ui-*` 下的全部 `.ts`/`.tsx` 文件、包含 TSX 的包 `src/client` 树以及 `apps/web` 源码，因此 `.ts` 启动文件不在其扫描范围内，本次改动不新增任何允许清单条目、排除项或豁免。落在被扫描路径中的新启动界面字符串仍需要有它的字典归属方。

### 相关决策与取代情况

[启动内核](../../implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)与 [boot glue](../../implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)决策仍是内核位置与 `AppWebEntry.run()` 的归属方；[locale 归属的 client UI 文案](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)仍是 client 文案的归属方；已归档的[插件前主题引导](../../archived/bug-fix/2026-08-10-pre-plugin-theme-bootstrap.md)仍是首帧配色的冻结记录，在此不设定规则。没有现行 Agent Note 被取代；消费方接线、启动前配色快照、DSH 版本固定与全家族发布仍属于各自的工件。

## 备选方案

**把参数标注为 `BootPresentation` 并信任调用方。** 否决：内核的公开构造函数是预稳定的包边界，会从其他构建被触达，而不完整或畸形的对象恰好会在页面必须报告 entry 名单失败时让它失败；conventions 要求把运行时校验放在配置边界。

**接受开放的 `--*` 映射或样式声明对象。** 否决：任意属性都可能隐藏或改写失败报告，与内核对页面的归属相矛盾；封闭的六个名称才是页面自身的输入。

**截断超长字符串。** 否决：截断后的标题会悄悄发出残缺的界面文案；按缺失处理可保留默认值或 Host 的合法字段。

**接受模板、HTML 字符串或 Host 渲染回调。** 否决：这会引入把字符串变成标记的入口，并在失败路径执行调用方代码；文本节点是唯一的写入路径。

**在内核内内置本地化默认值，或预取 i18n / 主题插件。** 否决：内核将拥有 locale 或主题选择，并依赖一个本身可能失败的 entry；展示只能由内核默认值加配置解析。

## 后果

既有调用点保持原有源码与行为，新参数是增量的，默认展示与之前的界面文案完全一致：`HARNESS`、`Loading plugins…` 与 `Failed to load plugins`，不带 `lang` 或 `dir`，也不写入任何由配置产生的属性。配置的字符串按文档顺序渲染为文本节点，畸形输入逐字段降级，只有六个文档化名称能作用于启动页根元素，已定义的 `--dsw-alias-*` 变量仍优先于传入的私有值。默认标记、进度圆弧计算、销毁范围与 loader 诊断保持不变，也不新增依赖或激活前插件。

接受值契约刻意保守。Host 不能使用相对颜色 `from` 语法、`calc()`、嵌套函数、角度单位、`none` 通道、指数写法、转义或注释；所列函数若引擎不支持，会被强制的引擎检查跳过而不是近似处理，因此样式表默认值仍然生效。内核不判断对比度，也不检测深色模式；六个名称的集合日后可能显得过窄，届时扩充它是一次经过评审的内核改动，而不是开放通道。

读取配置是有界的，而非沙箱：读取 getter 或 proxy trap 就会执行该 trap，因此保证是「一个抛错的字段只损失该字段」，渲染永不依赖某次不可信读取成功。消费方的主题状态仍归消费方：在 `body` 以外元素上标记深色的消费方会得到页面的浅色回退，除非它自己传入值或拥有别名层。

这是带独立包证明的内核行为。消费方接线、启动前配色投影、DSH 版本固定与全家族发布都是独立工件，本次改动不声明可用于生产的发布。

## 测试

`packages/client/web/tests/boot-presentation.client.spec.ts` 固定了默认展示、本地化界面文案、字面文本、逐字段降级、不可信读取、封闭颜色集合与未变的失败路径，两个既有包内 spec 未经修改地通过。记录的包内结果是 78 个测试、三个包源码文件覆盖率 100%，`pnpm typecheck`、`pnpm lint`（3573 个文件 0 错误 0 警告）、`pnpm build` 与 `pnpm build:web` 全部退出码 0。双引擎浏览器通道（Chromium 151.0.7922.34 与 Chrome 153.0.8010.36，各 199/199 项检查）显示：`var()` 与 `inherit` 被拒绝且内联属性未设置，默认浅色白与深色 `rgb(21, 21, 23)` 表面正常渲染，被接受的十六进制、`rgb()` 与 `oklch()` 值生效，别名行为没有变化。
