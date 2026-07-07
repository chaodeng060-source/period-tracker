"""period-tracker · 极简自托管经期记录

一个 JSON 文件存数据、两个 API、一页前端。没有账号、没有云、没有广告，
数据完全在你自己手里。

    pip install -r requirements.txt
    python server.py            # http://127.0.0.1:8080

环境变量:
    PERIOD_DATA   数据文件路径 (默认 ./period_state.json)
    PERIOD_PORT   端口 (默认 8080)
    PERIOD_HOST   监听地址 (默认 127.0.0.1；对外服务自行加认证)
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("period")

ROOT = Path(__file__).resolve().parent
STATE_PATH = Path(os.environ.get("PERIOD_DATA", ROOT / "period_state.json"))

DEFAULT_CYCLE = 28    # 默认周期天数（不足两次来潮记录时用）
DEFAULT_LENGTH = 5    # 默认经期持续天数

app = FastAPI(title="period-tracker")


def load_state() -> dict:
    try:
        if STATE_PATH.exists():
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception as e:  # noqa: BLE001
        logger.info("load period state failed: %s", e)
    return {"starts": [], "period_length": DEFAULT_LENGTH}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def period_phase(day: int | None, cycle_len: int, period_length: int) -> str | None:
    """按 day_of_cycle 落四相位：经期 / 卵泡 / 排卵 / 黄体；超期标 late。"""
    if day is None or day < 1:
        return None
    ovulation = max(period_length + 1, cycle_len - 14)  # 排卵日≈下次前 14 天
    if day <= period_length:
        return "menstrual"
    if day < ovulation - 1:
        return "follicular"
    if day <= ovulation + 1:
        return "ovulation"
    if day <= cycle_len + 2:
        return "luteal"
    return "late"


def derive(state: dict) -> dict:
    starts = sorted({s for s in (state.get("starts") or []) if isinstance(s, str)})
    period_length = int(state.get("period_length") or DEFAULT_LENGTH)
    parsed = []
    for s in starts:
        try:
            parsed.append(dt.date.fromisoformat(s))
        except ValueError:
            continue
    # 相距 <15 天的起始日 = 同一次来潮的重复记录（手滑多点一次），
    # 并掉只留最早那天——否则假间隔会切断真实相邻对、把平均周期算歪。
    dedup: list = []
    for d in parsed:
        if dedup and (d - dedup[-1]).days < 15:
            continue
        dedup.append(d)
    parsed = dedup
    # 平均周期：相邻起始日差的均值，过滤异常区间（>60 = 漏记一轮），不足时用默认
    diffs = [(b - a).days for a, b in zip(parsed, parsed[1:]) if 15 <= (b - a).days <= 60]
    cycle_len = round(sum(diffs) / len(diffs)) if diffs else DEFAULT_CYCLE
    last_start = parsed[-1].isoformat() if parsed else None
    next_due = (parsed[-1] + dt.timedelta(days=cycle_len)).isoformat() if parsed else None
    today = dt.date.today()
    day_of_cycle = (today - parsed[-1]).days + 1 if parsed else None
    days_until_next = (dt.date.fromisoformat(next_due) - today).days if next_due else None
    return {
        "last_start": last_start,
        "next_due": next_due,
        "recorded": len(parsed),                  # 已记录的来潮次数
        "cycles": max(0, len(parsed) - 1),        # 已完整走完的周期数
        "avg_cycle": cycle_len,
        "period_length": period_length,
        "day_of_cycle": day_of_cycle,
        "days_until_next": days_until_next,
        "phase": period_phase(day_of_cycle, cycle_len, period_length),
    }


@app.get("/api/period/state")
async def period_state():
    state = load_state()
    return JSONResponse({"state": state, "derived": derive(state)})


@app.post("/api/period/log")
async def period_log(req: Request):
    """记录/撤销一次来潮起始日。body: {action:"start"|"undo", date?:"YYYY-MM-DD"}。
    date 省略=今天。「经期来了」按钮就是 POST {action:"start"}。"""
    try:
        body = await req.json()
    except Exception:  # noqa: BLE001
        body = {}
    body = body if isinstance(body, dict) else {}
    action = body.get("action", "start")
    date_str = body.get("date") or dt.date.today().isoformat()
    try:
        dt.date.fromisoformat(date_str)
    except (ValueError, TypeError):
        return JSONResponse({"error": "bad date"}, status_code=400)
    state = load_state()
    starts = {s for s in (state.get("starts") or []) if isinstance(s, str)}
    if action == "undo":
        starts.discard(date_str)
    else:
        starts.add(date_str)
    state["starts"] = sorted(starts)
    state.setdefault("period_length", DEFAULT_LENGTH)
    save_state(state)
    return JSONResponse({"state": state, "derived": derive(state)})


STATIC_DIR = ROOT / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def index():
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("PERIOD_HOST", "127.0.0.1"),
        port=int(os.environ.get("PERIOD_PORT", "8080")),
    )
