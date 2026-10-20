---
name: NOME
description: 以深色个人星图组织六个领域的本地档案阅读界面。
colors:
  paper: "#071314"
  surface: "#0d1d1e"
  ink: "#edf5ed"
  muted: "#a3bab3"
  accent: "#b9f4ce"
  line: "#29413e"
  example: "#efd09b"
typography:
  display:
    fontFamily: "NOME Display, PingFang SC, sans-serif"
    fontSize: "clamp(24px, 4vw, 46px)"
    fontWeight: 500
    letterSpacing: "-.03em"
  headline:
    fontFamily: "NOME Display, PingFang SC, sans-serif"
    fontSize: "clamp(30px, 3.5vw, 48px)"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-.025em"
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "19px"
    lineHeight: 1.9
  label:
    fontFamily: "PingFang SC, Microsoft YaHei, -apple-system, sans-serif"
    fontSize: "clamp(14px, 1.4vw, 18px)"
    fontWeight: 400
    letterSpacing: ".12em"
rounded:
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "44px"
  xxl: "64px"
components:
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "8px 0"
  text-button-hover:
    textColor: "{colors.accent}"
  atlas-node:
    backgroundColor: "transparent"
    rounded: "{rounded.circle}"
    padding: "12px"
    width: "84px"
  domain-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "10px 0"
  domain-tab-current:
    textColor: "{colors.accent}"
  reading:
    backgroundColor: "{colors.surface}"
    padding: "44px clamp(28px, 4vw, 64px)"
    height: "100svh"
---

# Design System: NOME

## Overview

**Creative North Star: "个人星图"**

本地银河星空背景里，六个领域围绕同一个人展开。修长倾斜轨道、六颗具有不同材质的行星和一段留空的轨道形成识别语言；星图承担领域选择，不表达人格评分或完成度。

阅读界面延续同一暗色空间，以温白正文、细分隔线和留白承载个人记录。界面只读；直接阅读完整 Markdown，没有记录状态和来源时间。原生 SVG、Canvas 球面投影、本地太阳系贴图与本地字体构成视觉材料，运行时不依赖外部资源。

**Key Characteristics:**

- 银河星空纹理、深蓝黑底色与薄荷色交互反馈。
- 六颗各具材质的行星和一条共享的修长椭圆轨道，移除中心太阳。
- 阅读内容依靠章节标题、段落与留白组织。
- 椭圆轨道上的变速公转、缓慢自转、小幅视差和节点镜头推进；支持暂停和减少动态效果。

## Colors

主色清冷、明亮，正文温和；暖沙色仅用于虚构示例提示。

### Primary

- **薄荷光 · accent**：当前领域、键盘焦点与交互反馈。

### Secondary

- **暖沙 · example**：虚构示例提示。

### Neutral

- **深墨绿 · paper**：全局背景与主动留白节点的内部。
- **阅读墨绿 · surface**：阅读面板，与星图背景形成轻微层次。
- **温白 · ink**：正文与主要信息。
- **灰绿 · muted**：次要导航与未选中的文本控件。
- **暗绿线 · line**：阅读区域边界、记录之间与导航上方的细线。

**The Reading Rule.** 模块直接呈现正文，没有完成度、记录状态、来源或操作时间。

## Typography

**Display Font:** NOME Display，本地 Noto Sans SC Medium 字体子集；回退为 PingFang SC、sans-serif。

**Body Font:** PingFang SC、Microsoft YaHei、-apple-system、sans-serif。

展示字体用于中心标识与固定领域标题，正文保留适合用户自由输入内容的中文系统字体。字重克制，长文依靠行高与留白建立阅读节奏。

### Hierarchy

- **Display**：轨道上方水平居中的 NOME 使用 Michroma Regular 本地展示字体，宽体方圆字形、字距 .16em；桌面字号 clamp(48px, 7vw, 96px)，窄屏 clamp(40px, 11.5vw, 64px)、字距 .12em。阅读页中文模块标题保留原 Noto 字体。
- **Headline**：领域标题；较紧的字距与平衡换行。
- **Body**：记录正文，行宽最多 `70ch`，保留原始换行并允许长内容折行；手机字号为 `18px`。
- **Label**：Identity / Values / Traits / Skills / Bonds / Growth 居中显示于各自球体内；字号 clamp(9px, body-size × .17, 13px)、600 字重，配合轻微暗色文字阴影保持可读。
- **Chapter**：模块内文档导航为 14px，当前章节用颜色和下划线标识。
- 空模块仅显示“这里还没有内容”，18px / 1.9。

