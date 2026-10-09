# RitaWapp Benchmarks & Performance (v1.0.1)

## 1. Benchmark Execution

Run benchmarks with:

```powershell
rwa bench
```

Results are saved to `Core/tests/bench-results/benchmarks.json`.

## 2. Measured Metrics

| Metric                                                | Value                     |
| ----------------------------------------------------- | ------------------------- |
| **JSON-RPC Protocol Framing Throughput**              | 532,694 ops/sec           |
| **In-Memory Keyset Pagination (50 pages x 100 rows)** | 187.91 ms                 |
| **Release Native Binary Size (`RitaWappApp.exe`)**    | 1.44 MB (1,513,452 bytes) |
| **Encrypted Container Size (`Rita.W.app`)**           | 1.39 KB (1,424 bytes)     |
| **Test Suite Execution Time**                         | 114 ms                    |
