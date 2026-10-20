# Main Room 新一轮采样导出

把 groove-lab-mainroom-24-hits.mid 拖进 EZdrummer 3 的歌曲轨道。选择与上次相同的 Main Room 鼓组、混音预设和默认 MIDI 映射，保持 MIDI 速度为 120 BPM。先播放试听，确认下面八件鼓的对应关系正确。

| 顺序 | 鼓件 | MIDI 音符 | 三次起音时间（秒） |
| --- | --- | --- | --- |
| 1 | 底鼓 Kick Right | 36 | 2、14、26 |
| 2 | 军鼓 Snare Center | 38 | 38、50、62 |
| 3 | 闭合踩镲 Hi-Hat Closed Tip | 42 | 74、86、98 |
| 4 | 通鼓 1 Racktom 1 Center | 48 | 110、122、134 |
| 5 | 通鼓 2 Racktom 2 Center | 47 | 146、158、170 |
| 6 | 落地通鼓 Floortom 1 Center | 43 | 182、194、206 |
| 7 | 叮叮镲 Ride Bow Tip | 51 | 218、230、242 |
| 8 | 强音镲 Crash 1 Crash | 49 | 254、266、278 |

每件鼓按弱 → 中 → 强演奏，MIDI 力度分别为 **25、85、120**。弱音原先是 40，这次用 25。全部重新导出有助于确保鼓组、混音与力度一致，也包含原五件鼓更轻的鬼音。

第一击前留 2 秒，每击间隔 12 秒，最后一击后也留 12 秒。文件总长 **4 分 50 秒**。这些间隔用来保留 Ride 和 Crash 的完整尾音，请不要删除间隔或把单个击打归一化。

在 EZdrummer 3 歌曲轨道的 Track 菜单选择 Bounce → Export Song to Audio File(s)。导出从歌曲起点到完整歌曲末尾的 Stereo Mix，使用 WAV（44.1 或 48 kHz，16 或 24-bit 均可）。关闭循环和节拍器，保留鼓组本身的混音；不要加入外部伴奏或点击声。

和上次一样，把导出的 WAV 压缩成 ZIP 后发回聊天即可。我会按该 MIDI 的时间和标记拆出 24 个录音，替换当前网页的音色，并检查弱音平衡。无需你逐个手工裁切。

映射依据：Toontrack 官方 EZdrummer 3 标准 MIDI 布局，https://cdn.toontrack.com/app/uploads/pdf/EZD3_standard_layout.pdf 。如果听到的鼓件不一致，请先使用该鼓组的默认映射，不要改变 MIDI 文件的速度和顺序。
