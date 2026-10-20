# Groove Lab · 发布说明

仓库：https://github.com/divinetianci-ltc/groove-lab

网页：https://divinetianci-ltc.github.io/groove-lab/

电脑离线包：https://divinetianci-ltc.github.io/groove-lab/download.html

## 发布方式

GitHub Pages 使用 main 分支根目录。静态页面和资源均使用相对路径，支持 /groove-lab/ 项目地址。网页版先加载编辑界面，首次播放再下载相同的 24 个真实采样；每份采样无损分块并校验 SHA-256。下载页将小文件还原为完整 ZIP，校验通过后提供下载。

运行 python3 build.py 生成完整离线 HTML 和 ZIP，再运行 python3 build_web.py 生成 groove-lab-web 发布目录。上传发布目录中的文件即可更新 Pages。分块用于避免上传接口处理单个大请求；不是更换或重新压缩音色。

## 手机打开方法

iPhone：在 Safari 打开上述网页。点浏览器“分享 → 添加到主屏幕”。首次播放需要点击播放按钮来启动音频。第一次完整打开和播放后，该浏览器会缓存页面和音频，可断网再次打开；缓存被系统清理后需要重新联网。

Android：用 Chrome 打开同一个 HTTPS 网址，在菜单里选择“安装应用”或“添加到主屏幕”，具体文案由浏览器决定。

电脑：可直接打开网页，或下载并完整解压 ZIP。Windows 双击 Start-Groove-Lab.cmd，macOS 用浏览器打开 index.html。手机文件预览可能不执行本地 HTML，请使用 HTTPS 网页地址。

## 手机布局与检查

手机上播放和速度控件固定在底部，并适配安全区；节奏选择区随滚动保留在顶部；半拍选项默认收起；音符点击区域至少 44 px；四小节继续横向排列；小节按钮与复制目标便于点击；已加入主屏幕 PNG 图标和网页 App 设置。

验证包括桌面与手机视口、触控和横向滑动、三档力度、Double、复制、四小节播放、24 个真实采样解码、5 BPM 吸附，以及在线更新和离线再次打开。Chromium 自动检查不代替 Safari 实机试听。

## 音频与许可

内置录音来自用户提供的 EZdrummer 3 Main Room 导出采样，按用户确认的发布授权保留。代码的 MIT 许可不覆盖录音，也不额外授予独立采样的再分发权。本次发布保持现有鼓组和三档力度不变。
