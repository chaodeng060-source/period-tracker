"""周期推导测试：相位边界 + 平均周期 + 去重。"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402


def _days_ago(n: int) -> str:
    return (dt.date.today() - dt.timedelta(days=n)).isoformat()


# ---- period_phase 边界 ----

def test_phase_boundaries_default_cycle():
    # cycle=28 length=5 → 排卵日=14
    assert server.period_phase(1, 28, 5) == "menstrual"
    assert server.period_phase(5, 28, 5) == "menstrual"
    assert server.period_phase(6, 28, 5) == "follicular"
    assert server.period_phase(14, 28, 5) == "ovulation"
    assert server.period_phase(16, 28, 5) == "luteal"
    assert server.period_phase(30, 28, 5) == "luteal"  # 宽限 2 天
    assert server.period_phase(31, 28, 5) == "late"
    assert server.period_phase(None, 28, 5) is None
    assert server.period_phase(0, 28, 5) is None


# ---- derive ----

def test_derive_avg_cycle_from_history():
    starts = ["2026-04-01", "2026-04-29", "2026-05-28"]  # 28、29 天
    d = server.derive({"starts": starts, "period_length": 5})
    assert d["avg_cycle"] == 28  # round(28.5)=28（银行家舍入取偶）
    assert d["recorded"] == 3 and d["cycles"] == 2


def test_derive_filters_bogus_gaps():
    # 3 天的间隔（重复记录/误触）不该拉低平均周期
    starts = ["2026-04-01", "2026-04-04", "2026-04-29"]
    d = server.derive({"starts": starts, "period_length": 5})
    assert d["avg_cycle"] == 28  # 4/1→4/29；4/1→4/4 被 15..60 过滤


def test_derive_dedups_double_logging_within_same_period():
    # 经期第 3 天手滑又点了一次「经期来了」——不该把 day_of_cycle 重置回 1
    starts = [_days_ago(2), _days_ago(0)]
    d = server.derive({"starts": starts, "period_length": 5})
    assert d["day_of_cycle"] == 3
    assert d["last_start"] == _days_ago(2)


def test_derive_empty_state():
    d = server.derive({"starts": []})
    assert d["last_start"] is None and d["phase"] is None


def test_derive_ignores_malformed_dates():
    d = server.derive({"starts": ["not-a-date", "2026-04-01"]})
    assert d["recorded"] == 1
    assert d["last_start"] == "2026-04-01"