**The Local Display Rule.** 展示字库是固定标题子集，新增展示文案前须核对字形覆盖；用户正文继续使用完整的中文文本字体栈。

## Layout

首页采用纵向布局：上方为水平居中的 NOME 字标，下方为完整星图，整体在视口中居中。星图画布按 `600 / 400` 比例显示，SVG viewBox 为 `0 80 600 400`，裁去旧画布的上下空白，保持轨道与行星缩放一致。桌面默认宽度为 `min(86vw, 92svh, 930px)`，窄屏为 `min(96vw, 94svh)`，并受扣除标题、间隔和上下边距后的可用高度限制；标题和星图间隔为 `clamp(24px, 4svh, 48px)`。标题占用正常文档流，阅读时隐藏但保留占位，镜头几何不跳动。首页显示银河星图、NOME 字标、球面英文名称和轻量暂停按钮；这是当前首页的约束，不能外推为其他页面禁用说明文字。

进入领域后，原星图保持挂载，镜头连续缩放、平移到选中的行星。行星停在视口横向 25.5%、纵向 50% 的位置，右侧 48% 为独立滚动的阅读内容。行星可见宽度最多 520px。工具栏与正文之间保留大间距，连续记录用上边距 `32px`、上内边距 `28px` 和细线分开。

宽度不超过 `760px` 时，星图宽度改为 `min(96vw, 94svh)`；进入领域后行星停在上方 40svh 区域，内容在下方 60svh 独立滚动，水平内边距为 `24px`。底部领域导航为三列两行，列间距 `16px`。宽度至少 `761px` 且高度不超过 `480px` 时，星图缩为 `min(70vw, 90svh)`，节点间隙收紧。

正文支持标题、段落、嵌套列表、引用、表格和代码；表格与代码局部滚动，不撑开面板。

## Elevation & Depth

深度来自星球的定向光照、暗面、半透明轨道与前后层级。阅读面板使用色差和一像素细线，没有卡片投影。发光是星体材质和交互反馈的一部分。

### Shadow Vocabulary

不显示太阳及其暖色光晕，行星使用统一的斜向光照。球面投影压缩边缘地貌，地球保留云层与大气，土星保留球体，移除外部星环。保留三维深度排序，键盘焦点临时提升层级以保持可见。

**The Orbital Light Rule.** 光晕服务于星图节点与球体；记录阅读依靠色层、间距和分隔线建立结构。

## Shapes

球体与投影轨道构成星图。六颗行星的设计直径统一为 60 单位（相对上一版半径增加 50%），随 600×400 舞台缩放。命中区域至少 44×44px，以圆形裁剪保持紧凑队列中每颗星球的中心可独立点击，不随轨道远近缩放；尺寸仅表达行星身份，不表达资料数量或评分。

内容面板保持直边；记录之间使用横线，不套用圆角卡片。按钮为透明文本或圆形节点，图标使用描边 SVG。

## Components

### Buttons

返回与重试按钮是轻量文本操作，最小高度 `44px`，字为灰绿，悬停变为薄荷色。返回箭头为 `20px` 描边 SVG。通用键盘焦点使用 `2px` 薄荷色轮廓、外偏移 `6px`。

### Navigation

领域导航使用六类全名。桌面可换行排列，列间距 `22px`、行间距 `8px`；手机使用三列网格。当前领域以薄荷色和下划线双重标识，下划线偏移 `8px`；每项至少 `44px × 44px`。导航位于阅读内容之后。

### Markdown Reading

阅读区依次为返回、模块名、可选多文档导航和正文。只有长文且至少四个标题时展示文内目录，短文直接阅读。正文 18px / 1.95，手机 17px，标题使用完整系统字体。原始 HTML 只作为文本，不载入远程图片。跨文件链接使用同一页面中的文档路由；前后导航与键盘可用。

### Star Atlas

