import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { ActiveFocusFrame, DataFlowArrow, RADIUS, RADIUS_SM } from '@/explainers/kit';
import { MANIM_EASE, MORPH_SPRING, PROMPT_TOKENS, type LifecycleStepState } from './steps';

export const MINI_PILLS = [
  { key: 'frontend', x: 14, w: 108, title: 'Tier 1 API', tiers: ['tokenize', 'pack'] },
  { key: 'ipc', x: 146, w: 104, title: 'ZMQ IPC', tiers: ['ipc'] },
  { key: 'core', x: 274, w: 120, title: 'Tier 2 Core', tiers: ['schedule'] },
  { key: 'worker', x: 418, w: 124, title: 'Tier 3 Worker', tiers: ['worker'] },
  { key: 'stream', x: 566, w: 100, title: 'SSE 回传', tiers: ['stream'] },
] as const;

export function MiniPipelineStrip({
  phase,
  stepNum,
}: {
  phase: LifecycleStepState['phase'];
  stepNum: number;
}) {
  return (
    <g aria-label="三层架构当前位置指示条">
      {MINI_PILLS.map((pill, idx) => {
        const isCurrent = (pill.tiers as readonly string[]).includes(phase);
        const isDone = idx + 1 < stepNum && !isCurrent;
        const tone =
          pill.key === 'frontend'
            ? 'active'
            : pill.key === 'ipc' || pill.key === 'core'
              ? 'done'
              : 'highlight';
        const fill = isCurrent ? toneFill(tone) : isDone ? 'var(--wisp-surface)' : 'var(--wisp-bg)';
        const stroke = isCurrent
          ? toneStroke(tone)
          : isDone
            ? toneStroke('done')
            : 'var(--wisp-border)';
        const next = MINI_PILLS[idx + 1];

        return (
          <g key={pill.key}>
            <rect
              x={pill.x}
              y={4}
              width={pill.w}
              height={24}
              rx={RADIUS}
              fill={fill}
              stroke={stroke}
              strokeWidth={isCurrent ? 1.75 : 1}
            />
            <text
              x={pill.x + pill.w / 2}
              y={20}
              textAnchor="middle"
              className="vllm-lc-mini-text"
              fill={isCurrent ? 'var(--wisp-fg)' : 'var(--wisp-muted)'}
              fontWeight={isCurrent ? 700 : 500}
            >
              {pill.title}
            </text>
            {next && (
              <line
                x1={pill.x + pill.w + 3}
                y1={16}
                x2={next.x - 4}
                y2={16}
                stroke={idx + 1 < stepNum ? toneStroke('done') : 'var(--wisp-border)'}
                strokeWidth={idx + 1 < stepNum ? 1.5 : 1}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function TokenizeStage({ beat, playToken }: { beat: number; playToken: number }) {
  const offload = beat >= 1;
  const tokenized = beat >= 2;
  const validated = beat >= 3;

  return (
    <g>
      {/* 左上：FastAPI Event Loop */}
      <rect
        x={14}
        y={42}
        width={186}
        height={78}
        rx={RADIUS}
        fill={beat === 0 ? toneFill('active') : 'var(--wisp-surface)'}
        stroke={beat === 0 ? toneStroke('active') : 'var(--wisp-border)'}
        strokeWidth={beat === 0 ? 1.75 : 1}
      />
      <text x={24} y={60} className="vllm-lc-group-title">
        FastAPI 异步事件循环
      </text>
      <rect
        x={24}
        y={68}
        width={166}
        height={22}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <text x={107} y={83} className="vllm-lc-mono-sm" textAnchor="middle">
        POST "Hello vLLM"
      </text>
      <text
        x={107}
        y={107}
        className="vllm-lc-note-svg"
        textAnchor="middle"
        fill={offload ? toneStroke('done') : 'var(--wisp-muted)'}
      >
        {offload ? '主循环继续接收新 HTTP 请求' : '收到 HTTP 请求与采样参数'}
      </text>

      {/* 卸载箭头：直下不压任何文字 */}
      <DataFlowArrow
        points={[
          [107, 120],
          [107, 152],
        ]}
        tone="active"
        active={offload}
        visible={true}
        draw={true}
        flow={beat === 1}
        dotToken={beat === 1 ? playToken : 0}
        label="卸载"
      />

      {/* 左下：Renderer ThreadPool */}
      <motion.g
        initial={false}
        animate={{ opacity: offload ? 1 : 0.35 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={14}
          y={152}
          width={186}
          height={86}
          rx={RADIUS}
          fill={beat === 1 ? toneFill('active') : 'var(--wisp-surface)'}
          stroke={beat === 1 ? toneStroke('active') : 'var(--wisp-border)'}
          strokeWidth={beat === 1 ? 1.75 : 1}
        />
        <text x={24} y={170} className="vllm-lc-group-title">
          Renderer 线程池（阻塞隔离）
        </text>
        <rect
          x={24}
          y={179}
          width={166}
          height={24}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke={offload ? toneStroke('active') : 'var(--wisp-border)'}
        />
        <text x={107} y={195} className="vllm-lc-mono-sm" textAnchor="middle">
          tokenizer.encode(prompt)
        </text>
        <text x={107} y={222} className="vllm-lc-note-svg" textAnchor="middle">
          CPU BPE 查表不阻塞协程
        </text>
      </motion.g>

      {/* 横向输出通道：仅走空白走廊 x=200..248 */}
      <DataFlowArrow
        points={[
          [200, 195],
          [248, 195],
        ]}
        tone="active"
        active={tokenized}
        visible={offload}
        draw={true}
        flow={beat >= 2}
        dotToken={beat === 2 ? playToken : 0}
      />

      {/* 右侧：词元切分与校验区 */}
      <rect
        x={248}
        y={42}
        width={418}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
      />
      <text x={262} y={62} className="vllm-lc-group-title">
        InputProcessor 词元切分与请求校验
      </text>

      {/* 原始字符串拆分条 */}
      <rect
        x={262}
        y={74}
        width={390}
        height={26}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <text x={274} y={91} className="vllm-lc-mono-sm">
        raw: "Hello vLLM" + &lt;eos&gt;
      </text>
      <text x={640} y={91} textAnchor="end" className="vllm-lc-mono-sm" fill={toneStroke('active')}>
        {tokenized ? 'L_in = 4' : '等待切分'}
      </text>

      {/* 4 枚词元卡片逐拍弹入 */}
      {PROMPT_TOKENS.map((tok, i) => {
        const tx = 262 + i * 99;
        return (
          <motion.g
            key={tok.id}
            initial={false}
            animate={{
              opacity: tokenized ? 1 : 0.28,
              y: tokenized ? 0 : 8,
            }}
            transition={{ ...MORPH_SPRING, delay: tokenized ? i * 0.06 : 0 }}
          >
            <rect
              x={tx}
              y={112}
              width={91}
              height={54}
              rx={RADIUS}
              fill={tokenized ? toneFill('active') : 'var(--wisp-bg)'}
              stroke={tokenized ? toneStroke('active') : 'var(--wisp-border)'}
              strokeWidth={tokenized ? 1.5 : 1}
            />
            <text x={tx + 45.5} y={134} className="vllm-lc-tok-text">
              {tok.text}
            </text>
            <text x={tx + 45.5} y={154} className="vllm-lc-tok-id">
              {tok.id}
            </text>
          </motion.g>
        );
      })}

      {/* 校验通过栏 */}
      <motion.g
        initial={false}
        animate={{ opacity: validated ? 1 : 0.35 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={262}
          y={180}
          width={390}
          height={44}
          rx={RADIUS}
          fill={validated ? toneFill('done') : 'var(--wisp-bg)'}
          stroke={validated ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={validated ? 1.5 : 1}
        />
        <text x={274} y={200} className="vllm-lc-mono-sm" fontWeight={600}>
          prompt_token_ids = [15496, 2159, 44, 151645]
        </text>
        <text x={274} y={216} className="vllm-lc-note-svg">
          {validated ? '长度 ≤ max_model_len 校验通过 · 生成请求对象' : '等待长度与采样参数校验'}
        </text>
      </motion.g>

      <ActiveFocusFrame
        x={beat === 0 ? 10 : beat === 1 ? 10 : beat === 2 ? 258 : 258}
        y={beat === 0 ? 38 : beat === 1 ? 148 : beat === 2 ? 108 : 176}
        w={beat <= 1 ? 194 : 398}
        h={beat === 0 ? 86 : beat === 1 ? 94 : beat === 2 ? 62 : 52}
        tone={beat >= 3 ? 'done' : 'active'}
        visible={true}
      />
    </g>
  );
}

export function PackStage({ beat, playToken }: { beat: number; playToken: number }) {
  const convert = beat >= 1;
  const compact = beat >= 2;
  const ready = beat >= 3;

  return (
    <g>
      {/* 左：分散堆内存 PyLongObject */}
      <rect
        x={14}
        y={42}
        width={186}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
      />
      <text x={26} y={62} className="vllm-lc-group-title">
        Python 分散堆对象（112 B）
      </text>
      {PROMPT_TOKENS.map((tok, i) => {
        const y = 74 + i * 32;
        return (
          <g key={tok.id}>
            <rect
              x={26}
              y={y}
              width={162}
              height={26}
              rx={RADIUS_SM}
              fill={beat === 0 ? toneFill('highlight') : 'var(--wisp-bg)'}
              stroke={beat === 0 ? toneStroke('highlight') : 'var(--wisp-border)'}
            />
            <text x={36} y={y + 17} className="vllm-lc-mono-sm">
              PyLong({tok.id})
            </text>
            <text x={178} y={y + 17} textAnchor="end" className="vllm-lc-note-svg">
              28 B
            </text>
          </g>
        );
      })}
      <text x={107} y={224} textAnchor="middle" className="vllm-lc-note-svg">
        4 个离散指针 + GC 引用计数字段
      </text>

      {/* 箭头 1：左 → 中 */}
      <DataFlowArrow
        points={[
          [200, 140],
          [238, 140],
        ]}
        tone="active"
        active={convert}
        visible={true}
        draw={true}
        flow={beat === 1}
        dotToken={beat === 1 ? playToken : 0}
      />

      {/* 中：打包转换漏斗 */}
      <motion.g
        initial={false}
        animate={{ opacity: convert ? 1 : 0.42 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={238}
          y={66}
          width={154}
          height={148}
          rx={RADIUS}
          fill={beat === 1 ? toneFill('active') : 'var(--wisp-surface)'}
          stroke={beat === 1 ? toneStroke('active') : 'var(--wisp-border)'}
          strokeWidth={beat === 1 ? 1.75 : 1}
        />
        <text x={315} y={88} textAnchor="middle" className="vllm-lc-node-title">
          EngineCoreRequest
        </text>
        <rect
          x={250}
          y={102}
          width={130}
          height={28}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <text x={315} y={120} textAnchor="middle" className="vllm-lc-mono-sm">
          array_like=True
        </text>
        <rect
          x={250}
          y={138}
          width={130}
          height={28}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <text x={315} y={156} textAnchor="middle" className="vllm-lc-mono-sm">
          gc=False · 无循环
        </text>
        <text x={315} y={194} textAnchor="middle" className="vllm-lc-note-svg">
          跳过 pickle 序列化
        </text>
      </motion.g>

      {/* 箭头 2：中 → 右 */}
      <DataFlowArrow
        points={[
          [392, 140],
          [430, 140],
        ]}
        tone="done"
        active={compact}
        visible={convert}
        draw={true}
        flow={beat >= 2}
        dotToken={beat >= 2 ? playToken : 0}
      />

      {/* 右：连续 int32 ndarray（16 B） */}
      <rect
        x={430}
        y={42}
        width={236}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
      />
      <text x={442} y={62} className="vllm-lc-group-title">
        连续 int32 缓冲（16 B · 4×4 B）
      </text>

      {/* 4 格紧邻连续槽 */}
      <motion.g
        initial={false}
        animate={{ opacity: convert ? 1 : 0.3 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        {PROMPT_TOKENS.map((tok, i) => {
          const sx = 442 + i * 53;
          return (
            <g key={tok.id}>
              <rect
                x={sx}
                y={76}
                width={53}
                height={42}
                rx={RADIUS_SM}
                fill={compact ? toneFill('active') : 'var(--wisp-bg)'}
                stroke={compact ? toneStroke('active') : 'var(--wisp-border)'}
                strokeWidth={1.25}
              />
              <text x={sx + 26.5} y={96} className="vllm-lc-tok-id" fontWeight={700}>
                {tok.id}
              </text>
              <text x={sx + 26.5} y={111} className="vllm-lc-note-svg" textAnchor="middle">
                4 B
              </text>
            </g>
          );
        })}
      </motion.g>

      {/* 压缩对比进度条 */}
      <motion.g
        initial={false}
        animate={{ opacity: compact ? 1 : 0.28 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={442}
          y={134}
          width={212}
          height={24}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <motion.rect
          x={444}
          y={136}
          height={20}
          rx={RADIUS_SM}
          fill={toneFill('done')}
          stroke={toneStroke('done')}
          initial={false}
          animate={{ width: compact ? 32 : 208 }}
          transition={MORPH_SPRING}
        />
        <text x={556} y={150} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={600}>
          112 B → 16 B (-86%)
        </text>
      </motion.g>

      {/* msgspec + OOB 就绪卡片 */}
      <motion.g
        initial={false}
        animate={{ opacity: ready ? 1 : 0.3 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={442}
          y={172}
          width={212}
          height={52}
          rx={RADIUS}
          fill={ready ? toneFill('done') : 'var(--wisp-bg)'}
          stroke={ready ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={ready ? 1.5 : 1}
        />
        <text x={548} y={194} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
          msgspec + 16 B OOB 就绪
        </text>
        <text x={548} y={212} textAnchor="middle" className="vllm-lc-note-svg">
          直接切入跨进程零拷贝发送
        </text>
      </motion.g>

      <ActiveFocusFrame
        x={beat === 0 ? 10 : beat === 1 ? 234 : beat === 2 ? 438 : 438}
        y={beat === 0 ? 38 : beat === 1 ? 62 : beat === 2 ? 72 : 168}
        w={beat === 0 ? 194 : beat === 1 ? 162 : 220}
        h={beat === 0 ? 204 : beat === 1 ? 156 : beat === 2 ? 90 : 60}
        tone={beat >= 2 ? 'done' : 'active'}
        visible={true}
      />
    </g>
  );
}

export function IpcStage({ beat, playToken }: { beat: number; playToken: number }) {
  const dealerRecv = beat >= 1;
  const zeroCopy = beat >= 2;
  const enqueued = beat >= 3;

  const frames = [
    { y: 74, title: 'Frame 0: ADD (0x00)', sub: '请求类型标签' },
    { y: 126, title: 'Frame 1: msgspec 紧凑体', sub: '参数与元数据' },
    { y: 178, title: 'Frame 2: 16 B OOB 视图', sub: 'int32 缓冲 (copy=False)' },
  ];

  return (
    <g>
      {/* 左侧 Tier 1 发送侧：纯多帧结构，无任何挡路节点 */}
      <rect
        x={14}
        y={42}
        width={224}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={beat === 0 ? toneStroke('active') : 'var(--wisp-border)'}
        strokeWidth={beat === 0 ? 1.5 : 1}
      />
      <text x={26} y={62} className="vllm-lc-group-title">
        Tier 1 · AsyncMPClient (ROUTER)
      </text>
      {frames.map((f, idx) => (
        <motion.g
          key={f.title}
          initial={false}
          animate={{ x: beat === 0 ? 0 : 2 }}
          transition={{ duration: 0.25, delay: idx * 0.04, ease: MANIM_EASE }}
        >
          <rect
            x={26}
            y={f.y}
            width={200}
            height={44}
            rx={RADIUS_SM}
            fill={beat === 0 ? toneFill('active') : 'var(--wisp-bg)'}
            stroke={beat === 0 ? toneStroke('active') : 'var(--wisp-border)'}
            strokeWidth={beat === 0 ? 1.5 : 1}
          />
          <text x={36} y={f.y + 19} className="vllm-lc-mono-sm" fontWeight={700}>
            {f.title}
          </text>
          <text x={36} y={f.y + 35} className="vllm-lc-note-svg">
            {f.sub}
          </text>
        </motion.g>
      ))}

      {/* 进程隔离墙（纯粹放在通道中间空白地带 x=238..364） */}
      <line
        x1={301}
        y1={42}
        x2={301}
        y2={238}
        stroke="var(--wisp-border)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <rect
        x={257}
        y={44}
        width={88}
        height={22}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <text x={301} y={59} textAnchor="middle" className="vllm-lc-mono-sm">
        IPC 进程墙
      </text>

      {/* 三条平行短直通道跨越进程墙，严格不穿过任何文字盒 */}
      {frames.map((f, idx) => (
        <DataFlowArrow
          key={`wire-${idx}`}
          points={[
            [238, f.y + 22],
            [364, f.y + 22],
          ]}
          tone={idx === 2 ? 'done' : 'active'}
          active={beat >= 0}
          visible={true}
          draw={true}
          flow={beat <= 1}
          dotToken={beat <= 1 ? playToken : 0}
        />
      ))}

      {/* 右侧 Tier 2 EngineCoreProc：上下双线程隔离视图 */}
      <rect
        x={364}
        y={42}
        width={302}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={beat >= 1 ? toneStroke('done') : 'var(--wisp-border)'}
        strokeWidth={beat >= 1 ? 1.5 : 1}
      />
      <text x={376} y={62} className="vllm-lc-group-title">
        Tier 2 · EngineCoreProc（双线程解耦）
      </text>

      {/* 上半区：独立 I/O 线程 + input_queue */}
      <motion.g
        initial={false}
        animate={{ opacity: dealerRecv ? 1 : 0.38 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={376}
          y={72}
          width={278}
          height={94}
          rx={RADIUS_SM}
          fill={zeroCopy ? toneFill('done') : 'var(--wisp-bg)'}
          stroke={zeroCopy ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={zeroCopy ? 1.5 : 1}
        />
        <text x={386} y={91} className="vllm-lc-mono-sm" fontWeight={700}>
          input_thread (zmq.DEALER) · 后台零拷贝收帧
        </text>
        <text x={386} y={108} className="vllm-lc-note-svg">
          {zeroCopy ? 'copy=False 直接解析缓冲视图，零内存拷贝' : '等待从 IPC 套接字读取多帧'}
        </text>

        {/* input_queue 队列条 */}
        <rect
          x={386}
          y={118}
          width={258}
          height={38}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke={enqueued ? toneStroke('done') : 'var(--wisp-border)'}
        />
        <text x={396} y={141} className="vllm-lc-mono-sm" fontWeight={600}>
          input_queue:
        </text>
        <motion.g
          initial={false}
          animate={{ opacity: enqueued ? 1 : 0.22, x: enqueued ? 0 : -10 }}
          transition={MORPH_SPRING}
        >
          <rect
            x={482}
            y={124}
            width={152}
            height={26}
            rx={RADIUS_SM}
            fill={toneFill('done')}
            stroke={toneStroke('done')}
          />
          <text x={558} y={141} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
            [req_0: 4 tok] 已入队
          </text>
        </motion.g>
      </motion.g>

      {/* 下半区：Main Loop 持续运行不阻塞 */}
      <rect
        x={376}
        y={176}
        width={278}
        height={50}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
        strokeDasharray="4 3"
      />
      <text x={386} y={197} className="vllm-lc-mono-sm" fontWeight={600}>
        Main Loop · run_busy_loop（零中断）
      </text>
      <text x={386} y={214} className="vllm-lc-note-svg">
        网络收帧由独立线程接管，主循环继续推进当前批前向
      </text>

      <ActiveFocusFrame
        x={beat === 0 ? 10 : beat === 1 ? 372 : beat === 2 ? 372 : 478}
        y={beat === 0 ? 38 : beat <= 2 ? 68 : 120}
        w={beat === 0 ? 232 : beat <= 2 ? 286 : 160}
        h={beat === 0 ? 204 : beat <= 2 ? 102 : 34}
        tone={beat === 0 ? 'active' : 'done'}
        visible={true}
      />
    </g>
  );
}
