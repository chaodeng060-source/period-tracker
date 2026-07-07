# period-tracker

极简自托管经期记录。一个 JSON 文件存数据、两个 API、一页前端——没有账号、没有云、没有广告、没有数据上报，你的身体数据只待在你自己的机器上。

## 功能

- 一键「经期来了」记录来潮起始日；点日历任意一天可补记 / 撤销
- 自动推导：平均周期、下次预计、当前周期第几天、当前相位（经期 / 卵泡 / 排卵 / 黄体 / 超期）
- 日历按相位着色（只标到今天为止，不预演未来）
- 同一次经期内手滑重复点击自动去重，不会算歪周期
- 数据就是一个 `period_state.json`，备份 = 复制一个文件

## 跑起来

```bash
pip install -r requirements.txt
python server.py
# 打开 http://127.0.0.1:8080
```

前端构建产物已带在 `static/` 里，克隆即用，不装 Node 也能跑。

## 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PERIOD_DATA` | `./period_state.json` | 数据文件路径 |
| `PERIOD_PORT` | `8080` | 端口 |
| `PERIOD_HOST` | `127.0.0.1` | 监听地址。要对外服务请自己套认证（反代 + Basic Auth 等） |

## API

```
GET  /api/period/state
     → {state: {starts: ["YYYY-MM-DD", ...], period_length: 5}, derived: {...}}

POST /api/period/log
     body: {action: "start" | "undo", date?: "YYYY-MM-DD"}   # date 省略 = 今天
     → 同上
```

`derived` 字段：`last_start` / `next_due` / `recorded` / `cycles` / `avg_cycle` / `period_length` / `day_of_cycle` / `days_until_next` / `phase`。

## 改前端

```bash
cd web
npm install
npm run dev      # 开发：5173 端口，API 代理到 :8080
npm run build    # 构建落到 ../static
```

## 测试

```bash
pip install pytest
pytest tests/
```

## 周期推导怎么算

- 平均周期 = 相邻两次来潮起始日间隔的均值；间隔 <15 天视为同一次经期的重复记录（去重），>60 天视为漏记一轮（不计入均值）
- 排卵日 ≈ 下次预计前 14 天，前后各留一天为排卵窗口
- 不足两次记录时按默认 28 天周期估算

> ⚠️ 预测仅供参考，不构成医疗建议；周期异常请咨询医生。

## License

MIT
