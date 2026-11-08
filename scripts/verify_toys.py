#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""运行每篇文章目录下的 toy.py，验证文中给出的 toy 代码确实能跑并得到文中的结论。

每个 toy.py 自己用 assert 表达结论（例如「有无缓存输出相同」），因此跑通即为验证通过。

用法：
    uv run scripts/verify_toys.py              # 全部
    uv run scripts/verify_toys.py deepseek/02  # 只跑路径里含该片段的
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "src" / "content" / "posts"


def main() -> int:
    needle = sys.argv[1] if len(sys.argv) > 1 else ""
    toys = sorted(p for p in POSTS.glob("*/*/toy.py") if needle in str(p.relative_to(POSTS)))
    if not toys:
        print(f"没有找到匹配 {needle!r} 的 toy.py")
        return 1

    failed: list[str] = []
    for toy in toys:
        rel = toy.relative_to(ROOT)
        # -I：隔离模式，不把脚本目录和当前目录加入 import 路径
        proc = subprocess.run(
            [sys.executable, "-I", str(toy)], capture_output=True, text=True, cwd=toy.parent
        )
        ok = proc.returncode == 0
        print(f"{'  ok  ' if ok else ' FAIL '} {rel}")
        if not ok:
            failed.append(str(rel))
            print(proc.stdout.rstrip())
            print(proc.stderr.rstrip(), file=sys.stderr)

    print(f"\n{len(toys) - len(failed)}/{len(toys)} 个 toy 通过")
    for f in failed:
        print(f"  失败：{f}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
