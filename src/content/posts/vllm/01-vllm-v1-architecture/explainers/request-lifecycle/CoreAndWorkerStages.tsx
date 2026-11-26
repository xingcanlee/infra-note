import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { ActiveFocusFrame, DataFlowArrow, RADIUS, RADIUS_SM } from '@/explainers/kit';
import { MANIM_EASE, MORPH_SPRING } from './steps';

export function ScheduleStage({ beat, playToken }: { beat: number; playToken: number }) {
  const budgetDeducted = beat >= 1;
  const kvAllocated = beat >= 2;
  const dispatched = beat >= 3;

  const workers = [
    { label: 'Worker 0 · GPU 0', sub: '分片 0 (1/16)', y: 54 },
    { label: 'Worker 1 · GPU 1', sub: '分片 1 (1/16)', y: 114 },
    { label: 'Worker 15 · GPU 15', sub: '分片 15 (1/16)', y: 174 },
  ];

  return (
    <g>
      {/* 左上：input_queue 出队 */}
      <rect
        x={14}
        y={42}
        width={160}
        height={82}
        rx={RADIUS}
        fill={beat === 0 ? toneFill('done') : 'var(--wisp-surface)'}
        stroke={beat === 0 ? toneStroke('done') : 'var(--wisp-border)'}
        strokeWidth={beat === 0 ? 1.5 : 1}
      />
      <text x={24} y={62} className="vllm-lc-group-title">
        input_queue 出队
      </text>
      <rect
        x={24}
        y={72}
        width={140}
        height={40}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke={toneStroke('done')}
      />
      <text x={94} y={90} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
        req_0 (Prefill 4)
      </text>
      <text x={94} y={105} textAnchor="middle" className="vllm-lc-note-svg">
        等待配额与 KV 槽位
      </text>

      {/* 左下：KVCacheManager 物理块池 */}
      <motion.g
        initial={false}
        animate={{ opacity: kvAllocated ? 1 : 0.4 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={14}
          y={138}
          width={160}
          height={100}
          rx={RADIUS}
          fill="var(--wisp-surface)"
          stroke={kvAllocated ? toneStroke('done') : 'var(--wisp-border)'}
        />
        <text x={24} y={157} className="vllm-lc-group-title">
          KVCacheManager 空闲池
        </text>
        {['B0 (null)', 'B1 -> req_0', 'B2 (free)', 'B3 (free)'].map((bLabel, i) => {
          const bx = 24 + (i % 2) * 72;
          const by = 166 + Math.floor(i / 2) * 32;
          const isB1 = i === 1;
          return (
            <g key={bLabel}>
              <rect
                x={bx}
                y={by}
                width={66}
                height={26}
                rx={RADIUS_SM}
                fill={isB1 && kvAllocated ? toneFill('done') : 'var(--wisp-bg)'}
                stroke={isB1 && kvAllocated ? toneStroke('done') : 'var(--wisp-border)'}
                strokeWidth={isB1 && kvAllocated ? 1.5 : 1}
              />
              <text x={bx + 33} y={by + 17} textAnchor="middle" className="vllm-lc-mono-sm">
                {bLabel}
              </text>
            </g>
          );
        })}
      </motion.g>

      {/* 左 -> 中 两条不交叉通道 */}
      <DataFlowArrow
        points={[
          [174, 83],
          [214, 83],
        ]}
        tone="done"
        active={true}
        visible={true}
        draw={true}
        flow={beat === 0}
        dotToken={beat === 0 ? playToken : 0}
      />
      <DataFlowArrow
        points={[
          [174, 188],
          [214, 188],
        ]}
        tone="done"
        active={kvAllocated}
        visible={kvAllocated}
        draw={true}
        flow={beat === 2}
        dotToken={beat === 2 ? playToken : 0}
      />

      {/* 中：Scheduler 配额与 SchedulerOutput */}
      <rect
        x={214}
        y={42}
        width={220}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={budgetDeducted ? toneStroke('done') : 'var(--wisp-border)'}
        strokeWidth={1.5}
      />
      <text x={226} y={62} className="vllm-lc-group-title">
        Scheduler 连续批统一调度
      </text>

      {/* token_budget 进度条 */}
      <text x={226} y={84} className="vllm-lc-mono-sm">
        token_budget 扣减：16 → {budgetDeducted ? '12' : '16'}
      </text>
      <rect
        x={226}
        y={92}
        width={196}
        height={24}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <motion.rect
        x={228}
        y={94}
        height={20}
        rx={RADIUS_SM}
        fill={toneFill('done')}
        stroke={toneStroke('done')}
        initial={false}
        animate={{ width: budgetDeducted ? 144 : 192 }}
        transition={MORPH_SPRING}
      />
      <text x={324} y={108} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
        {budgetDeducted ? '已分配 req_0: 4 tok (剩 12)' : '可用预算 = 16 tok'}
      </text>

      {/* SchedulerOutput RPC 卡片 */}
      <motion.g
        initial={false}
        animate={{ opacity: kvAllocated ? 1 : 0.32 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={226}
          y={132}
          width={196}
          height={94}
          rx={RADIUS_SM}
          fill={kvAllocated ? toneFill('done') : 'var(--wisp-bg)'}
          stroke={kvAllocated ? toneStroke('done') : 'var(--wisp-border)'}
        />
        <text x={236} y={152} className="vllm-lc-mono-sm" fontWeight={700}>
          SchedulerOutput
        </text>
        <text x={236} y={171} className="vllm-lc-mono-sm">
          num_sched: {'{req_0: 4}'}
        </text>
        <text x={236} y={189} className="vllm-lc-mono-sm">
          new_block_ids: [B1]
        </text>
        <text x={236} y={210} className="vllm-lc-note-svg">
          T_sched = 1 ms · MultiprocExecutor
        </text>
      </motion.g>

      {/* 中 -> 右 RPC 扇出箭头（独立总线 x=456，干净分叉到 3 个 Worker） */}
      {workers.map((w) => (
        <DataFlowArrow
          key={w.label}
          points={[
            [434, 140],
            [456, 140],
            [456, w.y + 24],
            [482, w.y + 24],
          ]}
          tone="done"
          active={dispatched}
          visible={dispatched}
          draw={true}
          flow={beat === 3}
          dotToken={beat === 3 ? playToken : 0}
        />
      ))}

      {/* 右：Tier 3 Worker 并行组 */}
      <rect
        x={482}
        y={42}
        width={184}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={dispatched ? toneStroke('done') : 'var(--wisp-border)'}
      />
      {workers.map((w) => (
        <motion.g
          key={w.label}
          initial={false}
          animate={{ opacity: dispatched ? 1 : 0.35 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          <rect
            x={494}
            y={w.y}
            width={160}
            height={48}
            rx={RADIUS_SM}
            fill={dispatched ? toneFill('done') : 'var(--wisp-bg)'}
            stroke={dispatched ? toneStroke('done') : 'var(--wisp-border)'}
            strokeWidth={dispatched ? 1.5 : 1}
          />
          <text
            x={574}
            y={w.y + 20}
            textAnchor="middle"
            className="vllm-lc-mono-sm"
            fontWeight={700}
          >
            {w.label}
          </text>
          <text x={574} y={w.y + 37} textAnchor="middle" className="vllm-lc-note-svg">
            {w.sub}
          </text>
        </motion.g>
      ))}

      <ActiveFocusFrame
        x={beat === 0 ? 10 : beat === 1 ? 222 : beat === 2 ? 10 : 478}
        y={beat === 0 ? 38 : beat === 1 ? 74 : beat === 2 ? 134 : 38}
        w={beat === 0 ? 168 : beat === 1 ? 204 : beat === 2 ? 168 : 192}
        h={beat === 0 ? 90 : beat === 1 ? 48 : beat === 2 ? 108 : 204}
        tone="done"
        visible={true}
      />
    </g>
  );
}

export function WorkerStage({ beat, playToken }: { beat: number; playToken: number }) {
  const forward = beat >= 1;
  const sampled = beat >= 2;
  const written = beat >= 3;

  const candidates = [
    { tok: '" world"', id: '9906', prob: '0.78', w: 86, top: true },
    { tok: '"!"', id: '0', prob: '0.14', w: 26, top: false },
    { tok: '"."', id: '13', prob: '0.08', w: 16, top: false },
  ];

  return (
    <g>
      {/* 左：GPUModelRunner 备批 */}
      <rect
        x={14}
        y={42}
        width={184}
        height={196}
        rx={RADIUS}
        fill={beat === 0 ? toneFill('highlight') : 'var(--wisp-surface)'}
        stroke={beat === 0 ? toneStroke('highlight') : 'var(--wisp-border)'}
        strokeWidth={beat === 0 ? 1.5 : 1}
      />
      <text x={26} y={62} className="vllm-lc-group-title">
        GPUModelRunner 备批输入
      </text>
      <rect
        x={26}
        y={74}
        width={160}
        height={42}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <text x={36} y={92} className="vllm-lc-mono-sm" fontWeight={700}>
        input_ids [15496..151645]
      </text>
      <text x={36} y={108} className="vllm-lc-note-svg">
        扁平拼批 L_in = 4
      </text>

      <rect
        x={26}
        y={124}
        width={160}
        height={44}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <text x={36} y={143} className="vllm-lc-mono-sm" fontWeight={700}>
        slot_mapping [4,5,6,7]
      </text>
      <text x={36} y={159} className="vllm-lc-note-svg">
        映射物理块 B1 四槽
      </text>

      <rect
        x={26}
        y={176}
        width={160}
        height={48}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke={toneStroke('highlight')}
      />
      <text x={106} y={197} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
        单卡权重分片 1/16
      </text>
      <text x={106} y={214} textAnchor="middle" className="vllm-lc-note-svg">
        810 GiB / 16 = 50.625 GiB
      </text>

      {/* 左 -> 中 */}
      <DataFlowArrow
        points={[
          [198, 140],
          [236, 140],
        ]}
        tone="highlight"
        active={forward}
        visible={true}
        draw={true}
        flow={beat === 1}
        dotToken={beat === 1 ? playToken : 0}
      />

      {/* 中：分片前向与 KV B1 写入 */}
      <motion.g
        initial={false}
        animate={{ opacity: forward ? 1 : 0.38 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={236}
          y={42}
          width={196}
          height={196}
          rx={RADIUS}
          fill={beat === 1 ? toneFill('highlight') : 'var(--wisp-surface)'}
          stroke={forward ? toneStroke('highlight') : 'var(--wisp-border)'}
          strokeWidth={beat === 1 ? 1.75 : 1}
        />
        <text x={248} y={62} className="vllm-lc-group-title">
          设备侧前向与 KV 写入
        </text>
        <rect
          x={248}
          y={76}
          width={172}
          height={54}
          rx={RADIUS_SM}
          fill="var(--wisp-bg)"
          stroke={forward ? toneStroke('highlight') : 'var(--wisp-border)'}
        />
        <text x={334} y={98} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
          Attention + FFN (8 ms)
        </text>
        <text x={334} y={117} textAnchor="middle" className="vllm-lc-note-svg">
          AllReduce 聚合张量并行结果
        </text>

        {/* B1 4 槽 KV 写入动画 */}
        <text x={248} y={152} className="vllm-lc-mono-sm" fontWeight={600}>
          写入 KV 物理块 B1（4 槽）：
        </text>
        {[0, 1, 2, 3].map((slot) => {
          const sx = 248 + slot * 44;
          return (
            <motion.g
              key={slot}
              initial={false}
              animate={{ opacity: forward ? 1 : 0.25, scale: forward ? 1 : 0.94 }}
              transition={{ ...MORPH_SPRING, delay: forward ? slot * 0.06 : 0 }}
            >
              <rect
                x={sx}
                y={162}
                width={39}
                height={34}
                rx={RADIUS_SM}
                fill={forward ? toneFill('highlight') : 'var(--wisp-bg)'}
                stroke={forward ? toneStroke('highlight') : 'var(--wisp-border)'}
              />
              <text x={sx + 19.5} y={183} textAnchor="middle" className="vllm-lc-mono-sm">
                k{slot}/v{slot}
              </text>
            </motion.g>
          );
        })}
        <text x={248} y={220} className="vllm-lc-note-svg">
          末位 hidden_state 送入 LM Head
        </text>
      </motion.g>

      {/* 中 -> 右 */}
      <DataFlowArrow
        points={[
          [432, 140],
          [470, 140],
        ]}
        tone="highlight"
        active={sampled}
        visible={forward}
        draw={true}
        flow={beat >= 2}
        dotToken={beat >= 2 ? playToken : 0}
      />

      {/* 右：Sampler 概率分布 + output_queue */}
      <rect
        x={470}
        y={42}
        width={196}
        height={196}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={sampled ? toneStroke('highlight') : 'var(--wisp-border)'}
      />
      <text x={482} y={62} className="vllm-lc-group-title">
        sample_tokens() 概率分布
      </text>
      {candidates.map((c, idx) => {
        const cy = 76 + idx * 32;
        return (
          <g key={c.id}>
            <text x={482} y={cy + 16} className="vllm-lc-mono-sm" fontWeight={c.top ? 700 : 500}>
              {c.tok}
            </text>
            <rect
              x={534}
              y={cy + 4}
              width={120}
              height={18}
              rx={RADIUS_SM}
              fill="var(--wisp-bg)"
              stroke="var(--wisp-border)"
            />
            <motion.rect
              x={535}
              y={cy + 5}
              height={16}
              rx={RADIUS_SM}
              fill={c.top && sampled ? toneFill('highlight') : 'var(--wisp-surface)'}
              stroke={c.top && sampled ? toneStroke('highlight') : 'var(--wisp-border)'}
              initial={false}
              animate={{ width: sampled ? c.w : 10 }}
              transition={MORPH_SPRING}
            />
            <text
              x={648}
              y={cy + 17}
              textAnchor="end"
              className="vllm-lc-mono-sm"
              fill={c.top && sampled ? 'var(--wisp-fg)' : 'var(--wisp-muted)'}
            >
              {sampled ? c.prob : '--'}
            </text>
          </g>
        );
      })}

      <motion.g
        initial={false}
        animate={{ opacity: written ? 1 : 0.3 }}
        transition={{ duration: 0.25, ease: MANIM_EASE }}
      >
        <rect
          x={482}
          y={178}
          width={172}
          height={46}
          rx={RADIUS_SM}
          fill={written ? toneFill('highlight') : 'var(--wisp-bg)'}
          stroke={written ? toneStroke('highlight') : 'var(--wisp-border)'}
          strokeWidth={written ? 1.5 : 1}
        />
        <text x={568} y={198} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
          output_queue ← [9906]
        </text>
        <text x={568} y={214} textAnchor="middle" className="vllm-lc-note-svg">
          仅回传 4 B 标量 ID
        </text>
      </motion.g>

      <ActiveFocusFrame
        x={beat === 0 ? 10 : beat === 1 ? 232 : beat === 2 ? 478 : 478}
        y={beat === 0 ? 38 : beat === 1 ? 38 : beat === 2 ? 70 : 174}
        w={beat === 0 ? 192 : beat === 1 ? 204 : 180}
        h={beat === 0 ? 204 : beat === 1 ? 204 : beat === 2 ? 100 : 54}
        tone="highlight"
        visible={true}
      />
    </g>
  );
}

export function StreamStage({ beat, playToken }: { beat: number; playToken: number }) {
  const pullDone = beat >= 1;
  const decoded = beat >= 2;
  const pushed = beat >= 3;

  const nodes = [
    {
      x: 24,
      w: 134,
      title: 'output_thread',
      sub: 'zmq.PUSH [9906]',
      active: true,
      tone: 'highlight' as const,
    },
    {
      x: 190,
      w: 122,
      title: 'AsyncMPClient',
      sub: 'zmq.PULL 唤醒',
      active: pullDone,
      tone: 'highlight' as const,
    },
    {
      x: 344,
      w: 148,
      title: 'DecodeStream',
      sub: decoded ? '9906 → " world"' : '增量字节对齐',
      active: decoded,
      tone: 'active' as const,
    },
    {
      x: 524,
      w: 132,
      title: 'SSE Client',
      sub: pushed ? 'delta: " world"' : '等待事件流',
      active: pushed,
      tone: 'done' as const,
    },
  ];

  const focusNode = nodes[Math.min(beat, 3)];

  return (
    <g>
      {/* 上轨：异步输出回传与 SSE 增量解码 */}
      <rect
        x={14}
        y={42}
        width={652}
        height={112}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
      />
      <text x={24} y={62} className="vllm-lc-group-title">
        上轨（Tier 2 → Tier 1 → 客户端）：轻量 ID 回传与 SSE 增量推流
      </text>

      {nodes.map((node, idx) => {
        const next = nodes[idx + 1];
        return (
          <g key={node.title}>
            <motion.g
              initial={false}
              animate={{ opacity: node.active ? 1 : 0.35 }}
              transition={{ duration: 0.24, ease: MANIM_EASE }}
            >
              <rect
                x={node.x}
                y={74}
                width={node.w}
                height={66}
                rx={RADIUS}
                fill={node.active ? toneFill(node.tone) : 'var(--wisp-bg)'}
                stroke={node.active ? toneStroke(node.tone) : 'var(--wisp-border)'}
                strokeWidth={node.active ? 1.5 : 1}
              />
              <text x={node.x + node.w / 2} y={100} className="vllm-lc-node-title">
                {node.title}
              </text>
              <text x={node.x + node.w / 2} y={121} className="vllm-lc-node-sub">
                {node.sub}
              </text>
            </motion.g>
            {next && (
              <DataFlowArrow
                points={[
                  [node.x + node.w, 107],
                  [next.x, 107],
                ]}
                tone={next.tone}
                active={next.active}
                visible={node.active}
                draw={true}
                flow={beat === idx + 1}
                dotToken={beat === idx + 1 ? playToken : 0}
              />
            )}
          </g>
        );
      })}

      {/* 下轨：完全并行重叠的 Step N+1 计算 */}
      <rect
        x={14}
        y={166}
        width={652}
        height={72}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke={toneStroke('done')}
        strokeDasharray="4 3"
      />
      <text x={24} y={186} className="vllm-lc-group-title">
        下轨（同刻并行重叠）：EngineCore + Worker 已进入 Step N+1，Frontend 解码零阻塞计算
      </text>
      <rect
        x={24}
        y={196}
        width={632}
        height={28}
        rx={RADIUS_SM}
        fill="var(--wisp-bg)"
        stroke="var(--wisp-border)"
      />
      <motion.rect
        x={26}
        y={198}
        height={24}
        rx={RADIUS_SM}
        fill={toneFill('done')}
        stroke={toneStroke('done')}
        initial={false}
        animate={{ width: beat === 0 ? 150 : beat === 1 ? 310 : beat === 2 ? 470 : 628 }}
        transition={MORPH_SPRING}
      />
      <text x={340} y={214} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
        Step N+1: 调度 + 8 ms 算子执行同步推进（CPU 解码停顿 = 0 ms）
      </text>

      <ActiveFocusFrame
        x={focusNode.x - 4}
        y={70}
        w={focusNode.w + 8}
        h={74}
        tone={focusNode.tone}
        visible={true}
      />
    </g>
  );
}
