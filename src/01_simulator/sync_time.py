import json
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
STREAM_DIR = ROOT / "data" / "synthetic_cohort" / "wearable_streams"

def sync_streams_to_now():
    now = datetime.now()
    aligned_sec = (now.second // 15) * 15
    target_now = now.replace(second=aligned_sec, microsecond=0)
    print(f"[Sync] Aligning cohort streams to live time: {target_now}")

    count = 0
    for p in STREAM_DIR.glob("*_stream.csv"):
        try:
            df = pd.read_csv(p)
            if "timestamp" in df.columns and len(df) > 0:
                last_ts = datetime.strptime(str(df["timestamp"].iloc[-1]), "%Y-%m-%d %H:%M:%S")
                delta = target_now - last_ts
                df["timestamp"] = pd.to_datetime(df["timestamp"]) + delta
                df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
                df.to_csv(p, index=False)
                count += 1
                print(f"  [OK] {p.name}: {df['timestamp'].iloc[0]} -> {df['timestamp'].iloc[-1]}")
        except Exception as e:
            print(f"  [ERR] Failed {p.name}: {e}")

    print(f"[Sync] Successfully synchronized {count} stream files to {target_now}.\n")

if __name__ == "__main__":
    sync_streams_to_now()