背景使用 Solar System Scope / INOVE 的 CC BY 4.0 银河星空纹理，原图 2048×1024、约 246 KB，本地加载，移除人工 SVG 星点。CSS 调整亮度、饱和度与暗角；阅读时在桌面右侧、手机下半屏加深遮罩，保持正文清晰。背景不随行星镜头放大，也不增加循环动效。

六颗行星使用 Solar System Scope 的 CC BY 4.0 本地材质，投影为球面。水星陨石坑、金星云层、地球大陆与云层、火星地貌、木星云带、土星色带形成不同身份；行星只表达模块身份，不承载资料数量或状态。

六颗行星共享半长轴 `270`、离心率 `0.46`、倾角 `62°`、画面旋角 `-18°` 的椭圆轨道。画面以椭圆几何中心居中，采用正交投影，投影长短轴比约 `2.4:1`。统一周期为 `15s`（相对上一版 30 秒周期，公转速度再翻倍），按开普勒方程计算位置，相对于未绘出的焦点满足等时扫过等面积，近端速度约为远端的 `2.7` 倍。六颗行星的平近点角覆盖 `180°`，内部间隔 `36°`、首尾空段 `180°`；初始可见弧长覆盖 `1/2`，运动时随变速自然疏密变化，不在完整轨道等距平铺。球体直径不随类别或轨道远近改变。放大后的星球在密集段允许轻微前后交叠，但每颗星球的中心与点击入口保持可见、可访问。

六个名称作为各自 `.node-orb` 内的文字层，固定于球体正面中央；表面纹理缓慢自转，名称保持正向可读。文字随球体一起公转、缩放、悬停与前后遮挡，不再创建外置标签，不再逐帧计算文本避让。中文完整分类保留于无障碍名称、悬停提示和详情。悬停或键盘聚焦时暂停，悬浮球体放大 18%、180ms 过渡，不新增外圈。

NOME 字标位于完整轨道上方的独立标题区，水平居中，使用本地 Michroma 字体、宽字距与温白色，形成企业官网首屏层级。字标不拦截指针事件，行星保留前景层级。进入详情时字标与球面名称隐藏，返回星图时恢复；详情仅保留模块名、章节与正文。

鼠标视差最多平移 `8px`、倾斜 `2–3°`，采用 `.6s` 平滑跟随；触屏不启用视差。点击节点按轨道实时坐标在 `950ms` 内推进至行星近景，内容延迟 `.25s` 进入；返回在 `750ms` 内拉远到原星系。缩放倍率按行星直径与视口计算，镜头缓动使用 `cubic-bezier(.22, 1, .36, 1)`。球体保留同一 Canvas 与同一位置数据，近景纹理分辨率为 768px。

暂停/继续按钮位于舞台右下角，命中区域为 `44px`，保留无障碍名称；进入阅读后隐藏。六颗行星以 `180–240s` 周期缓慢自转，球面经度变化而明暗方向保持稳定；优先使用原生 WebGL，GPU 不可用时以 256px Canvas、最高 20fps 绘制。阅读、离屏和后台自动停止循环；用户暂停同时关闭视差与推进。系统开启减少动态效果时，取消自转、视差和空间过渡，保留选中状态与直接导航。后退与 Escape 从当前镜头帧反向移动；视口、后台与偏好变化直接收敛到正确构图。进入完成后焦点落到内容标题，返回后恢复对应行星焦点。近景星图为 inert 装饰，领域切换使用阅读区按钮。

## Do's and Don'ts

### Do:

- **Do** 保留六颗行星的不同材质，以章节与正文承载个人叙述。
- **Do** 保持主星球和卫星的光照方向与轨道关系，阅读内容使用清晰的正文和分隔线。
- **Do** 为所有可操作元素保留键盘焦点与足够的命中区域，并尊重减少动态效果设置。
- **Do** 从本地提供字体和图形资源，扩展展示文案时检查字体子集。

### Don't:

- **Don't** 把节点大小、轨道或亮度解释为人格评分、完成度或能力排名。
- **Don't** 在当前首页恢复顶部导航、描述、内容卡片、英文标语或底部引导区。
- **Don't** 展示来源、操作时间、待核实、草稿或进度统计。
- **Don't** 把虚构示例资料当成用户真实档案展示。
